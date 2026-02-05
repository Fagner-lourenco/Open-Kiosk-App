/**
 * ============================================================================
 * Aggregate Orders - Cloud Functions para Materialização de Métricas
 * ============================================================================
 * 
 * Triggers onCreate e onUpdate para orders que atualizam:
 * - analytics/daily/{YYYY-MM-DD} - Agregados diários globais
 * - analytics/hourly/{YYYY-MM-DD-HH} - Agregados por hora
 * - franchises/{franchiseId}/stores/{storeId}/metrics/current - Métricas da loja
 * - franchises/{franchiseId}/metrics/current - Métricas agregadas da franquia
 * 
 * Usa FieldValue.increment para operações atômicas e idempotentes.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../lib';

// ============================================================================
// TIPOS
// ============================================================================

interface OrderData {
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  storeId?: string;
  franchiseId?: string;
  createdAt?: admin.firestore.Timestamp;
  timestamp?: admin.firestore.Timestamp;
  items?: Array<{
    productId: string;
    title: string;
    quantity: number;
    price: number;
    total: number;
  }>;
}

interface MetricsUpdate {
  revenue: admin.firestore.FieldValue;
  orders: admin.firestore.FieldValue;
  paidOrders?: admin.firestore.FieldValue;
  cancelledOrders?: admin.firestore.FieldValue;
  pendingOrders?: admin.firestore.FieldValue;
  lastUpdate: admin.firestore.FieldValue;
  updatedAt?: admin.firestore.FieldValue;
  franchiseId?: string;
  storeId?: string;
  [key: string]: admin.firestore.FieldValue | string | undefined;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrai data no formato YYYY-MM-DD de um Timestamp
 */
function getDateKey(timestamp: admin.firestore.Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  return date.toISOString().split('T')[0];
}

/**
 * Extrai data e hora no formato YYYY-MM-DD-HH de um Timestamp
 */
function getHourKey(timestamp: admin.firestore.Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  const dateStr = date.toISOString().split('T')[0];
  const hour = date.getHours().toString().padStart(2, '0');
  return `${dateStr}-${hour}`;
}

/**
 * Verifica se o pedido está "pago" (completed + paid)
 */
function isPaidOrder(order: OrderData): boolean {
  return (
    (order.status === 'completed' || order.status === 'paid') &&
    (order.paymentStatus === 'paid' || order.paymentStatus === 'completed')
  );
}

/**
 * Atualiza métricas de forma atômica usando FieldValue.increment
 */
