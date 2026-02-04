/**
 * ============================================================================
 * getMetricsAdmin - Callable fallback for Admin metrics
 * ============================================================================
 *
 * Retorna métricas agregadas quando a leitura direta falha por permissão.
 * Usa dailyStats/metrics materializados para evitar queries pesadas.
 */

import * as functions from 'firebase-functions';
import { db } from '../lib';

interface GetMetricsAdminInput {
  franchiseId: string;
  storeId?: string;
  startDate?: string;
  endDate?: string;
}

interface DailyMetrics {
  date: string;
  revenue: number;
  orders: number;
  paidOrders: number;
  cancelledOrders?: number;
  pendingOrders?: number;
  averageTicket: number;
  paymentMethods?: Record<string, { count: number; revenue: number }>;
  lastUpdate?: Date | null;
}

function normalizeDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

async function assertCanRead(franchiseId: string, uid: string, role?: string) {
  const isSuperAdmin = role === 'superadmin' || (await db.collection('superadmins').doc(uid).get()).exists;
  if (isSuperAdmin) return;

  const franchiseDoc = await db.doc(`franchises/${franchiseId}`).get();
  const isOwner = franchiseDoc.exists && franchiseDoc.data()?.ownerId === uid;
  if (isOwner) return;

  const memberDoc = await db.doc(`franchises/${franchiseId}/members/${uid}`).get();
  if (!memberDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Sem permissão para acessar métricas desta franquia');
  }

  const member = memberDoc.data() || {};
  if (member.isActive === false) {
    throw new functions.https.HttpsError('permission-denied', 'Membro inativo');
  }
}

async function aggregateDailyStats(
  franchiseId: string,
  storeId: string,
  startKey: string,
  endKey: string
): Promise<DailyMetrics | null> {
  const statsRef = db.collection(`franchises/${franchiseId}/stores/${storeId}/dailyStats`);

  const snapshot = await statsRef
    .where('date', '>=', startKey)
    .where('date', '<=', endKey)
    .orderBy('date', 'asc')
    .get();

  if (snapshot.empty) return null;

  const aggregated: DailyMetrics = {
    date: endKey,
    revenue: 0,
    orders: 0,
    paidOrders: 0,
    cancelledOrders: 0,
    pendingOrders: 0,
    averageTicket: 0,
    paymentMethods: {},
    lastUpdate: null,
  };

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    aggregated.revenue += data.totalRevenue || 0;
    aggregated.orders += data.totalOrders || 0;
    aggregated.paidOrders += data.completedOrders || 0;
    aggregated.cancelledOrders! += data.cancelledOrders || 0;
    aggregated.pendingOrders! += data.pendingOrders || 0;

    const methods = data.paymentMethods || {};
    Object.entries(methods).forEach(([method, payload]) => {
      const entry = payload as { count?: number; revenue?: number };
      const current = aggregated.paymentMethods?.[method] || { count: 0, revenue: 0 };
      aggregated.paymentMethods![method] = {
        count: current.count + (entry.count || 0),
        revenue: current.revenue + (entry.revenue || 0),
      };
    });
  });

  aggregated.averageTicket = aggregated.orders > 0 ? aggregated.revenue / aggregated.orders : 0;
  return aggregated;
}

export const getMetricsAdmin = functions
  .region('southamerica-east1')
  .https.onCall(async (data: GetMetricsAdminInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const { franchiseId, storeId, startDate, endDate } = data;

    if (!franchiseId) {
      throw new functions.https.HttpsError('invalid-argument', 'franchiseId é obrigatório');
    }

    await assertCanRead(franchiseId, context.auth.uid, context.auth.token.role as string | undefined);

    const hasRange = Boolean(startDate && endDate);

    if (hasRange) {
      const startKey = normalizeDateKey(startDate!);
      const endKey = normalizeDateKey(endDate!);

      if (storeId) {
        const metrics = await aggregateDailyStats(franchiseId, storeId, startKey, endKey);
        return { metrics };
      }

      // Sem storeId: agrega todas as lojas da franquia
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();
      if (storesSnap.empty) return { metrics: null };

      const aggregate: DailyMetrics = {
        date: endKey,
        revenue: 0,
        orders: 0,
        paidOrders: 0,
        cancelledOrders: 0,
        pendingOrders: 0,
        averageTicket: 0,
        paymentMethods: {},
        lastUpdate: null,
      };

      for (const storeDoc of storesSnap.docs) {
        const storeMetrics = await aggregateDailyStats(franchiseId, storeDoc.id, startKey, endKey);
        if (!storeMetrics) continue;

        aggregate.revenue += storeMetrics.revenue;
        aggregate.orders += storeMetrics.orders;
        aggregate.paidOrders += storeMetrics.paidOrders;
        aggregate.cancelledOrders! += storeMetrics.cancelledOrders || 0;
        aggregate.pendingOrders! += storeMetrics.pendingOrders || 0;

        const methods = storeMetrics.paymentMethods || {};
        Object.entries(methods).forEach(([method, payload]) => {
          const current = aggregate.paymentMethods?.[method] || { count: 0, revenue: 0 };
          aggregate.paymentMethods![method] = {
            count: current.count + (payload.count || 0),
            revenue: current.revenue + (payload.revenue || 0),
          };
        });
      }

      aggregate.averageTicket = aggregate.orders > 0 ? aggregate.revenue / aggregate.orders : 0;
      return { metrics: aggregate };
    }

    if (storeId) {
      const metricsSnap = await db.doc(`franchises/${franchiseId}/stores/${storeId}/metrics/current`).get();
      if (!metricsSnap.exists) return { metrics: null };

      const data = metricsSnap.data() || {};
      const metrics: DailyMetrics = {
        date: new Date().toISOString().split('T')[0],
        revenue: data.revenue || 0,
        orders: data.orders || 0,
        paidOrders: data.paidOrders || 0,
        cancelledOrders: data.cancelledOrders || 0,
        pendingOrders: data.pendingOrders || 0,
        averageTicket: data.orders > 0 ? data.revenue / data.orders : 0,
        paymentMethods: data.paymentMethods || {},
        lastUpdate: data.lastUpdate?.toDate?.() || null,
      };

      return { metrics };
    }

    const franchiseMetricsSnap = await db.doc(`franchises/${franchiseId}/metrics/current`).get();
    if (!franchiseMetricsSnap.exists) return { metrics: null };

    const data = franchiseMetricsSnap.data() || {};
    const metrics: DailyMetrics = {
      date: new Date().toISOString().split('T')[0],
      revenue: data.revenue || 0,
      orders: data.orders || 0,
      paidOrders: data.paidOrders || 0,
      cancelledOrders: data.cancelledOrders || 0,
      pendingOrders: data.pendingOrders || 0,
      averageTicket: data.orders > 0 ? data.revenue / data.orders : 0,
      paymentMethods: data.paymentMethods || {},
      lastUpdate: data.lastUpdate?.toDate?.() || null,
    };

    return { metrics };
  });
