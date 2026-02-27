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
            // [FIX Bug-7] Ao depletar keg, zerar processedEvents
            txn.update(kegRef, {
              remainingMl: 0,
              status: 'depleted',
              depletedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
              processedEvents: [],
            });
            console.log(`[ERP:Wastage] Keg ${wastage.kegId} marked depleted (processedEvents cleared)`);
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

    // ── 2. Increment Tap.todayWastageMl (� FIX BUG-A2: transaction prevents TOCTOU) ──
    if (wastage.tapId) {
      const tapRef = db.doc(`${storePath}/taps/${wastage.tapId}`);
      try {
        await db.runTransaction(async (txn) => {
          const tapSnap = await txn.get(tapRef);
          const tapProcessed: string[] = tapSnap.exists ? (tapSnap.data()?.processedEvents || []) : [];
          if (tapProcessed.includes(eventId)) {
            console.log(`[ERP:Wastage] Event ${eventId} already processed for tap ${wastage.tapId} — skip`);
            return;
          }
          txn.set(tapRef, {
            todayWastageMl: increment(wastage.mlLost),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
            processedEvents: arrayUnion(eventId),
          }, { merge: true });
        });
      } catch (err) {
        console.error(`[ERP:Wastage] Error updating tap ${wastage.tapId}:`, err);
      }
    }

    // ── 3. Increment active TapAssignment.totalWastageMl ──────────────────
    // [FIX Bug-4 CF] Moved into a transaction for OCC safety.
    // Admin SDK supports txn.get(query), so we use that instead of db.collection().get().
    if (wastage.tapId) {
      try {
        await db.runTransaction(async (txn) => {
          const assignmentsQuery = db
            .collection(`${storePath}/tapAssignments`)
            .where('tapId', '==', wastage.tapId)
            .where('status', '==', 'active')
            .limit(1);
          const assignmentsSnap = await txn.get(assignmentsQuery);

          if (!assignmentsSnap.empty) {
            const assignmentRef = assignmentsSnap.docs[0].ref;
            txn.update(assignmentRef, {
              totalWastageMl: increment(wastage.mlLost),
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
            });
          }
        });
      } catch (err) {
        console.warn('[ERP:Wastage] Could not update TapAssignment:', err);
      }
    }


    console.log(`[ERP:Wastage] Done processing ${eventId}`);
  });
