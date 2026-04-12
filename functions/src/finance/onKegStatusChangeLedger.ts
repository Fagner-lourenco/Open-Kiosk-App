/**
 * ============================================================================
 * onKegStatusChangeLedger — Cloud Function Trigger
 * ============================================================================
 *
 * Trigger: franchises/{franchiseId}/stores/{storeId}/kegs/{kegId}
 * Tipo: onDocumentUpdated
 *
 * Quando o status de um barril muda para 'tapped' (conectado à torneira):
 *   1. Registra custo integral do barril como despesa (direction='out')
 *   2. sourceType='keg_event', sourceId=kegId
 *   3. Idempotência via query sourceType + sourceId
 *
 * Se keg.cost não estiver definido, usa fallback: volumeMl * DEFAULT_COST_PER_ML.
 * Se o custo final for <= 0, não cria entrada.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
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

interface KegData {
  kegId?: string;
  productId: string;
  supplierId?: string;
  volumeMl: number;
  remainingMl: number;
  status: string;
  tapIds?: string[];
  tapId?: string | null; // legacy compat
  cost?: number;
  costPerMl?: number;
  tappedAt?: admin.firestore.Timestamp | null;
  batchCode?: string;
  createdAt?: admin.firestore.Timestamp;
}

// ============================================================================
// TRIGGER
// ============================================================================

export const onKegStatusChangeLedger = onDocumentUpdated(
  {
    document: 'franchises/{franchiseId}/stores/{storeId}/kegs/{kegId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!beforeSnap || !afterSnap) return;

    const before = beforeSnap.data() as KegData;
    const after = afterSnap.data() as KegData;
    const { franchiseId, storeId, kegId } = event.params;

    // Only fires when status changes to 'tapped'
    if (before.status === after.status) return;
    if (after.status !== 'tapped') return;

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const ledgerCol = db.collection(`${storePath}/finLedger`);

    // Idempotency: one ledger entry per keg connection
    const existing = await ledgerCol
      .where('sourceType', '==', 'keg_event')
      .where('sourceId', '==', kegId)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log(`[Finance:Keg] Ledger already exists for keg ${kegId} — skip`);
      return;
    }

    // ── Calculate keg cost ──────────────────────────────────────────────
    let amount = 0;

    if (after.cost && after.cost > 0) {
      amount = after.cost;
    } else if (after.costPerMl && after.costPerMl > 0 && after.volumeMl > 0) {
      amount = after.costPerMl * after.volumeMl;
    } else if (after.volumeMl > 0) {
      amount = after.volumeMl * DEFAULT_COST_PER_ML;
    }

    amount = Math.round(amount * 100) / 100;

    if (amount <= 0) {
      console.log(`[Finance:Keg] Keg ${kegId} cost=0 — skip`);
      return;
    }

    // ── Find default expense account & category ─────────────────────────
    const accountsSnap = await db
      .collection(`${storePath}/finAccounts`)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (accountsSnap.empty) {
      console.warn(`[Finance:Keg] No active finAccounts for store ${storeId} — skip`);
      return;
    }

    const categoriesSnap = await db
      .collection(`${storePath}/finCategories`)
      .where('direction', '==', 'out')
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (categoriesSnap.empty) {
      console.warn(`[Finance:Keg] No active expense finCategory for store ${storeId} — skip`);
      return;
    }

    const accountId = accountsSnap.docs[0].id;
    const categoryId = categoriesSnap.docs[0].id;

    const tappedDate = after.tappedAt || admin.firestore.Timestamp.now();
    const connectedTaps = Array.isArray(after.tapIds) ? after.tapIds : (after.tapId ? [after.tapId] : []);
    const tapLabel = connectedTaps.length > 0 ? ` (tap ${connectedTaps.join(', ')})` : '';
    const batchLabel = after.batchCode ? ` lote ${after.batchCode}` : '';

    const ref = ledgerCol.doc();
    await ref.set({
      direction: 'out',
      status: 'paid',
      competenceDate: tappedDate,
      cashDate: tappedDate,
      amount,
      accountId,
      categoryId,
      costCenterId: null,
      partyId: after.supplierId || null,
      method: 'transfer',
      sourceType: 'keg_event',
      sourceId: kegId,
      description: `Barril conectado${tapLabel}${batchLabel} — ${after.volumeMl}ml — R$ ${amount.toFixed(2)}`,
      attachments: [],
      createdBy: 'system',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(
      `[Finance:Keg] Created ledger ${ref.id} for keg ${kegId} — R$ ${amount} (${after.volumeMl}ml)`,
    );
  },
);
