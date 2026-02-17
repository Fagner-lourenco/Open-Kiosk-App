/**
 * ============================================================================
 * onWastageEventCreated — Cloud Function Trigger
 * ============================================================================
 *
 * Trigger: franchises/{franchiseId}/stores/{storeId}/wastageEvents/{eventId}
 * Tipo: onCreate
 *
 * Ao criar um WastageEvent (perda manual ou automática):
 *   1. Debita Keg.remainingMl (se kegId presente)
 *   2. Se Keg.remainingMl <= 0: marca status = 'depleted'
 *   3. Incrementa Tap.todayWastageMl
 *   4. Incrementa TapAssignment ativo: totalWastageMl
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, admin } from '../lib';

const increment = admin.firestore.FieldValue.increment;
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
const arrayUnion = admin.firestore.FieldValue.arrayUnion;

// ============================================================================
// TYPES
// ============================================================================

interface WastageEventData {
  id: string;
  type: string;
  tapId: string;
  kegId: string | null;
  mlLost: number;
  source: string;
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// TRIGGER
// ============================================================================

export const onWastageEventCreated = onDocumentCreated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/wastageEvents/{eventId}', region: 'southamerica-east1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const wastage = snap.data() as WastageEventData;
    const { franchiseId, storeId, eventId } = event.params;

    console.log(`[ERP:Wastage] onCreate: ${eventId} in ${franchiseId}/${storeId} — ${wastage.mlLost}ml ${wastage.type}`);

    if (!wastage.mlLost || wastage.mlLost <= 0) {
      console.warn('[ERP:Wastage] mlLost is 0 or missing — nothing to process');
      return;
    }

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const batch = db.batch();
    let needsBatch = false;

    // ── 1. Debit Keg.remainingMl (via transaction para prevent race condition) ──
    if (wastage.kegId) {
      const kegRef = db.doc(`${storePath}/kegs/${wastage.kegId}`);

      try {
        await db.runTransaction(async (txn) => {
          const kegSnap = await txn.get(kegRef);
          if (!kegSnap.exists) {
            console.warn(`[ERP:Wastage] Keg ${wastage.kegId} not found — skip debit`);
            return;
          }

          const kegData = kegSnap.data()!;

          // 🔧 FIX R9-05: Idempotência — verificar se este evento já foi processado
          const processedEvents: string[] = kegData.processedEvents || [];
          if (processedEvents.includes(eventId)) {
            console.warn(`[ERP:Wastage] Event ${eventId} already processed for keg ${wastage.kegId} — skip (idempotent)`);
            return;
          }

          const currentRemaining = (kegData.remainingMl as number) || 0;
          const newRemaining = currentRemaining - wastage.mlLost;

          if (newRemaining <= 0) {
            txn.update(kegRef, {
              remainingMl: 0,
              status: 'depleted',
              depletedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
              processedEvents: arrayUnion(eventId),
            });
            console.log(`[ERP:Wastage] Keg ${wastage.kegId} marked depleted`);
          } else {
            txn.update(kegRef, {
              remainingMl: newRemaining,
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
              processedEvents: arrayUnion(eventId),
            });
          }
        });
      } catch (err) {
        console.error(`[ERP:Wastage] Error debiting keg ${wastage.kegId}:`, err);
      }
    }

    // ── 2. Increment Tap.todayWastageMl ───────────────────────────────────
    if (wastage.tapId) {
      const tapRef = db.doc(`${storePath}/taps/${wastage.tapId}`);
      batch.set(tapRef, {
        todayWastageMl: increment(wastage.mlLost),
        updatedAt: serverTimestamp(),
        updatedBy: 'system',
      }, { merge: true });
      needsBatch = true;
    }

    // ── 3. Increment active TapAssignment.totalWastageMl ──────────────────
    if (wastage.tapId) {
      try {
        const assignmentsSnap = await db
          .collection(`${storePath}/tapAssignments`)
          .where('tapId', '==', wastage.tapId)
          .where('status', '==', 'active')
          .limit(1)
          .get();

        if (!assignmentsSnap.empty) {
          const assignmentRef = assignmentsSnap.docs[0].ref;
          batch.update(assignmentRef, {
            totalWastageMl: increment(wastage.mlLost),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          });
        }
      } catch (err) {
        console.warn('[ERP:Wastage] Could not update TapAssignment:', err);
      }
    }

    // ── 4. Commit batch ───────────────────────────────────────────────────
    if (needsBatch) {
      await batch.commit();
      console.log(`[ERP:Wastage] Batch committed for ${eventId}`);
    }

    console.log(`[ERP:Wastage] Done processing ${eventId}`);
  });
