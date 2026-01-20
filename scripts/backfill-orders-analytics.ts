/**
 * ============================================================================
 * Backfill Orders to Analytics
 * ============================================================================
 * 
 * Script para processar pedidos históricos e popular métricas materializadas.
 * 
 * Uso:
 *   npx ts-node scripts/backfill-orders-analytics.ts
 * 
 * Ou via Firebase Functions (recomendado para grandes volumes):
 *   firebase functions:shell
 *   > backfillAnalytics({franchiseId: 'xxx', startDate: '2024-01-01'})
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Inicializar Firebase Admin
const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (error) {
  // Tentar inicializar com credenciais do ambiente
  admin.initializeApp();
}

const db = admin.firestore();
const increment = admin.firestore.FieldValue.increment;
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

interface BackfillConfig {
  franchiseId?: string;
  storeId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  batchSize?: number;
  dryRun?: boolean;
}

const DEFAULT_CONFIG: BackfillConfig = {
  batchSize: 500,
  dryRun: false,
};

// ============================================================================
// HELPERS
// ============================================================================

function getDateKey(timestamp: admin.firestore.Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  return date.toISOString().split('T')[0];
}

function getHourKey(timestamp: admin.firestore.Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  const dateStr = date.toISOString().split('T')[0];
  const hour = date.getHours().toString().padStart(2, '0');
  return `${dateStr}-${hour}`;
}

function isPaidOrder(order: admin.firestore.DocumentData): boolean {
  return (
    (order.status === 'completed' || order.status === 'paid') &&
    (order.paymentStatus === 'paid' || order.paymentStatus === 'completed')
  );
}

// ============================================================================
// BACKFILL
// ============================================================================

async function backfillStore(
  franchiseId: string,
  storeId: string,
  config: BackfillConfig
): Promise<{ processed: number; errors: number }> {
  console.log(`\n📦 Processing store: ${storeId}`);
  
  let processed = 0;
  let errors = 0;
  
  // Query orders
  let ordersQuery = db
    .collection(`franchises/${franchiseId}/stores/${storeId}/orders`)
    .orderBy('createdAt', 'asc');
  
  if (config.startDate) {
    const startTimestamp = admin.firestore.Timestamp.fromDate(
      new Date(`${config.startDate}T00:00:00Z`)
    );
    ordersQuery = ordersQuery.where('createdAt', '>=', startTimestamp);
  }
  
  if (config.endDate) {
    const endTimestamp = admin.firestore.Timestamp.fromDate(
      new Date(`${config.endDate}T23:59:59Z`)
    );
    ordersQuery = ordersQuery.where('createdAt', '<=', endTimestamp);
  }
  
  const ordersSnapshot = await ordersQuery.get();
  console.log(`  Found ${ordersSnapshot.size} orders`);
  
  // Agrupar por dia
  const dailyAggregates: Map<string, {
    revenue: number;
    orders: number;
    paidOrders: number;
    cancelledOrders: number;
    paymentMethods: Record<string, { count: number; revenue: number }>;
  }> = new Map();
  
  const hourlyAggregates: Map<string, {
    revenue: number;
    orders: number;
  }> = new Map();
  
  // Processar cada order
  for (const orderDoc of ordersSnapshot.docs) {
    try {
      const order = orderDoc.data();
      const timestamp = order.createdAt || order.timestamp;
      const dateKey = getDateKey(timestamp);
      const hourKey = getHourKey(timestamp);
      
      // Inicializar agregados do dia
      if (!dailyAggregates.has(dateKey)) {
        dailyAggregates.set(dateKey, {
          revenue: 0,
          orders: 0,
          paidOrders: 0,
          cancelledOrders: 0,
          paymentMethods: {},
        });
      }
      
      // Inicializar agregados da hora
      if (!hourlyAggregates.has(hourKey)) {
        hourlyAggregates.set(hourKey, {
          revenue: 0,
          orders: 0,
        });
      }
      
      const daily = dailyAggregates.get(dateKey)!;
      const hourly = hourlyAggregates.get(hourKey)!;
      
      daily.orders++;
      hourly.orders++;
      
      if (isPaidOrder(order)) {
        const total = order.total || 0;
        daily.revenue += total;
        daily.paidOrders++;
        hourly.revenue += total;
        
        // Payment method
        const method = order.paymentMethod || 'unknown';
        if (!daily.paymentMethods[method]) {
          daily.paymentMethods[method] = { count: 0, revenue: 0 };
        }
        daily.paymentMethods[method].count++;
        daily.paymentMethods[method].revenue += total;
      }
      
      if (order.status === 'cancelled') {
        daily.cancelledOrders++;
      }
      
      processed++;
    } catch (error) {
      console.error(`  ❌ Error processing order ${orderDoc.id}:`, error);
      errors++;
    }
  }
  
  console.log(`  Aggregated into ${dailyAggregates.size} daily records`);
  
  if (config.dryRun) {
    console.log('  [DRY RUN] Would write:');
    for (const [date, data] of dailyAggregates) {
      console.log(`    ${date}: ${data.orders} orders, R$${data.revenue.toFixed(2)}`);
    }
    return { processed, errors };
  }
  
  // Escrever agregados
  const batch = db.batch();
  let batchCount = 0;
  
  for (const [dateKey, data] of dailyAggregates) {
    // Global daily
    const globalDailyRef = db.doc(`analytics/daily/${dateKey}`);
    batch.set(globalDailyRef, {
      revenue: increment(data.revenue),
      orders: increment(data.orders),
      paidOrders: increment(data.paidOrders),
      cancelledOrders: increment(data.cancelledOrders),
      lastUpdate: serverTimestamp(),
    }, { merge: true });
    
    // Store daily stats
    const storeDailyRef = db.doc(
      `franchises/${franchiseId}/stores/${storeId}/dailyStats/${dateKey}`
    );
    batch.set(storeDailyRef, {
      date: dateKey,
      storeId,
      franchiseId,
      totalRevenue: data.revenue,
      totalOrders: data.orders,
      completedOrders: data.paidOrders,
      cancelledOrders: data.cancelledOrders,
      avgTicket: data.paidOrders > 0 ? data.revenue / data.paidOrders : 0,
      paymentMethods: data.paymentMethods,
      processedAt: serverTimestamp(),
    }, { merge: true });
    
    batchCount += 2;
    
    // Commit batch if too large
    if (batchCount >= config.batchSize!) {
      await batch.commit();
      console.log(`  ✅ Committed ${batchCount} writes`);
      batchCount = 0;
    }
  }
  
  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
    console.log(`  ✅ Committed ${batchCount} writes`);
  }
  
  // Atualizar métricas totais da loja
  const storeMetricsRef = db.doc(
    `franchises/${franchiseId}/stores/${storeId}/metrics/current`
  );
  
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalPaidOrders = 0;
  
  for (const data of dailyAggregates.values()) {
    totalRevenue += data.revenue;
    totalOrders += data.orders;
    totalPaidOrders += data.paidOrders;
  }
  
  await storeMetricsRef.set({
    revenue: increment(totalRevenue),
    orders: increment(totalOrders),
    paidOrders: increment(totalPaidOrders),
    lastUpdate: serverTimestamp(),
    backfilledAt: serverTimestamp(),
  }, { merge: true });
  
  console.log(`  ✅ Store metrics updated`);
  
  return { processed, errors };
}

async function backfillFranchise(
  franchiseId: string,
  config: BackfillConfig
): Promise<{ processed: number; errors: number }> {
  console.log(`\n🏢 Processing franchise: ${franchiseId}`);
  
  let totalProcessed = 0;
  let totalErrors = 0;
  
  // Get all stores
  const storesSnapshot = await db
    .collection(`franchises/${franchiseId}/stores`)
    .get();
  
  console.log(`Found ${storesSnapshot.size} stores`);
  
  for (const storeDoc of storesSnapshot.docs) {
    if (config.storeId && storeDoc.id !== config.storeId) {
      continue;
    }
    
    const result = await backfillStore(franchiseId, storeDoc.id, config);
    totalProcessed += result.processed;
    totalErrors += result.errors;
  }
  
  // Atualizar métricas da franquia
  if (!config.dryRun) {
    // Somar métricas de todas as lojas
    let franchiseRevenue = 0;
    let franchiseOrders = 0;
    let franchisePaidOrders = 0;
    
    for (const storeDoc of storesSnapshot.docs) {
      const metricsSnapshot = await db
        .doc(`franchises/${franchiseId}/stores/${storeDoc.id}/metrics/current`)
        .get();
      
      if (metricsSnapshot.exists) {
        const data = metricsSnapshot.data()!;
        franchiseRevenue += data.revenue || 0;
        franchiseOrders += data.orders || 0;
        franchisePaidOrders += data.paidOrders || 0;
      }
    }
    
    await db.doc(`franchises/${franchiseId}/metrics/current`).set({
      revenue: franchiseRevenue,
      orders: franchiseOrders,
      paidOrders: franchisePaidOrders,
      lastUpdate: serverTimestamp(),
      backfilledAt: serverTimestamp(),
    }, { merge: true });
    
    console.log(`\n✅ Franchise metrics updated`);
  }
  
  return { processed: totalProcessed, errors: totalErrors };
}

async function backfillAll(config: BackfillConfig): Promise<void> {
  console.log('🚀 Starting backfill...');
  console.log('Config:', config);
  
  let totalProcessed = 0;
  let totalErrors = 0;
  
  if (config.franchiseId) {
    const result = await backfillFranchise(config.franchiseId, config);
    totalProcessed = result.processed;
    totalErrors = result.errors;
  } else {
    // Process all franchises
    const franchisesSnapshot = await db.collection('franchises').get();
    console.log(`Found ${franchisesSnapshot.size} franchises`);
    
    for (const franchiseDoc of franchisesSnapshot.docs) {
      const result = await backfillFranchise(franchiseDoc.id, config);
      totalProcessed += result.processed;
      totalErrors += result.errors;
    }
  }
  
  console.log('\n📊 Backfill Complete');
  console.log(`  Processed: ${totalProcessed} orders`);
  console.log(`  Errors: ${totalErrors}`);
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const config: BackfillConfig = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--franchise' && args[i + 1]) {
      config.franchiseId = args[++i];
    } else if (arg === '--store' && args[i + 1]) {
      config.storeId = args[++i];
    } else if (arg === '--start' && args[i + 1]) {
      config.startDate = args[++i];
    } else if (arg === '--end' && args[i + 1]) {
      config.endDate = args[++i];
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--batch' && args[i + 1]) {
      config.batchSize = parseInt(args[++i], 10);
    } else if (arg === '--help') {
      console.log(`
Backfill Orders to Analytics

Usage:
  npx ts-node scripts/backfill-orders-analytics.ts [options]

Options:
  --franchise <id>   Process only this franchise
  --store <id>       Process only this store (requires --franchise)
  --start <date>     Start date (YYYY-MM-DD)
  --end <date>       End date (YYYY-MM-DD)
  --dry-run          Preview without writing
  --batch <size>     Batch size (default: 500)
  --help             Show this help
      `);
      process.exit(0);
    }
  }
  
  await backfillAll(config);
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
