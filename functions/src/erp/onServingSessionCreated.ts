/**
 * ============================================================================
 * onServingSessionCreated — Cloud Function Trigger
 * ============================================================================
 *
 * Trigger: franchises/{franchiseId}/stores/{storeId}/servingSessions/{eventId}
 * Tipo: onCreate
 *
 * Ao criar um ServingSession (evento imutável de dispensação):
 *   1. Debita Keg.remainingMl (se kegId presente)
 *   2. Se Keg.remainingMl <= 0: marca status = 'depleted'
 *   3. Incrementa Tap.todayMlDispensed e Tap.todaySessions
 *   4. Incrementa TapAssignment ativo: totalMlDispensed e totalSessions
 *   5. Se actualMl > targetMl * 1.30: cria WastageEvent automático (over-pour)
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

interface ServingSessionData {
  eventId: string;
  orderId: string;
  tapId: string;
  kegId: string | null;
  productId?: string | null;
  cupIndex: number;
  targetMl: number;
  actualMl: number;
  status: string;
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// TRIGGER
// ============================================================================

export const onServingSessionCreated = functions
  .region('southamerica-east1')
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/servingSessions/{eventId}')
  .onCreate(async (snap, context) => {
    const session = snap.data() as ServingSessionData;
    const { franchiseId, storeId, eventId } = context.params;

    console.log(`[ERP:ServingSession] onCreate: ${eventId} in ${franchiseId}/${storeId}`);

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const batch = db.batch();
    let needsBatch = false;

    // ── 1. Debit Keg.remainingMl ──────────────────────────────────────────
    if (session.kegId) {
      const kegRef = db.doc(`${storePath}/kegs/${session.kegId}`);
      const kegSnap = await kegRef.get();

      if (kegSnap.exists) {
        const kegData = kegSnap.data()!;
        const currentRemaining = (kegData.remainingMl as number) || 0;
        const newRemaining = currentRemaining - session.actualMl;

        if (newRemaining <= 0) {
          // Keg depleted
          batch.update(kegRef, {
            remainingMl: 0,
            status: 'depleted',
            depletedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          });

          // Create real-time notification for keg depletion
          const batchCode = (kegData.batchCode as string) || session.kegId!.slice(0, 8);
          const dedupeKey = `keg_depleted_${session.kegId}`;
          const existingSnap = await db.collection(`franchises/${franchiseId}/notifications`)
            .where('dedupeKey', '==', dedupeKey).limit(1).get();
          if (existingSnap.empty) {
            const notifRef = db.collection(`franchises/${franchiseId}/notifications`).doc();
            batch.set(notifRef, {
              id: notifRef.id,
              type: 'stock',
              priority: 'critical',
              title: 'Barril Esgotado',
              message: `Barril ${batchCode} foi totalmente consumido — necessário substituir`,
              isRead: false,
              isDismissed: false,
              createdAt: serverTimestamp(),
              readAt: null,
              entityRef: `kegs/${session.kegId}`,
              storeId,
              franchiseId,
              dedupeKey,
              actionUrl: `/stores/${storeId}?tab=operations`,
              actionLabel: 'Ver Operações',
            });
          }

          console.log(`[ERP:ServingSession] Keg ${session.kegId} marked depleted`);
        } else {
          batch.update(kegRef, {
            remainingMl: increment(-session.actualMl),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          });
        }
        needsBatch = true;
      } else {
        console.warn(`[ERP:ServingSession] Keg ${session.kegId} not found — skip debit`);
      }
    }

    // ── 2. Increment Tap counters ─────────────────────────────────────────
    const tapRef = db.doc(`${storePath}/taps/${session.tapId}`);
    batch.set(tapRef, {
      todayMlDispensed: increment(session.actualMl),
      todaySessions: increment(1),
      updatedAt: serverTimestamp(),
      updatedBy: 'system',
    }, { merge: true });
    needsBatch = true;

    // ── 3. Increment active TapAssignment ─────────────────────────────────
    try {
      const assignmentsSnap = await db
        .collection(`${storePath}/tapAssignments`)
        .where('tapId', '==', session.tapId)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!assignmentsSnap.empty) {
        const assignmentRef = assignmentsSnap.docs[0].ref;
        batch.update(assignmentRef, {
          totalMlDispensed: increment(session.actualMl),
          totalSessions: increment(1),
          updatedAt: serverTimestamp(),
          updatedBy: 'system',
        });
      }
    } catch (err) {
      console.warn('[ERP:ServingSession] Could not update TapAssignment:', err);
    }

    // ── 4. Commit batch ───────────────────────────────────────────────────
    if (needsBatch) {
      await batch.commit();
      console.log(`[ERP:ServingSession] Batch committed for ${eventId}`);
    }

    // ── 5. Auto-create WastageEvent for over-pour (> 30% over target) ────
    if (
      session.targetMl > 0 &&
      session.actualMl > session.targetMl * 1.30 &&
      session.status === 'completed'
    ) {
      const overPourMl = Math.round(session.actualMl - session.targetMl);
      const wastageRef = db.collection(`${storePath}/wastageEvents`).doc();
      await wastageRef.set({
        id: wastageRef.id,
        type: 'auto',
        tapId: session.tapId,
        kegId: session.kegId || null,
        mlLost: overPourMl,
        reason: `Over-pour: ${session.actualMl}ml dispensed vs ${session.targetMl}ml target (session ${eventId})`,
        source: 'auto',
        createdAt: serverTimestamp(),
        createdBy: 'system',
        franchiseId,
        storeId,
      });
      console.log(`[ERP:ServingSession] Auto WastageEvent created: ${overPourMl}ml over-pour`);
    }

    console.log(`[ERP:ServingSession] Done processing ${eventId}`);
  });
