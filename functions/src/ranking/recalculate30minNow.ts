import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, admin } from '../lib';
import { maskName, getCustomerId, calcTotalMl, calcFavoriteDrink } from './helpers';

interface RecalcInput {
  franchiseId: string;
  storeId: string;
}

export const recalculateRanking30minNow = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as RecalcInput;
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = request.auth.uid;
    const { franchiseId, storeId } = data || ({} as RecalcInput);
    if (!franchiseId || !storeId) {
      throw new HttpsError('invalid-argument', 'Parâmetros inválidos');
    }

    // Permissões: superadmin, owner, admin, manager
    const callerClaims = request.auth.token || {};
    if (callerClaims.role !== 'superadmin') {
      const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
      if (!franchiseDoc.exists) {
        throw new HttpsError('not-found', 'Franquia não encontrada');
      }
      const fdata = franchiseDoc.data() || {};
      if (fdata.ownerId !== uid) {
        const memberSnap = await db.collection(`franchises/${franchiseId}/members`).doc(uid).get();
        if (!memberSnap.exists) {
          throw new HttpsError('permission-denied', 'Sem permissão para recalc');
        }
        const memberData = memberSnap.data() || {};
        const role = memberData.role;
        // P1-25: Rejeitar membros inativos
        if (memberData.isActive === false) {
          throw new HttpsError('permission-denied', 'Membro desativado');
        }
        if (!['owner', 'admin', 'manager'].includes(role)) {
          throw new HttpsError('permission-denied', 'Role insuficiente');
        }
      }
    }

    try {
      const now = new Date();
      const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const storePath = `franchises/${franchiseId}/stores/${storeId}`;

      const statuses = ['completed', 'paid_pending_dispense', 'dispensing'];

      const allTodaySnap = await db.collection(`${storePath}/orders`)
        .where('date', '==', today)
        .get();

      const totalMap = new Map<string, {
        customerId: string;
        displayName: string;
        totalMl: number;
        totalSpent: number;
        orderCount: number;
        favoriteDrink: string;
        lastOrderAt: admin.firestore.Timestamp;
      }>();

      const ml30m = new Map<string, number>();

      // P1-24: Skip orders with invalid paymentStatus
      const invalidPaymentStatuses = ['failed', 'canceled', 'cancelled', 'refunded', 'expired'];

      for (const docSnap of allTodaySnap.docs) {
        const order = docSnap.data() as any;
        if (!order?.customerName || !statuses.includes(order?.status)) continue;
        if (order.paymentStatus && invalidPaymentStatuses.includes(order.paymentStatus)) continue;

        const customerId = getCustomerId(order);
        const totalMl = calcTotalMl(order.items || []);
        const totalSpent = Number(order.total || 0);
        const orderTs = order.timestamp || admin.firestore.Timestamp.now();
        const fav = calcFavoriteDrink(order.items || []);

        const prev = totalMap.get(customerId);
        if (!prev) {
          totalMap.set(customerId, {
            customerId,
            displayName: maskName(String(order.customerName || 'Anônimo')),
            totalMl,
            totalSpent,
            orderCount: 1,
            favoriteDrink: fav,
            lastOrderAt: orderTs,
          });
        } else {
          prev.totalMl += totalMl;
          prev.totalSpent += totalSpent;
          prev.orderCount += 1;
          if (orderTs.toMillis() > prev.lastOrderAt.toMillis()) {
            prev.lastOrderAt = orderTs;
            prev.displayName = maskName(String(order.customerName || prev.displayName));
            prev.favoriteDrink = fav || prev.favoriteDrink;
          }
          totalMap.set(customerId, prev);
        }
      }

      for (const docSnap of allTodaySnap.docs) {
        const order = docSnap.data() as any;
        if (!order?.customerName || !statuses.includes(order?.status)) continue;
        if (order.paymentStatus && invalidPaymentStatuses.includes(order.paymentStatus)) continue;
        const orderTs = order.timestamp;
        if (!orderTs || typeof orderTs.toMillis !== 'function' || orderTs.toMillis() < since.toMillis()) {
          continue;
        }
        const customerId = getCustomerId(order);
        const totalMl = calcTotalMl(order.items || []);
        ml30m.set(customerId, (ml30m.get(customerId) || 0) + totalMl);
      }

      const rankingCol = db.collection(`${storePath}/rankingAgg`);
      const existingTodaySnap = await rankingCol.where('date', '==', today).get();
      const newIds = new Set(Array.from(totalMap.keys()));

      // Preparar operações de batch (chunking para evitar limite de 500 do Firestore)
      const BATCH_LIMIT = 499;
      let currentBatch = db.batch();
      let opsInBatch = 0;
      let changed = 0;

      const addToBatch = (op: (b: FirebaseFirestore.WriteBatch) => void) => {
        if (opsInBatch >= BATCH_LIMIT) {
          // commit será feito depois; guardar batches pendentes
          pendingBatches.push(currentBatch);
          currentBatch = db.batch();
          opsInBatch = 0;
        }
        op(currentBatch);
        opsInBatch++;
      };
      const pendingBatches: FirebaseFirestore.WriteBatch[] = [];

      for (const [customerId, data] of totalMap.entries()) {
        const docRef = rankingCol.doc(customerId);
        addToBatch((batch) => {
          batch.set(docRef, {
            customerId: data.customerId,
            displayName: data.displayName,
            totalMl: data.totalMl,
            totalMl30min: ml30m.get(customerId) || 0,
            totalSpent: data.totalSpent,
            orderCount: data.orderCount,
            favoriteDrink: data.favoriteDrink,
            lastOrderAt: data.lastOrderAt,
            date: today,
          }, { merge: true });
        });
        changed++;
      }

      for (const docSnap of existingTodaySnap.docs) {
        if (!newIds.has(docSnap.id)) {
          addToBatch((batch) => { batch.delete(docSnap.ref); });
          changed++;
        }
      }

      const totalMlAll = Array.from(totalMap.values()).reduce((sum, c) => sum + c.totalMl, 0);
      const totalServes = Array.from(totalMap.values()).reduce((sum, c) => sum + c.orderCount, 0);
      const uniqueCustomers = totalMap.size;

      const eventStatsRef = db.doc(`${storePath}/eventStats/current`);
      addToBatch((batch) => {
        batch.set(eventStatsRef, {
          totalMl: totalMlAll,
          totalServes,
          uniqueCustomers,
          date: today,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      // Commit all pending batches + current
      for (const pb of pendingBatches) {
        await pb.commit();
      }
      if (opsInBatch > 0) {
        await currentBatch.commit();
      }

      return { success: true, rebuilt: true, customers: uniqueCustomers, updated: changed };
    } catch (err: any) {
      console.error('[recalculateRanking30minNow] error:', err);
      throw new HttpsError('internal', err?.message || 'Erro interno');
    }
  });