async function updateMetrics(
  docRef: admin.firestore.DocumentReference,
  order: OrderData,
  isNew: boolean,
  previousOrder?: OrderData,
  context?: { franchiseId?: string; storeId?: string }
): Promise<void> {
  const increment = admin.firestore.FieldValue.increment;
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
  
  const updates: MetricsUpdate = {
    revenue: increment(0),
    orders: increment(0),
    lastUpdate: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  if (context?.franchiseId) {
    updates.franchiseId = context.franchiseId;
  }
  if (context?.storeId) {
    updates.storeId = context.storeId;
  }
  
  if (isNew) {
    // Novo pedido
    updates.orders = increment(1);
    
    if (isPaidOrder(order)) {
      updates.revenue = increment(order.total || 0);
      updates.paidOrders = increment(1);
    } else if (order.status === 'cancelled') {
      updates.cancelledOrders = increment(1);
    } else {
      updates.pendingOrders = increment(1);
    }
    
    // Incrementar contador de método de pagamento
    if (order.paymentMethod) {
      updates[`paymentMethods.${order.paymentMethod}.count`] = increment(1);
      if (isPaidOrder(order)) {
        updates[`paymentMethods.${order.paymentMethod}.revenue`] = increment(order.total || 0);
      }
    }
  } else if (previousOrder) {
    // Atualização de pedido existente - calcular delta
    const wasPaid = isPaidOrder(previousOrder);
    const isNowPaid = isPaidOrder(order);
    
    if (!wasPaid && isNowPaid) {
      // Pedido foi pago
      updates.revenue = increment(order.total || 0);
      updates.paidOrders = increment(1);
      updates.pendingOrders = increment(-1);
    } else if (wasPaid && !isNowPaid) {
      // Pedido foi revertido (estorno)
      updates.revenue = increment(-(previousOrder.total || 0));
      updates.paidOrders = increment(-1);
    }
    
    if (order.status === 'cancelled' && previousOrder.status !== 'cancelled') {
      updates.cancelledOrders = increment(1);
      if (previousOrder.status === 'pending') {
        updates.pendingOrders = increment(-1);
      }
    }
  }
  
  // Usar set com merge para criar documento se não existir
  await docRef.set(updates, { merge: true });
}

// ============================================================================
// TRIGGERS
// ============================================================================

/**
 * Trigger: onCreate - Novo pedido criado
 * 
 * Path: franchises/{franchiseId}/stores/{storeId}/orders/{orderId}
 */
export const onOrderCreated = functions
  .region('southamerica-east1')
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/orders/{orderId}')
  .onCreate(async (snap, context) => {
    const order = snap.data() as OrderData;
    const { franchiseId, storeId, orderId } = context.params;
    
    console.log(`[aggOrders] onCreate: ${orderId} in store ${storeId}`);
    
    // Adicionar IDs ao order se não existirem
    order.franchiseId = franchiseId;
    order.storeId = storeId;
    
    const timestamp = order.createdAt || order.timestamp;
    const dateKey = getDateKey(timestamp);
    const hourKey = getHourKey(timestamp);
    
    try {
      // 1. Atualizar analytics/daily
      const dailyRef = db.doc(`analytics/daily/${dateKey}`);
      await updateMetrics(dailyRef, order, true);
      
      // 2. Atualizar analytics/hourly
      const hourlyRef = db.doc(`analytics/hourly/${hourKey}`);
      await updateMetrics(hourlyRef, order, true);
      
      // 3. Atualizar métricas da loja
      const storeMetricsRef = db.doc(
        `franchises/${franchiseId}/stores/${storeId}/metrics/current`
      );
      await updateMetrics(storeMetricsRef, order, true, undefined, { franchiseId, storeId });
      
      // 4. Atualizar métricas da franquia
      const franchiseMetricsRef = db.doc(
        `franchises/${franchiseId}/metrics/current`
      );
      await updateMetrics(franchiseMetricsRef, order, true, undefined, { franchiseId });
      
      console.log(`[aggOrders] ✅ Metrics updated for order ${orderId}`);
    } catch (error) {
      console.error(`[aggOrders] ❌ Error updating metrics:`, error);
      throw error;
    }
  });

/**
 * Trigger: onUpdate - Pedido atualizado
 * 
 * Path: franchises/{franchiseId}/stores/{storeId}/orders/{orderId}
 */
export const onOrderUpdated = functions
  .region('southamerica-east1')
  .firestore
  .document('franchises/{franchiseId}/stores/{storeId}/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as OrderData;
    const after = change.after.data() as OrderData;
    const { franchiseId, storeId, orderId } = context.params;
    
    // Ignorar se não houve mudança relevante
    if (
      before.status === after.status &&
      before.paymentStatus === after.paymentStatus &&
      before.total === after.total
    ) {
      console.log(`[aggOrders] onUpdate: ${orderId} - no relevant changes`);
      return;
    }
    
    console.log(`[aggOrders] onUpdate: ${orderId} - status: ${before.status} -> ${after.status}`);
    
    // Adicionar IDs
    after.franchiseId = franchiseId;
    after.storeId = storeId;
    before.franchiseId = franchiseId;
    before.storeId = storeId;
    
    const timestamp = after.createdAt || after.timestamp || before.createdAt || before.timestamp;
    const dateKey = getDateKey(timestamp);
    const hourKey = getHourKey(timestamp);
    
    try {
      // 1. Atualizar analytics/daily
      const dailyRef = db.doc(`analytics/daily/${dateKey}`);
      await updateMetrics(dailyRef, after, false, before);
      
      // 2. Atualizar analytics/hourly
      const hourlyRef = db.doc(`analytics/hourly/${hourKey}`);
      await updateMetrics(hourlyRef, after, false, before);
      
      // 3. Atualizar métricas da loja
      const storeMetricsRef = db.doc(
        `franchises/${franchiseId}/stores/${storeId}/metrics/current`
      );
      await updateMetrics(storeMetricsRef, after, false, before, { franchiseId, storeId });
      
      // 4. Atualizar métricas da franquia
      const franchiseMetricsRef = db.doc(
        `franchises/${franchiseId}/metrics/current`
      );
      await updateMetrics(franchiseMetricsRef, after, false, before, { franchiseId });
      
      console.log(`[aggOrders] ✅ Metrics updated for order update ${orderId}`);
    } catch (error) {
      console.error(`[aggOrders] ❌ Error updating metrics:`, error);
      throw error;
    }
  });

