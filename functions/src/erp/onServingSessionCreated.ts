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

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, admin } from '../lib';

const increment = admin.firestore.FieldValue.increment;
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
const arrayUnion = admin.firestore.FieldValue.arrayUnion;

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

export const onServingSessionCreated = onDocumentCreated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/servingSessions/{eventId}', region: 'southamerica-east1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const session = snap.data() as ServingSessionData;
    const { franchiseId, storeId, eventId } = event.params;

    console.log(`[ERP:ServingSession] onCreate: ${eventId} in ${franchiseId}/${storeId}`);

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const batch = db.batch();
    let needsBatch = false;

    // ── 1. Debit Keg.remainingMl (via transaction para prevent race condition) ──
    if (session.kegId) {
      const kegRef = db.doc(`${storePath}/kegs/${session.kegId}`);

      try {
        const kegDepleted = await db.runTransaction(async (txn) => {
          const kegSnap = await txn.get(kegRef);
          if (!kegSnap.exists) {
            console.warn(`[ERP:ServingSession] Keg ${session.kegId} not found — skip debit`);
            return false;
          }

          const kegData = kegSnap.data()!;

          // 🔧 FIX R9-05: Idempotência — verificar se este evento já foi processado
          const processedEvents: string[] = kegData.processedEvents || [];
          if (processedEvents.includes(eventId)) {
            console.warn(`[ERP:ServingSession] Event ${eventId} already processed for keg ${session.kegId} — skip (idempotent)`);
            return false;
          }

          const currentRemaining = (kegData.remainingMl as number) || 0;
          const newRemaining = currentRemaining - session.actualMl;

          if (newRemaining <= 0) {
            // [FIX Bug-7] Ao depletar keg, zerar processedEvents — array de idempotência
            // não tem valor após o keg ser finalizado e evita crescimento ilimitado.
            txn.update(kegRef, {
              remainingMl: 0,
              status: 'depleted',
              depletedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
              processedEvents: [],
            });
            console.log(`[ERP:ServingSession] Keg ${session.kegId} marked depleted (processedEvents cleared)`);
            return true;
          } else {
            txn.update(kegRef, {
              remainingMl: newRemaining,
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
              processedEvents: arrayUnion(eventId),
            });
            return false;
          }
        });

        // [FIX BUG-OP-2] Quando keg esgota, limpar referência em TODOS os taps conectados
        if (kegDepleted && session.kegId) {
          const kegSnap2 = await kegRef.get();
          const kegData2 = kegSnap2.data();
          // Multi-tap: read tapIds (new) or tapId (legacy) to find all connected taps
          const connectedTapIds: string[] = Array.isArray(kegData2?.tapIds)
            ? kegData2!.tapIds
            : (kegData2?.tapId ? [kegData2.tapId as string] : (session.tapId ? [session.tapId] : []));

          for (const tid of connectedTapIds) {
            const depTapRef = db.doc(`${storePath}/taps/${tid}`);
            batch.update(depTapRef, {
              currentKegId: null,
              status: 'idle',
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
            });
            needsBatch = true;
          }

          // Also ensure the triggering tap is cleared even if not in tapIds
          if (session.tapId && !connectedTapIds.includes(session.tapId)) {
            const depTapRef = db.doc(`${storePath}/taps/${session.tapId}`);
            batch.update(depTapRef, {
              currentKegId: null,
              status: 'idle',
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
            });
            needsBatch = true;
          }

          // Clear tapIds on the keg
          batch.update(kegRef, {
            tapIds: [],
            updatedAt: serverTimestamp(),
          });
          needsBatch = true;
        }

        // Create depletion notification outside transaction
        if (kegDepleted) {
          const kegSnap = await kegRef.get();
          const kegData = kegSnap.data();
          const batchCode = (kegData?.batchCode as string) || session.kegId!.slice(0, 8);
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
            needsBatch = true;
          }
        }
      } catch (err) {
        console.error(`[ERP:ServingSession] Error debiting keg ${session.kegId}:`, err);
      }
    }

    // ── 2. Increment Tap counters ──────────────────────────────────────────
    // 🔒 FIX Bug-17: Wrap tap counter update in its own transaction.
    // The previous pattern read tapSnap outside the batch and checked processedEvents,
    // but two concurrent invocations could both pass the check before either committed.
    // Using runTransaction ensures OCC: the second invocation retries and sees the
    // first's processedEvents write, then skips (idempotent).
    const tapRef = db.doc(`${storePath}/taps/${session.tapId}`);
    try {
      await db.runTransaction(async (txn) => {
        const tapSnap = await txn.get(tapRef);
        const tapProcessed: string[] = tapSnap.exists ? (tapSnap.data()?.processedEvents || []) : [];
        if (tapProcessed.includes(eventId)) {
          console.log(`[ERP:ServingSession] Event ${eventId} already processed for tap ${session.tapId} — skip`);
          return;
        }

        txn.set(tapRef, {
          todayMlDispensed: increment(session.actualMl),
          todaySessions: increment(1),
          updatedAt: serverTimestamp(),
          updatedBy: 'system',
          processedEvents: arrayUnion(eventId),
        }, { merge: true });

        // [FIX Bug-4 CF] Admin SDK supports transactional queries via txn.get(query).
        // Previously db.collection().get() was used outside txn, missing OCC guarantees.
        const assignmentsQuery = db
          .collection(`${storePath}/tapAssignments`)
          .where('tapId', '==', session.tapId)
          .where('status', '==', 'active')
          .limit(1);
        const assignmentsSnap = await txn.get(assignmentsQuery);

        if (!assignmentsSnap.empty) {
          const assignmentRef = assignmentsSnap.docs[0].ref;
          txn.update(assignmentRef, {
            totalMlDispensed: increment(session.actualMl),
            totalSessions: increment(1),
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          });
        }
      });
    } catch (err) {
      console.error(`[ERP:ServingSession] Error updating tap counters for ${session.tapId}:`, err);
    }

    // ── 3. Commit batch (notifications only) ────────────────────────────
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
      const wastageRef = db.doc(`${storePath}/wastageEvents/overpour_${eventId}`);
      await wastageRef.set({
        id: wastageRef.id,
        type: 'auto',
        tapId: session.tapId,
        kegId: null, // 🔧 FIX R12-01: Não passar kegId — barril já foi debitado pelo actualMl completo no step 1
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
