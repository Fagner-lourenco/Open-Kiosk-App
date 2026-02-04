/**
 * ============================================================================
 * Report Service - Serviços para geração de relatórios
 * ============================================================================
 * 
 * ATUALIZADO: Prioriza métricas materializadas (dailyStats/metrics)
 * com fallback para queries diretas quando necessário.
 */

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ReportPeriod {
  startDate: Date;
  endDate: Date;
}

export interface SalesReport {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  uniqueCustomers: number;
  ordersByDay: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  source: 'materialized' | 'query'; // Indica se veio de métricas ou query
}

export interface ProductReport {
  topProducts: Array<{
    id: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface StoreReport {
  stores: Array<{
    id: string;
    name: string;
    orders: number;
    revenue: number;
    averageOrderValue: number;
  }>;
}

/**
 * Get date range based on period string
 */
export function getDateRange(period: string): ReportPeriod {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case '7days':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '30days':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case '90days':
      startDate.setDate(endDate.getDate() - 90);
      break;
    case 'year':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      const day = startDate.getDay();
      startDate.setDate(startDate.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      startDate.setDate(endDate.getDate() - 30);
  }

  return { startDate, endDate };
}

/**
 * Helper: formata data como YYYY-MM-DD
 */
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get sales report using MATERIALIZED metrics (dailyStats)
 * Falls back to direct query if materialized data not available
 */
export async function getSalesReport(
  franchiseId: string,
  storeIds: string[],
  period: ReportPeriod
): Promise<SalesReport> {
  let totalRevenue = 0;
  let totalOrders = 0;
  const uniqueCustomers = new Set<string>();
  const ordersByDayMap = new Map<string, { orders: number; revenue: number }>();
  let usedMaterialized = false;

  // Tentar usar dailyStats materializados primeiro
  for (const storeId of storeIds) {
    try {
      const dailyStatsRef = collection(
        db,
        `franchises/${franchiseId}/stores/${storeId}/dailyStats`
      );
      
      // Buscar stats do período
      const startKey = formatDateKey(period.startDate);
      const endKey = formatDateKey(period.endDate);
      
      const statsQuery = query(
        dailyStatsRef,
        where('date', '>=', startKey),
        where('date', '<=', endKey),
        orderBy('date', 'desc')
      );

      const snapshot = await getDocs(statsQuery);
      
      if (!snapshot.empty) {
        usedMaterialized = true;
        
        snapshot.docs.forEach((docSnap) => {
          const stats = docSnap.data();
          const dateKey = stats.date || docSnap.id;
          
          totalRevenue += stats.totalRevenue || 0;
          totalOrders += stats.totalOrders || 0;
          
          const existing = ordersByDayMap.get(dateKey) || { orders: 0, revenue: 0 };
          ordersByDayMap.set(dateKey, {
            orders: existing.orders + (stats.totalOrders || 0),
            revenue: existing.revenue + (stats.totalRevenue || 0),
          });
        });
      }
    } catch (err: any) {
      // Se falhar por permissão ou índice, log e continua para fallback
      if (err?.code === 'permission-denied' || err?.message?.includes('index')) {
        console.warn(`[ReportService] dailyStats query failed for ${storeId}, falling back to orders query`);
      } else {
        console.error(`[ReportService] Error fetching dailyStats for store ${storeId}:`, err);
      }
    }
  }
  
  // Fallback: query direta em orders se não encontrou dados materializados
  if (!usedMaterialized) {
    for (const storeId of storeIds) {
      try {
        const ordersRef = collection(
          db,
          `franchises/${franchiseId}/stores/${storeId}/orders`
        );
        
        const ordersQuery = query(
          ordersRef,
          where('createdAt', '>=', Timestamp.fromDate(period.startDate)),
          where('createdAt', '<=', Timestamp.fromDate(period.endDate)),
          orderBy('createdAt', 'desc'),
          limit(10000)
        );

        const snapshot = await getDocs(ordersQuery);

        snapshot.docs.forEach((docSnap) => {
          const order = docSnap.data();
          const orderTotal = order.total || 0;
          const orderDate = order.createdAt?.toDate();
          
          totalOrders++;
          totalRevenue += orderTotal;

          if (order.customerId) {
            uniqueCustomers.add(order.customerId);
          }

          if (orderDate) {
            const dateKey = orderDate.toISOString().split('T')[0];
            const existing = ordersByDayMap.get(dateKey) || { orders: 0, revenue: 0 };
            ordersByDayMap.set(dateKey, {
              orders: existing.orders + 1,
              revenue: existing.revenue + orderTotal,
            });
          }
        });
      } catch (err) {
        console.error(`[ReportService] Error fetching orders for store ${storeId}:`, err);
      }
    }
  }

  // Convert map to sorted array
  const ordersByDay = Array.from(ordersByDayMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    uniqueCustomers: uniqueCustomers.size,
    ordersByDay,
    source: usedMaterialized ? 'materialized' : 'query',
  };
}

/**
 * Get product report for a franchise
 */
export async function getProductReport(
  franchiseId: string,
  storeIds: string[],
  period: ReportPeriod
): Promise<ProductReport> {
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const categoryMap = new Map<string, { quantity: number; revenue: number }>();

  for (const storeId of storeIds) {
    try {
      const ordersRef = collection(
        db,
        `franchises/${franchiseId}/stores/${storeId}/orders`
      );
      
      const ordersQuery = query(
        ordersRef,
        where('createdAt', '>=', Timestamp.fromDate(period.startDate)),
        where('createdAt', '<=', Timestamp.fromDate(period.endDate)),
        orderBy('createdAt', 'desc'),
        limit(10000)
      );

      const snapshot = await getDocs(ordersQuery);

      snapshot.docs.forEach((doc) => {
        const order = doc.data();
        const items = order.items || [];

        items.forEach((item: any) => {
          // Product tracking
          const productId = item.productId || item.id;
          const productName = item.title || item.name || 'Produto';
          const existing = productMap.get(productId) || {
            name: productName,
            quantity: 0,
            revenue: 0,
          };
          
          productMap.set(productId, {
            name: productName || existing.name,
            quantity: existing.quantity + (item.quantity || 1),
            revenue: existing.revenue + (item.price || 0) * (item.quantity || 1),
          });

          // Category tracking
          const category = item.category || 'Outros';
          const categoryExisting = categoryMap.get(category) || { quantity: 0, revenue: 0 };
          
          categoryMap.set(category, {
            quantity: categoryExisting.quantity + (item.quantity || 1),
            revenue: categoryExisting.revenue + (item.price || 0) * (item.quantity || 1),
          });
        });
      });
    } catch (err) {
      console.error(`Error fetching orders for store ${storeId}:`, err);
    }
  }

  // Convert maps to sorted arrays
  const topProducts = Array.from(productMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    topProducts,
    categoryBreakdown,
  };
}

/**
 * Get store comparison report using MATERIALIZED metrics (dailyStats or current metrics)
 * Falls back to direct query if materialized data not available
 */
export async function getStoreReport(
  franchiseId: string,
  storeIds: string[],
  storeNames: Record<string, string>,
  period: ReportPeriod
): Promise<StoreReport> {
  const storeData: StoreReport['stores'] = [];
  const startKey = formatDateKey(period.startDate);
  const endKey = formatDateKey(period.endDate);

  for (const storeId of storeIds) {
    let orders = 0;
    let revenue = 0;
    let usedMaterialized = false;

    // Tentar métricas materializadas primeiro (dailyStats)
    try {
      const dailyStatsRef = collection(
        db,
        `franchises/${franchiseId}/stores/${storeId}/dailyStats`
      );
      
      const statsQuery = query(
        dailyStatsRef,
        where('date', '>=', startKey),
        where('date', '<=', endKey)
      );

      const snapshot = await getDocs(statsQuery);
      
      if (!snapshot.empty) {
        usedMaterialized = true;
        snapshot.docs.forEach((docSnap) => {
          const stats = docSnap.data();
          orders += stats.totalOrders || 0;
          revenue += stats.totalRevenue || 0;
        });
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('index')) {
        console.warn(`[ReportService] dailyStats failed for ${storeId}, trying metrics/current`);
      }
    }

    // Fallback 1: métricas agregadas em metrics/current
    if (!usedMaterialized) {
      try {
        const metricsRef = doc(
          db,
          `franchises/${franchiseId}/stores/${storeId}/metrics/current`
        );
        
        const metricsSnap = await getDoc(metricsRef);
        
        if (metricsSnap.exists()) {
          const metrics = metricsSnap.data();
          orders = metrics.orders || 0;
          revenue = metrics.revenue || 0;
          usedMaterialized = true;
        }
      } catch (err) {
        console.warn(`[ReportService] metrics/current failed for ${storeId}`);
      }
    }

    // Fallback 2: query direta em orders
    if (!usedMaterialized) {
      try {
        const ordersRef = collection(
          db,
          `franchises/${franchiseId}/stores/${storeId}/orders`
        );
        
        const ordersQuery = query(
          ordersRef,
          where('createdAt', '>=', Timestamp.fromDate(period.startDate)),
          where('createdAt', '<=', Timestamp.fromDate(period.endDate)),
          orderBy('createdAt', 'desc'),
          limit(10000)
        );

        const snapshot = await getDocs(ordersQuery);

        snapshot.docs.forEach((docSnap) => {
          const order = docSnap.data();
          orders++;
          revenue += order.total || 0;
        });
      } catch (err) {
        console.error(`[ReportService] Error fetching orders for store ${storeId}:`, err);
      }
    }

    storeData.push({
      id: storeId,
      name: storeNames[storeId] || storeId,
      orders,
      revenue,
      averageOrderValue: orders > 0 ? revenue / orders : 0,
    });
  }

  // Sort by revenue descending
  storeData.sort((a, b) => b.revenue - a.revenue);

  return { stores: storeData };
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Calculate percentage change
 */
export function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
