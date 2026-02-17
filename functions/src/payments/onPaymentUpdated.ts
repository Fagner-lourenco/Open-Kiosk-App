/**
 * ============================================================================
 * onPaymentUpdated — Firestore Trigger
 * ============================================================================
 *
 * Fires when a payment document is updated.
 * Creates a notification for:
 * - status changed to 'failed', 'canceled', 'expired'
 * - requiresRefund flag set to true
 *
 * Path: franchises/{franchiseId}/stores/{storeId}/payments/{paymentId}
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { db, admin } from '../lib';
import type { PaymentStatus } from './types';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

/** Statuses that should generate a notification */
const ALERT_STATUSES: PaymentStatus[] = ['failed', 'canceled', 'expired'];

const STATUS_LABELS: Record<string, string> = {
  failed: 'Falhou',
  canceled: 'Cancelado',
  expired: 'Expirado',
};

export const onPaymentUpdated = onDocumentUpdated(
  { document: 'franchises/{franchiseId}/stores/{storeId}/payments/{paymentId}', region: 'southamerica-east1' },
  async (event) => {
    if (!event.data) return;
    const change = { before: event.data.before, after: event.data.after };
    const context = { params: event.params };
    const { franchiseId, storeId, paymentId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    const newStatus = after.status as PaymentStatus;
    const oldStatus = before.status as PaymentStatus;

    // Only notify on status transitions to alert states
    const statusChanged = oldStatus !== newStatus && ALERT_STATUSES.includes(newStatus);
    const requiresRefund = !before.requiresRefund && after.requiresRefund;

    if (!statusChanged && !requiresRefund) return;

    // Dedupe: one notification per payment per status per day
    const today = new Date().toISOString().slice(0, 10);
    const eventType = requiresRefund ? 'requires_refund' : `payment_${newStatus}`;
    const dedupeKey = `${eventType}_${paymentId}_${today}`;

    const existingSnap = await db.collection(`franchises/${franchiseId}/notifications`)
      .where('dedupeKey', '==', dedupeKey).limit(1).get();

    if (!existingSnap.empty) {
      logger.info(`[onPaymentUpdated] Skipped duplicate (${dedupeKey})`);
      return;
    }

    const orderId = (after.orderId as string) || paymentId;
    const amount = Number(after.amount) || 0;
    const amountStr = amount.toFixed(2);

    let title: string;
    let message: string;
    let priority: 'high' | 'critical' = 'high';

    if (requiresRefund) {
      title = 'Pagamento Requer Reembolso';
      message = `Pedido #${orderId.slice(-6)} (R$ ${amountStr}) pago após cancelamento — requer reembolso manual`;
      priority = 'critical';
    } else {
      const statusLabel = STATUS_LABELS[newStatus] || newStatus;
      title = `Pagamento ${statusLabel}`;
      message = `Pagamento do pedido #${orderId.slice(-6)} (R$ ${amountStr}) ${statusLabel.toLowerCase()}`;
    }

    const notifRef = db.collection(`franchises/${franchiseId}/notifications`).doc();
    await notifRef.set({
      id: notifRef.id,
      type: 'payment',
      priority,
      title,
      message,
      isRead: false,
      isDismissed: false,
      createdAt: serverTimestamp(),
      readAt: null,
      entityRef: `payments/${paymentId}`,
      storeId,
      franchiseId,
      dedupeKey,
      actionUrl: `/stores/${storeId}?tab=orders`,
      actionLabel: 'Ver Pedidos',
    });

    logger.info(`[onPaymentUpdated] Created notification: ${title}`, {
      paymentId, newStatus, requiresRefund,
    });
  }
);
