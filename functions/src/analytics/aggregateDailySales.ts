/**
 * ============================================================================
 * Aggregate Daily Sales - Cloud Function
 * ============================================================================
 * 
 * Agrega métricas diárias de vendas por loja.
 * 
 * Execução:
 *   - Scheduled: Todos os dias às 02:00 (processa dia anterior)
 *   - On-demand: Pode ser chamada manualmente via HTTP
 * 
 * Estrutura de saída:
 *   franchises/{franchiseId}/stores/{storeId}/dailyStats/{YYYY-MM-DD}
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface DailyStats {
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

/**
 * Scheduled function - executa às 02:00 todos os dias
 * Processa o dia anterior
 */
export const aggregateDailySales = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('0 2 * * *')  // Cron: 02:00 todos os dias
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`[AggregateDailySales] Processing ${dateStr}`);
    
    await processAllStores(dateStr);
    
    console.log('[AggregateDailySales] Completed');
    return null;
  });

/**
 * HTTP function - para processar uma data específica manualmente
 */
export const aggregateDailySalesHTTP = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    // Verificar autenticação
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verificar se é superAdmin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData?.isSuperAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Only superAdmins can trigger manual aggregation');
    }

    const { date, franchiseId, storeId } = data;

    if (!date) {
      throw new functions.https.HttpsError('invalid-argument', 'Date is required (YYYY-MM-DD)');
    }

    console.log(`[AggregateDailySalesHTTP] Manual trigger for ${date}`);

    if (franchiseId && storeId) {
      // Processar loja específica
      await aggregateStoreDaily(franchiseId, storeId, date);
    } else if (franchiseId) {
      // Processar todas as lojas de uma franquia
      await processFranchiseStores(franchiseId, date);
    } else {
      // Processar todas
      await processAllStores(date);
    }

    return { success: true, date };
  });

/**
 * Processa todas as franquias e lojas
 */
async function processAllStores(date: string): Promise<void> {
  const franchises = await db.collection('franchises').get();
  
  for (const franchise of franchises.docs) {
    await processFranchiseStores(franchise.id, date);
  }
}

/**
 * Processa todas as lojas de uma franquia
 */
async function processFranchiseStores(franchiseId: string, date: string): Promise<void> {
  const stores = await db
    .collection(`franchises/${franchiseId}/stores`)
    .get();
  
  for (const store of stores.docs) {
    await aggregateStoreDaily(franchiseId, store.id, date);
  }
}

/**
 * Agrega métricas diárias de uma loja específica
 */
async function aggregateStoreDaily(
  franchiseId: string, 
  storeId: string, 
  date: string
): Promise<void> {
  const ordersRef = db.collection(
    `franchises/${franchiseId}/stores/${storeId}/orders`
  );
  
  // Calcular início e fim do dia
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);
  
  // Ajustar para timezone Brasil (UTC-3)
  startOfDay.setHours(startOfDay.getHours() - 3);
  endOfDay.setHours(endOfDay.getHours() - 3);
  
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
  
  // Inicializar contadores
  let totalRevenue = 0;
  let totalOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let pendingOrders = 0;
  
  const paymentMethods: Record<string, { count: number; revenue: number }> = {};
  const hourlyDistribution: Record<number, { count: number; revenue: number }> = {};
  const productSales: Record<string, { productId: string; title: string; quantity: number; revenue: number }> = {};
  
  // Processar cada pedido
  for (const doc of orders.docs) {
    const order = doc.data();
    totalOrders++;
    
    const status = order.status || 'completed'; // Default para compatibilidade
    const paymentStatus = order.paymentStatus || 'paid'; // Default para compatibilidade
    
    if (status === 'completed' && paymentStatus === 'paid') {
      completedOrders++;
      totalRevenue += order.total || 0;
      
      // Agregar por método de pagamento
      const method = order.paymentMethod || 'unknown';
      if (!paymentMethods[method]) {
        paymentMethods[method] = { count: 0, revenue: 0 };
      }
      paymentMethods[method].count++;
      paymentMethods[method].revenue += order.total || 0;
      
      // Agregar por hora
      let hour = 0;
      if (order.timestamp?.toDate) {
        hour = order.timestamp.toDate().getHours();
      } else if (order.hourOfDay !== undefined) {
        hour = order.hourOfDay;
      }
      
      if (!hourlyDistribution[hour]) {
        hourlyDistribution[hour] = { count: 0, revenue: 0 };
      }
      hourlyDistribution[hour].count++;
      hourlyDistribution[hour].revenue += order.total || 0;
      
      // Agregar por produto
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          const productId = item.productId || 'unknown';
          if (!productSales[productId]) {
            productSales[productId] = {
              productId,
              title: item.title || 'Produto',
              quantity: 0,
              revenue: 0,
            };
          }
          productSales[productId].quantity += item.quantity || 1;
          productSales[productId].revenue += (item.price || 0) * (item.quantity || 1);
        }
      }
    } else if (status === 'cancelled') {
      cancelledOrders++;
    } else if (status === 'pending') {
      pendingOrders++;
    }
  }
  
  // Calcular ticket médio
  const avgTicket = completedOrders > 0 ? totalRevenue / completedOrders : 0;
  
  // Top 10 produtos por receita
  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  
  // Montar estatísticas
  const stats: DailyStats = {
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
  
  // Salvar agregação
  const statsRef = db.doc(
    `franchises/${franchiseId}/stores/${storeId}/dailyStats/${date}`
  );
  
  await statsRef.set(stats);
  
  console.log(`[AggregateDailySales] Saved stats for ${storeId} on ${date}: R$${totalRevenue.toFixed(2)} (${completedOrders} orders)`);
}
