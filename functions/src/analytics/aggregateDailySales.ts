/**
 * ============================================================================
 * Aggregate Daily Sales - Cloud Function
 * ============================================================================
 *
 * Agrega metricas diarias de vendas por loja.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

interface DailyStats {
  franchiseId: string;
  storeId: string;
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  avgTicket: number;
  paymentMethods: Record<string, { count: number; revenue: number }>;
  hourlyDistribution: Record<number, { count: number; revenue: number }>;
  topProducts: Array<{ productId: string; title: string; quantity: number; revenue: number }>;
  processedAt: admin.firestore.FieldValue;
}

const PAID_ORDER_STATUSES = ['completed', 'paid', 'paid_pending_dispense', 'dispensing', 'failed_dispense'] as const;
const PAID_PAYMENT_STATUSES = ['paid', 'completed', 'dispensed'] as const;
const CANCELED_STATUSES = ['canceled', 'cancelled'] as const;

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function isPaid(status: string, paymentStatus: string): boolean {
  return (
    PAID_ORDER_STATUSES.includes(status as (typeof PAID_ORDER_STATUSES)[number]) &&
    PAID_PAYMENT_STATUSES.includes(paymentStatus as (typeof PAID_PAYMENT_STATUSES)[number])
  );
}

export const aggregateDailySales = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1' },
  async () => {
    // Use BRT (UTC-3) to compute "yesterday" correctly for the business timezone
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    nowBRT.setDate(nowBRT.getDate() - 1);
    const dateStr = nowBRT.toISOString().split('T')[0];

    console.log(`[AggregateDailySales] Processing ${dateStr}`);
    await processAllStores(dateStr);
    console.log('[AggregateDailySales] Completed');
  }
);

export const aggregateDailySalesHTTP = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data;
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const isSuperAdmin =
      request.auth.token?.role === 'superadmin' ||
      (await db.collection('superadmins').doc(request.auth.uid).get()).exists;
    if (!isSuperAdmin) {
      throw new HttpsError(
        'permission-denied',
        'Only superAdmins can trigger manual aggregation'
      );
    }

    const { date, franchiseId, storeId } = data;
    if (!date) {
      throw new HttpsError('invalid-argument', 'Date is required (YYYY-MM-DD)');
    }

    console.log(`[AggregateDailySalesHTTP] Manual trigger for ${date}`);

    if (franchiseId && storeId) {
      await aggregateStoreDaily(franchiseId, storeId, date);
    } else if (franchiseId) {
      await processFranchiseStores(franchiseId, date);
    } else {
      await processAllStores(date);
    }

    return { success: true, date };
  }
);

async function processAllStores(date: string): Promise<void> {
  const franchises = await db.collection('franchises').get();
  for (const franchise of franchises.docs) {
    await processFranchiseStores(franchise.id, date);
  }
}

async function processFranchiseStores(franchiseId: string, date: string): Promise<void> {
  const stores = await db.collection(`franchises/${franchiseId}/stores`).get();
  for (const store of stores.docs) {
    await aggregateStoreDaily(franchiseId, store.id, date);
  }
}

async function aggregateStoreDaily(franchiseId: string, storeId: string, date: string): Promise<void> {
  const ordersRef = db.collection(`franchises/${franchiseId}/stores/${storeId}/orders`);

  // Use BRT boundaries (UTC-3): 00:00 BRT = 03:00 UTC, 23:59:59 BRT = 02:59:59 UTC+1
  const startOfDay = new Date(`${date}T03:00:00.000Z`);
  const endOfDay = new Date(`${date}T03:00:00.000Z`);
  endOfDay.setDate(endOfDay.getDate() + 1);
  endOfDay.setMilliseconds(endOfDay.getMilliseconds() - 1);

  let orders;
  try {
    orders = await ordersRef
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
      .get();
  } catch (error) {
    console.error(`[AggregateDailySales] Error querying orders for ${storeId}:`, error);
    return;
  }

  if (orders.empty) {
    console.log(`[AggregateDailySales] No orders for ${storeId} on ${date}`);
    return;
  }

  let totalRevenue = 0;
  let totalOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let pendingOrders = 0;

  const paymentMethods: Record<string, { count: number; revenue: number }> = {};
  const hourlyDistribution: Record<number, { count: number; revenue: number }> = {};
  const productSales: Record<string, { productId: string; title: string; quantity: number; revenue: number }> = {};

  for (const orderDoc of orders.docs) {
    const order = orderDoc.data();
    totalOrders++;

    const status = normalizeStatus(order.status);
    const paymentStatus = normalizeStatus(order.paymentStatus);

    if (isPaid(status, paymentStatus)) {
      completedOrders++;
      totalRevenue += Number(order.total) || 0;

      const method = (order.paymentMethod as string) || 'unknown';
      if (!paymentMethods[method]) {
        paymentMethods[method] = { count: 0, revenue: 0 };
      }
      paymentMethods[method].count++;
      paymentMethods[method].revenue += Number(order.total) || 0;

      let hour = 0;
      if (order.timestamp?.toDate) {
        // Convert to BRT (UTC-3) for correct hourly distribution
        const utcHour = order.timestamp.toDate().getUTCHours();
        hour = (utcHour - 3 + 24) % 24;
      } else if (typeof order.hourOfDay === 'number') {
        hour = order.hourOfDay;
      }

      if (!hourlyDistribution[hour]) {
        hourlyDistribution[hour] = { count: 0, revenue: 0 };
      }
      hourlyDistribution[hour].count++;
      hourlyDistribution[hour].revenue += Number(order.total) || 0;

      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const productId = (item.productId as string) || 'unknown';
          if (!productSales[productId]) {
            productSales[productId] = {
              productId,
              title: (item.title as string) || 'Produto',
              quantity: 0,
              revenue: 0,
            };
          }

          // 🔧 FIX Audit-R2: quantity 0 deve ser 0, não 1 (itens cancelados)
          const rawQty = Number(item.quantity);
          const qty = rawQty > 0 ? rawQty : 0;
          const unitPrice = Number(item.price) || 0;
          productSales[productId].quantity += qty;
          productSales[productId].revenue += unitPrice * qty;
        }
      }
    } else if (CANCELED_STATUSES.includes(status as (typeof CANCELED_STATUSES)[number])) {
      cancelledOrders++;
    } else {
      pendingOrders++;
    }
  }

  const avgTicket = completedOrders > 0 ? totalRevenue / completedOrders : 0;

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const stats: DailyStats = {
    franchiseId,
    storeId,
    date,
    totalOrders,
    completedOrders,
    cancelledOrders,
    pendingOrders,
    totalRevenue,
    avgTicket,
    paymentMethods,
    hourlyDistribution,
    topProducts,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const statsRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/dailyStats/${date}`);
  await statsRef.set(stats);

  console.log(
    `[AggregateDailySales] Saved stats for ${storeId} on ${date}: R$${totalRevenue.toFixed(2)} (${completedOrders} orders)`
  );
}
