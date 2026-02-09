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

import * as functions from 'firebase-functions';
import { db, admin } from '../lib';

const increment = admin.firestore.FieldValue.increment;
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

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

export const onWastageEventCreated = functions
  .region('southamerica-east1')
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/wastageEvents/{eventId}')
  .onCreate(async (snap, context) => {
    const wastage = snap.data() as WastageEventData;
    const { franchiseId, storeId, eventId } = context.params;

    console.log(`[ERP:Wastage] onCreate: ${eventId} in ${franchiseId}/${storeId} — ${wastage.mlLost}ml ${wastage.type}`);

    if (!wastage.mlLost || wastage.mlLost <= 0) {
      console.warn('[ERP:Wastage] mlLost is 0 or missing — nothing to process');
      return;
    }

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const batch = db.batch();
    let needsBatch = false;

    // ── 1. Debit Keg.remainingMl ──────────────────────────────────────────
    if (wastage.kegId) {
      const kegRef = db.doc(`${storePath}/kegs/${wastage.kegId}`);
      const kegSnap = await kegRef.get();

      if (kegSnap.exists) {
        const kegData = kegSnap.data()!;
        const currentRemaining = (kegData.remainingMl as number) || 0;
        const newRemaining = currentRemaining - wastage.mlLost;

        if (newRemaining <= 0) {
          batch.update(kegRef, {
            remainingMl: 0,
            status: 'depleted',
            depletedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          });
          console.log(`[ERP:Wastage] Keg ${wastage.kegId} marked depleted`);
        } else {
          batch.update(kegRef, {
            remainingMl: increment(-wastage.mlLost),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          });
        }
        needsBatch = true;
      } else {
        console.warn(`[ERP:Wastage] Keg ${wastage.kegId} not found — skip debit`);
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
