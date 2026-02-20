/**
 * ============================================================================
 * Aggregate Orders - Cloud Functions para Materializacao de Metricas
 * ============================================================================
 *
 * Triggers onCreate e onUpdate para orders que atualizam:
 * - analytics/daily/{YYYY-MM-DD} - Agregados diarios globais
 * - analytics/hourly/{YYYY-MM-DD-HH} - Agregados por hora
 * - franchises/{franchiseId}/stores/{storeId}/metrics/current - Metricas da loja
 * - franchises/{franchiseId}/metrics/current - Metricas agregadas da franquia
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, admin } from '../lib';

interface OrderData {
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  storeId?: string;
  franchiseId?: string;
  createdAt?: admin.firestore.Timestamp;
  timestamp?: admin.firestore.Timestamp;
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

const CANCELED_STATUSES = ['canceled', 'cancelled'] as const;
const PAID_ORDER_STATUSES = ['completed', 'paid', 'paid_pending_dispense', 'dispensing', 'failed_dispense'] as const;
const PAID_PAYMENT_STATUSES = ['paid', 'completed', 'dispensed'] as const;
const PENDING_ORDER_STATUSES = ['pending', 'paid_pending_dispense', 'dispensing', 'failed_dispense'] as const;

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/** Convert a Date to BRT (UTC-3) and return YYYY-MM-DD */
function toBRTDateStr(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().split('T')[0];
}

/** Return BRT hour (0-23) from a Date */
function toBRTHour(date: Date): number {
  return (date.getUTCHours() - 3 + 24) % 24;
}

function getDateKey(timestamp: admin.firestore.Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  return toBRTDateStr(date);
}

function getHourKey(timestamp: admin.firestore.Timestamp | undefined): string {
  const date = timestamp?.toDate() || new Date();
  const dateStr = toBRTDateStr(date);
  const hour = toBRTHour(date).toString().padStart(2, '0');
  return `${dateStr}-${hour}`;
}

function isCancelledStatus(status: string): boolean {
  return CANCELED_STATUSES.includes(status as (typeof CANCELED_STATUSES)[number]);
}

function isPendingStatus(status: string): boolean {
  return PENDING_ORDER_STATUSES.includes(status as (typeof PENDING_ORDER_STATUSES)[number]);
}

function isPaidOrder(order: OrderData): boolean {
  const orderStatus = normalizeStatus(order.status);
  const paymentStatus = normalizeStatus(order.paymentStatus);

  return (
    PAID_ORDER_STATUSES.includes(orderStatus as (typeof PAID_ORDER_STATUSES)[number]) &&
    PAID_PAYMENT_STATUSES.includes(paymentStatus as (typeof PAID_PAYMENT_STATUSES)[number])
  );
}

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

  const status = normalizeStatus(order.status);

  if (isNew) {
    updates.orders = increment(1);

    if (isPaidOrder(order)) {
      updates.revenue = increment(order.total || 0);
      updates.paidOrders = increment(1);
    } else if (isCancelledStatus(status)) {
      updates.cancelledOrders = increment(1);
    } else {
      updates.pendingOrders = increment(1);
    }

    if (order.paymentMethod) {
      updates[`paymentMethods.${order.paymentMethod}.count`] = increment(1);
      if (isPaidOrder(order)) {
        updates[`paymentMethods.${order.paymentMethod}.revenue`] = increment(order.total || 0);
      }
    }
  } else if (previousOrder) {
    const previousStatus = normalizeStatus(previousOrder.status);
    const wasPaid = isPaidOrder(previousOrder);
    const isNowPaid = isPaidOrder(order);

    if (!wasPaid && isNowPaid) {
      updates.revenue = increment(order.total || 0);
      updates.paidOrders = increment(1);
      if (isPendingStatus(previousStatus)) {
        updates.pendingOrders = increment(-1);
      }
    } else if (wasPaid && !isNowPaid) {
      updates.revenue = increment(-(previousOrder.total || 0));
      updates.paidOrders = increment(-1);
    }

    if (isCancelledStatus(status) && !isCancelledStatus(previousStatus)) {
      updates.cancelledOrders = increment(1);
      if (isPendingStatus(previousStatus)) {
        updates.pendingOrders = increment(-1);
      }
    } else if (!isCancelledStatus(status) && isCancelledStatus(previousStatus)) {
      updates.cancelledOrders = increment(-1);
      if (isPendingStatus(status) && !isNowPaid) {
        updates.pendingOrders = increment(1);
      }
    }
  }

  await docRef.set(updates, { merge: true });
}

