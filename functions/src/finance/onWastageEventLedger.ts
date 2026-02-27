/**
 * ============================================================================
 * onWastageEventLedger — Cloud Function Trigger
 * ============================================================================
 *
 * Trigger: franchises/{franchiseId}/stores/{storeId}/wastageEvents/{eventId}
 * Tipo: onCreate
 *
 * Ao criar um WastageEvent:
 *   1. Busca o custo do barril (keg.cost, keg.volumeMl) para calcular custo proporcional
 *   2. Cria LedgerEntry com direction='out', sourceType='wastage'
 *   3. sourceId = eventId para idempotência
 *
 * Se o barril não tem custo (keg.cost == 0 ou undefined), aplica custo fixo R$ 0,05/ml.
 * Se mlLost <= 0, ignora.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Fallback cost per ml when keg has no cost info */
const DEFAULT_COST_PER_ML = 0.05;

// ============================================================================
// TYPES
// ============================================================================

interface WastageEventData {
  type: string;
  tapId: string;
  kegId: string | null;
  mlLost: number;
  reason?: string;
  source: string;
  createdAt?: admin.firestore.Timestamp;
}

// ============================================================================
// TRIGGER
// ============================================================================

export const onWastageEventLedger = onDocumentCreated(
  {
    document: 'franchises/{franchiseId}/stores/{storeId}/wastageEvents/{eventId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const wastage = snap.data() as WastageEventData;
    const { franchiseId, storeId, eventId } = event.params;

    if (!wastage.mlLost || wastage.mlLost <= 0) {
      console.log(`[Finance:Wastage] mlLost=0 for ${eventId} — skip`);
      return;
    }

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    // Idempotency: check if entry already exists
    const existing = await db
      .collection(`${storePath}/finLedger`)
      .where('sourceType', '==', 'wastage')
      .where('sourceId', '==', eventId)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log(`[Finance:Wastage] Ledger entry already exists for wastage ${eventId} — skip`);
      return;
    }

    // ── Calculate cost ────────────────────────────────────────────────────
    let costPerMl = DEFAULT_COST_PER_ML;

    if (wastage.kegId) {
      const kegSnap = await db.doc(`${storePath}/kegs/${wastage.kegId}`).get();
      if (kegSnap.exists) {
        const keg = kegSnap.data()!;
        if (keg.cost && keg.cost > 0 && keg.volumeMl && keg.volumeMl > 0) {
          costPerMl = keg.cost / keg.volumeMl;
        }
      }
    }

    const amount = Math.round(wastage.mlLost * costPerMl * 100) / 100;
    if (amount <= 0) {
      console.log(`[Finance:Wastage] Calculated cost R$ 0 for ${eventId} — skip`);
      return;
    }

    // ── Find default expense account & category ──────────────────────────
    const accountsSnap = await db
      .collection(`${storePath}/finAccounts`)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (accountsSnap.empty) {
      console.warn(`[Finance:Wastage] No active finAccounts — skip ledger`);
      return;
    }

    const categoriesSnap = await db
      .collection(`${storePath}/finCategories`)
      .where('direction', '==', 'out')
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (categoriesSnap.empty) {
      console.warn(`[Finance:Wastage] No active expense finCategory — skip ledger`);
      return;
    }

    const accountId = accountsSnap.docs[0].id;
    const categoryId = categoriesSnap.docs[0].id;

    const typeLabel: Record<string, string> = {
      foam: 'Espuma',
      purge: 'Purga',
      spill: 'Derramamento',
      auto: 'Automático',
      other: 'Outro',
    };

    const ledgerRef = db.collection(`${storePath}/finLedger`).doc();
    await ledgerRef.set({
      direction: 'out',
      status: 'paid',
      competenceDate: wastage.createdAt || admin.firestore.Timestamp.now(),
      cashDate: wastage.createdAt || admin.firestore.Timestamp.now(),
      amount,
      accountId,
      categoryId,
      costCenterId: null,
      partyId: null,
      method: 'cash',
      sourceType: 'wastage',
      sourceId: eventId,
      description: `Perda: ${typeLabel[wastage.type] || wastage.type} — ${wastage.mlLost}ml (tap ${wastage.tapId})`,
      attachments: [],
      createdBy: 'system',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(
      `[Finance:Wastage] Created ledger entry ${ledgerRef.id} for wastage ${eventId} — R$ ${amount} (${wastage.mlLost}ml)`,
    );
  },
);
