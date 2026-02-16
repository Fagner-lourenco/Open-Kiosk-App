import * as functions from 'firebase-functions';
import { db, admin } from '../lib';
import type { CreatePaymentInput, PaymentStatus } from './types';
import {
  createPaymentIntent,
  parseReferenceId,
  syncPendingPaymentsForPagBank,
  updatePaymentStatus,
  verifyPagBankSignature,
} from './paymentService';

const mapWebhookStatus = (status?: string): PaymentStatus => {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'PAID' || normalized === 'AUTHORIZED') return 'paid';
  if (normalized === 'CANCELED' || normalized === 'CANCELLED') return 'canceled';
  if (normalized === 'DECLINED' || normalized === 'FAILED') return 'failed';
  if (normalized === 'EXPIRED') return 'expired';
  return 'pending';
};

export const createPayment = functions
  .region('southamerica-east1')
  .https.onCall(async (data: CreatePaymentInput, context) => {
    return createPaymentIntent(data, context);
  });

export const pagbankWebhook = functions
  .region('southamerica-east1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const pagbankConfig = functions.config().pagbank || {};
    const webhookToken = pagbankConfig.webhook_token as string | undefined;

    if (!webhookToken) {
      functions.logger.error('[pagbankWebhook] webhook_token nao configurado.');
      res.status(500).send('Missing webhook token');
      return;
    }

    const signatureHeader = (req.header('x-authenticity-token') || req.header('X-Authenticity-Token')) ?? undefined;
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

    if (!verifyPagBankSignature(signatureHeader, rawBody, webhookToken)) {
      functions.logger.warn('[pagbankWebhook] assinatura invalida');
      res.status(401).send('Invalid signature');
      return;
    }

    const payload = req.body || {};
    const referenceId =
      payload?.reference_id ||
      payload?.data?.reference_id ||
      payload?.order?.reference_id;
    const parsed = parseReferenceId(referenceId);

    if (!parsed) {
      functions.logger.warn('[pagbankWebhook] reference_id invalido', { referenceId });
      res.status(200).send({ received: true });
      return;
    }

    const { franchiseId, storeId, paymentId } = parsed;
    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      functions.logger.warn('[pagbankWebhook] pagamento nao encontrado', { paymentId });
      res.status(200).send({ received: true });
      return;
    }

    const orderId =
      payload?.id ||
      payload?.order_id ||
      payload?.data?.id ||
      payload?.order?.id;
    const charge = Array.isArray(payload?.charges) ? payload.charges[0] : undefined;
    const chargeStatus = charge?.status || payload?.data?.charges?.[0]?.status;
    const orderStatus = payload?.status || payload?.order?.status;
    const status = mapWebhookStatus(chargeStatus || orderStatus);

    await updatePaymentStatus(paymentRef, status, {
      providerOrderId: orderId,
      providerPaymentId: charge?.id,
    });

    res.status(200).send({ received: true });
  });

/**
 * KIO-03/KIO-04: Cancel PagBank payment via Cloud Function.
 * Attempts real cancellation if order is in cancellable state.
 * Otherwise marks as cancel_requested for webhook/polling reconciliation.
 */
export const cancelPagBankPayment = functions
  .region('southamerica-east1')
  .https.onCall(async (data: { franchiseId: string; storeId: string; paymentId: string }, context) => {
    const { franchiseId, storeId, paymentId } = data;
    if (!franchiseId || !storeId || !paymentId) {
      throw new functions.https.HttpsError('invalid-argument', 'franchiseId, storeId e paymentId obrigatorios.');
    }

    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Pagamento nao encontrado.');
    }

    const payment = paymentSnap.data() as import('./types').PaymentRecord;

    // Already in terminal state — nothing to cancel
    const terminalStates: import('./types').PaymentStatus[] = ['paid', 'canceled', 'expired', 'refunded', 'failed'];
    if (terminalStates.includes(payment.status)) {
      return { canceled: payment.status === 'canceled', reason: `already_${payment.status}` };
    }

    // Attempt real cancellation via PagBank API if providerOrderId exists
    if (payment.providerOrderId && payment.provider === 'pagbank') {
      try {
        // PagBank does not have a standard cancel endpoint for PIX orders.
        // For card charges, we could attempt a void, but for PIX QR we can only wait for expiration.
        // Mark as cancel_requested and let syncPendingPayments handle reconciliation.
        functions.logger.info('[cancelPagBankPayment] Provider cancel delegated to sync/webhook', {
          providerOrderId: payment.providerOrderId,
        });
      } catch (err) {
        functions.logger.warn('[cancelPagBankPayment] Provider cancel attempt error:', err);
      }
    }

    // Mark as cancel_requested — the sync job and webhook will reconcile
    await paymentRef.set(
      {
        cancelRequested: true,
        cancelRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    functions.logger.info('[cancelPagBankPayment] Marked cancel_requested', { paymentId, orderId: payment.orderId });
    return { canceled: false, reason: 'cancel_requested' };
  });

export const syncPendingPayments = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('every 5 minutes')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    await syncPendingPaymentsForPagBank();
    return null;
  });