export const onOrderCreated = onDocumentCreated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/orders/{orderId}', region: 'southamerica-east1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const context = { params: event.params };
    const order = snap.data() as OrderData;
    const { franchiseId, storeId, orderId } = context.params;

    // 🔒 FIX Bug-16: Idempotency guard for at-least-once delivery.
    // Use event.id to track processed events on the daily metrics doc.
    // If this event was already processed (replay), skip to avoid double-counting.
    const eventId = event.id || orderId;

    order.franchiseId = franchiseId;
    order.storeId = storeId;

    const timestamp = order.createdAt || order.timestamp;
    const dateKey = getDateKey(timestamp);
    const hourKey = getHourKey(timestamp);

    try {
      const dailyRef = db.doc(`analytics/daily/${dateKey}`);

      // 🔒 FIX BUG-A1: Idempotency via subcollection (prevents unbounded array growth)
      const dedupRef = dailyRef.collection('processedEvents').doc(eventId);
      const dedupSnap = await dedupRef.get();
      if (dedupSnap.exists) {
        console.log(`[aggOrders] Event ${eventId} already processed — skip (replay)`);
        return;
      }

      await updateMetrics(dailyRef, order, true);
      // Mark event as processed in subcollection (scalable dedup)
      await dedupRef.set({ ts: admin.firestore.FieldValue.serverTimestamp() });

      const hourlyRef = db.doc(`analytics/hourly/${hourKey}`);
      await updateMetrics(hourlyRef, order, true);

      const storeMetricsRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/metrics/current`);
      await updateMetrics(storeMetricsRef, order, true, undefined, { franchiseId, storeId });

      const franchiseMetricsRef = db.doc(`franchises/${franchiseId}/metrics/current`);
      await updateMetrics(franchiseMetricsRef, order, true, undefined, { franchiseId });

      console.log(`[aggOrders] Metrics updated for order ${orderId}`);
    } catch (error) {
      console.error('[aggOrders] Error updating metrics:', error);
      throw error;
    }
  }
);

export const onOrderUpdated = onDocumentUpdated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/orders/{orderId}', region: 'southamerica-east1' },
  async (event) => {
    if (!event.data) return;
    const change = { before: event.data.before, after: event.data.after };
    const context = { params: event.params };
    const before = change.before.data() as OrderData;
    const after = change.after.data() as OrderData;
    const { franchiseId, storeId, orderId } = context.params;

    if (
      before.status === after.status &&
      before.paymentStatus === after.paymentStatus &&
      before.total === after.total
    ) {
      console.log(`[aggOrders] onUpdate: ${orderId} - no relevant changes`);
      return;
    }

    after.franchiseId = franchiseId;
    after.storeId = storeId;
    before.franchiseId = franchiseId;
    before.storeId = storeId;

    const timestamp = after.createdAt || after.timestamp || before.createdAt || before.timestamp;
    const dateKey = getDateKey(timestamp);
    const hourKey = getHourKey(timestamp);

    try {
      const dailyRef = db.doc(`analytics/daily/${dateKey}`);

      // 🔒 FIX BUG-A1: Idempotency via subcollection (prevents unbounded array growth)
      const updateEventId = event.id || `update_${orderId}`;
      const dedupRef = dailyRef.collection('processedEvents').doc(updateEventId);
      const dedupSnap = await dedupRef.get();
      if (dedupSnap.exists) {
        console.log(`[aggOrders] Update event ${updateEventId} already processed — skip (replay)`);
        return;
      }

      await updateMetrics(dailyRef, after, false, before);
      await dedupRef.set({ ts: admin.firestore.FieldValue.serverTimestamp() });

      const hourlyRef = db.doc(`analytics/hourly/${hourKey}`);
      await updateMetrics(hourlyRef, after, false, before);

      const storeMetricsRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/metrics/current`);
      await updateMetrics(storeMetricsRef, after, false, before, { franchiseId, storeId });

      const franchiseMetricsRef = db.doc(`franchises/${franchiseId}/metrics/current`);
      await updateMetrics(franchiseMetricsRef, after, false, before, { franchiseId });

      console.log(`[aggOrders] Metrics updated for order update ${orderId}`);
    } catch (error) {
      console.error('[aggOrders] Error updating metrics:', error);
      throw error;
    }
  }
);
