import * as functions from 'firebase-functions';
import { db, admin } from '../lib';
import { maskName, getCustomerId, calcTotalMl, calcFavoriteDrink } from './helpers';

interface RecalcInput {
  franchiseId: string;
  storeId: string;
}

export const recalculateRanking30minNow = functions
  .region('southamerica-east1')
  .https.onCall(async (data: RecalcInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = context.auth.uid;
    const { franchiseId, storeId } = data || ({} as RecalcInput);
    if (!franchiseId || !storeId) {
      throw new functions.https.HttpsError('invalid-argument', 'Parâmetros inválidos');
    }

    // Permissões: superadmin, owner, admin, manager
    const callerClaims = context.auth.token || {};
    if (callerClaims.role !== 'superadmin') {
      const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
      if (!franchiseDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Franquia não encontrada');
      }
      const fdata = franchiseDoc.data() || {};
      if (fdata.ownerId !== uid) {
        const memberSnap = await db.collection(`franchises/${franchiseId}/members`).doc(uid).get();
        if (!memberSnap.exists) {
          throw new functions.https.HttpsError('permission-denied', 'Sem permissão para recalc');
        }
        const role = (memberSnap.data() || {}).role;
        if (!['owner', 'admin', 'manager'].includes(role)) {
          throw new functions.https.HttpsError('permission-denied', 'Role insuficiente');
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

      for (const docSnap of allTodaySnap.docs) {
        const order = docSnap.data() as any;
        if (!order?.customerName || !statuses.includes(order?.status)) continue;

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

      const batch = db.batch();
      let changed = 0;

      for (const [customerId, data] of totalMap.entries()) {
        const docRef = rankingCol.doc(customerId);
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
        changed++;
      }

      for (const docSnap of existingTodaySnap.docs) {
        if (!newIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          changed++;
        }
      }

      const totalMlAll = Array.from(totalMap.values()).reduce((sum, c) => sum + c.totalMl, 0);
      const totalServes = Array.from(totalMap.values()).reduce((sum, c) => sum + c.orderCount, 0);
      const uniqueCustomers = totalMap.size;

      const eventStatsRef = db.doc(`${storePath}/eventStats/current`);
      batch.set(eventStatsRef, {
        totalMl: totalMlAll,
        totalServes,
        uniqueCustomers,
        date: today,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      return { success: true, rebuilt: true, customers: uniqueCustomers, updated: changed };
    } catch (err: any) {
      console.error('[recalculateRanking30minNow] error:', err);
      throw new functions.https.HttpsError('internal', err?.message || 'Erro interno');
    }
  });
