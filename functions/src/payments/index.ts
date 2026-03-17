import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { db, admin, requireAuth, requireFranchiseAccess, requireStoreAccess } from '../lib';
import type { CreatePaymentInput, PaymentStatus } from './types';
import {
  createPaymentIntent,
  parseReferenceId,
  syncPendingPaymentsForPagBank,
  syncPendingPaymentsForMP,
  verifyPagBankSignature,
} from './paymentService';
import { verifyMPSignature, mapMPStatus } from './providers/mercadopago';

/** States from which a payment must NOT regress. Used by webhooks and cancel logic. */
const TERMINAL_STATUSES: PaymentStatus[] = ['paid', 'canceled', 'expired', 'refunded', 'failed'];

// 🔒 FIX BUG-26: Return null for unknown webhook status instead of defaulting to 'pending'
const mapWebhookStatus = (status?: string): PaymentStatus | null => {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'PAID' || normalized === 'AUTHORIZED') return 'paid';
  if (normalized === 'CANCELED' || normalized === 'CANCELLED') return 'canceled';
  if (normalized === 'DECLINED' || normalized === 'FAILED') return 'failed';
  if (normalized === 'EXPIRED') return 'expired';
  if (normalized === 'REFUNDED') return 'refunded';
  if (normalized === 'WAITING' || normalized === 'IN_ANALYSIS' || normalized === 'PENDING') return 'pending';
  return null;
};

export const createPayment = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as CreatePaymentInput;
    return createPaymentIntent(data, request);
  }
);

export const pagbankWebhook = onRequest(
  { region: 'southamerica-east1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const webhookToken = process.env.PAGBANK_WEBHOOK_TOKEN;

    if (!webhookToken) {
      logger.error('[pagbankWebhook] webhook_token nao configurado.');
      res.status(500).send('Missing webhook token');
      return;
    }

    const signatureHeader = (req.header('x-authenticity-token') || req.header('X-Authenticity-Token')) ?? undefined;
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

    if (!verifyPagBankSignature(signatureHeader, rawBody, webhookToken)) {
      logger.warn('[pagbankWebhook] assinatura invalida');
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
      logger.warn('[pagbankWebhook] reference_id invalido', { referenceId });
      res.status(200).send({ received: true });
      return;
    }

    const { franchiseId, storeId, paymentId } = parsed;
    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);

    const orderId =
      payload?.id ||
      payload?.order_id ||
      payload?.data?.id ||
      payload?.order?.id;
    const charge = Array.isArray(payload?.charges) ? payload.charges[0] : undefined;
    const chargeStatus = charge?.status || payload?.data?.charges?.[0]?.status;
    const orderStatus = payload?.status || payload?.order?.status;
    const status = mapWebhookStatus(chargeStatus || orderStatus);

    // 🔒 FIX BUG-26: Skip processing when status is unrecognized
    if (status === null) {
      logger.warn('[pagbankWebhook] Status nao mapeado, ignorando webhook', {
        chargeStatus, orderStatus, paymentId: parsed.paymentId,
      });
      res.status(200).send({ received: true });
      return;
    }

    // 🔒 FIX Bug-13: Wrap read-check-write in a transaction to prevent TOCTOU.
    // Without a transaction, two concurrent webhooks (e.g. 'paid' and 'canceled')
    // could both read 'pending', both pass the terminal guard, and the last writer wins.
    // The transaction ensures the terminal-state check and status update are atomic.
    try {
      await db.runTransaction(async (txn) => {
        const paymentSnap = await txn.get(paymentRef);
        if (!paymentSnap.exists) {
          logger.warn('[pagbankWebhook] pagamento nao encontrado', { paymentId });
          return;
        }

        // Guard: não regredir estados terminais
        const currentPaymentData = paymentSnap.data() as { status: PaymentStatus };
        const currentStatus = currentPaymentData.status;

        if (TERMINAL_STATUSES.includes(currentStatus) && !TERMINAL_STATUSES.includes(status)) {
          logger.info(`[pagbankWebhook] Ignorando webhook — pagamento ja em estado terminal: ${currentStatus}`);
          return;
        }

        txn.set(paymentRef, {
          status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          providerOrderId: orderId,
          providerPaymentId: charge?.id,
        }, { merge: true });
      });
    } catch (err) {
      logger.error('[pagbankWebhook] Transaction error:', err);
    }

    res.status(200).send({ received: true });
  }
);

/**
 * KIO-03/KIO-04: Cancel PagBank payment via Cloud Function.
 * Attempts real cancellation if order is in cancellable state.
 * Otherwise marks as cancel_requested for webhook/polling reconciliation.
 */
export const cancelPagBankPayment = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    // P0-06: Require authentication
    requireAuth(request);

    const data = request.data as { franchiseId: string; storeId: string; paymentId: string };
    const { franchiseId, storeId, paymentId } = data;
    if (!franchiseId || !storeId || !paymentId) {
      throw new HttpsError('invalid-argument', 'franchiseId, storeId e paymentId obrigatorios.');
    }

    // P0-07: Require tenant access (franchise membership)
    await requireFranchiseAccess(request, franchiseId);

    // 🔒 FIX BUG-A3: Require store-level access (not just franchise)
    await requireStoreAccess(request, franchiseId, storeId);

    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);

    // F-11: Transactional cancel to prevent race conditions
    const cancelResult = await db.runTransaction(async (txn) => {
      const paymentSnap = await txn.get(paymentRef);
      if (!paymentSnap.exists) {
        throw new HttpsError('not-found', 'Pagamento nao encontrado.');
      }

      const payment = paymentSnap.data() as import('./types').PaymentRecord;

      // Already in terminal state — nothing to cancel
      if (TERMINAL_STATUSES.includes(payment.status)) {
        return { canceled: payment.status === 'canceled', reason: `already_${payment.status}`, needsProviderCancel: false };
      }

      // Already cancel_requested — idempotent
      if (payment.cancelRequested) {
        return { canceled: false, reason: 'cancel_requested', needsProviderCancel: false };
      }

      // Mark as cancel_requested atomically
      txn.set(paymentRef, {
        cancelRequested: true,
        cancelRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        canceled: false,
        reason: 'cancel_requested',
        needsProviderCancel: !!(payment.providerOrderId && payment.provider === 'pagbank'),
        providerOrderId: payment.providerOrderId,
        orderId: payment.orderId,
      };
    });

    // Attempt provider cancel outside transaction (safe — already marked cancel_requested)
    if (cancelResult.needsProviderCancel) {
      try {
        logger.info('[cancelPagBankPayment] Provider cancel delegated to sync/webhook', {
          providerOrderId: cancelResult.providerOrderId,
        });
      } catch (err) {
        logger.warn('[cancelPagBankPayment] Provider cancel attempt error:', err);
      }
    }

    if (cancelResult.reason !== 'cancel_requested' || cancelResult.canceled) {
      return { canceled: cancelResult.canceled, reason: cancelResult.reason };
    }

    logger.info('[cancelPagBankPayment] Marked cancel_requested', { paymentId, orderId: cancelResult.orderId });
    return { canceled: false, reason: 'cancel_requested' };
  }
);

export const syncPendingPayments = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1' },
  async () => {
    try {
      await syncPendingPaymentsForPagBank();
    } catch (err) {
      logger.error('[syncPendingPayments] PagBank sync failed:', err);
    }
    try {
      await syncPendingPaymentsForMP();
    } catch (err) {
      logger.error('[syncPendingPayments] MercadoPago sync failed:', err);
    }
  }
);

// ====================================================================
// Mercado Pago — Webhook, Cancel, CheckStatus
// ====================================================================

/**
 * Map MP order status (from webhook) to our PaymentStatus.
 * Returns null for unrecognized statuses to skip processing.
 * Re-uses mapMPStatus from provider (which defaults unknown → 'pending'),
 * and wraps it to return null for truly unknown statuses.
 */
const KNOWN_MP_STATUSES = new Set(['processed', 'approved', 'canceled', 'cancelled', 'expired', 'failed', 'rejected', 'refunded', 'created', 'opened', 'at_terminal']);
const mapMPWebhookStatus = (status?: string): PaymentStatus | null => {
  const normalized = (status || '').toLowerCase();
  if (!normalized || !KNOWN_MP_STATUSES.has(normalized)) return null;
  return mapMPStatus(normalized);
};

export const mercadopagoWebhook = onRequest(
  { region: 'southamerica-east1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('[mercadopagoWebhook] MP_WEBHOOK_SECRET nao configurado.');
      res.status(500).send('Missing webhook secret');
      return;
    }

    // MP sends data.id as query parameter for HMAC verification
    const dataIdParam = (req.query['data.id'] as string) || '';
    const xSignature = req.header('x-signature') || '';
    const xRequestId = req.header('x-request-id') || '';

    if (!verifyMPSignature(xSignature, dataIdParam, xRequestId, webhookSecret)) {
      logger.warn('[mercadopagoWebhook] Assinatura HMAC invalida');
      res.status(401).send('Invalid signature');
      return;
    }

    const payload = req.body || {};

    // Extract external_reference — MP webhook body contains it directly
    const externalReference =
      payload?.data?.external_reference ||
      payload?.external_reference;

    const parsed = parseReferenceId(externalReference);

    if (!parsed) {
      logger.warn('[mercadopagoWebhook] external_reference invalido ou ausente', {
        externalReference,
        action: payload?.action,
      });
      // Respond 200 to avoid MP retries for unrecognized references
      res.status(200).send({ received: true });
      return;
    }

    const { franchiseId, storeId, paymentId } = parsed;
    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);

    const orderStatus = payload?.data?.status || payload?.status;
    const status = mapMPWebhookStatus(orderStatus);

    if (status === null) {
      logger.warn('[mercadopagoWebhook] Status nao mapeado, ignorando', {
        orderStatus,
        action: payload?.action,
        paymentId,
      });
      res.status(200).send({ received: true });
      return;
    }

    // Extract payment details from webhook body
    const providerOrderId = payload?.data?.id || dataIdParam;
    const providerPaymentId = payload?.data?.transactions?.payments?.[0]?.reference?.id
      ? String(payload.data.transactions.payments[0].reference.id)
      : undefined;

    try {
      await db.runTransaction(async (txn) => {
        const paymentSnap = await txn.get(paymentRef);
        if (!paymentSnap.exists) {
          logger.warn('[mercadopagoWebhook] pagamento nao encontrado', { paymentId });
          return;
        }

        const currentPaymentData = paymentSnap.data() as { status: PaymentStatus; cancelRequested?: boolean };
        const currentStatus = currentPaymentData.status;

        // Guard: don't regress terminal states
        if (TERMINAL_STATUSES.includes(currentStatus) && !TERMINAL_STATUSES.includes(status)) {
          logger.info(`[mercadopagoWebhook] Ignorando — estado terminal: ${currentStatus}`);
          return;
        }

        const updateData: Record<string, unknown> = {
          status,
          providerStatus: orderStatus || undefined,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          providerOrderId,
          providerPaymentId,
        };

        // If cancel was requested but payment arrived, flag for refund
        if (currentPaymentData.cancelRequested && status === 'paid') {
          updateData.requiresRefund = true;
          updateData.cancelRequestedBeforePayment = true;
          logger.warn('[mercadopagoWebhook] Payment arrived AFTER cancel_requested', { paymentId });
        }

        txn.set(paymentRef, updateData, { merge: true });
      });
    } catch (err) {
      logger.error('[mercadopagoWebhook] Transaction error:', err);
    }

    res.status(200).send({ received: true });
  }
);

/**
 * Cancel a Mercado Pago payment.
 * Same pattern as cancelPagBankPayment — marks cancel_requested atomically.
 * Attempts POST /v1/orders/{id}/cancel if order is in cancellable state.
 */
export const cancelMercadoPagoPayment = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    requireAuth(request);

    const data = request.data as { franchiseId: string; storeId: string; paymentId: string };
    const { franchiseId, storeId, paymentId } = data;
    if (!franchiseId || !storeId || !paymentId) {
      throw new HttpsError('invalid-argument', 'franchiseId, storeId e paymentId obrigatorios.');
    }

    await requireFranchiseAccess(request, franchiseId);
    await requireStoreAccess(request, franchiseId, storeId);

    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);

    const cancelResult = await db.runTransaction(async (txn) => {
      const paymentSnap = await txn.get(paymentRef);
      if (!paymentSnap.exists) {
        throw new HttpsError('not-found', 'Pagamento nao encontrado.');
      }

      const payment = paymentSnap.data() as import('./types').PaymentRecord;

      if (TERMINAL_STATUSES.includes(payment.status)) {
        return { canceled: payment.status === 'canceled', reason: `already_${payment.status}`, providerOrderId: undefined };
      }

      if (payment.cancelRequested) {
        return { canceled: false, reason: 'cancel_requested', providerOrderId: undefined };
      }

      txn.set(paymentRef, {
        cancelRequested: true,
        cancelRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        canceled: false,
        reason: 'cancel_requested',
        providerOrderId: payment.providerOrderId,
        channel: payment.channel,
      };
    });

    // Attempt provider cancel outside transaction
    if (cancelResult.providerOrderId) {
      try {
        const storeRef = db.doc(`franchises/${franchiseId}/stores/${storeId}`);
        const storeSnap = await storeRef.get();
        const { normalizePaymentGatewayConfig, resolveMercadoPagoConfig } = await import('./storeConfig');
        const gatewayConfig = normalizePaymentGatewayConfig(storeSnap.data());
        if (gatewayConfig && gatewayConfig.provider === 'mercado_pago') {
          const mpConfig = resolveMercadoPagoConfig(gatewayConfig);
          const authHeaders = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mpConfig.accessToken}`,
          };
          const cancelUrl = `https://api.mercadopago.com/v1/orders/${cancelResult.providerOrderId}/cancel`;
          const response = await fetch(cancelUrl, {
            method: 'POST',
            headers: authHeaders,
          });
          if (response.ok) {
            await paymentRef.set({
              status: 'canceled',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return { canceled: true, reason: 'provider_canceled' };
          }

          // Provider did not cancel. Resolve explicit reason to improve frontend UX.
          try {
            const statusUrl = `https://api.mercadopago.com/v1/orders/${cancelResult.providerOrderId}`;
            const statusResponse = await fetch(statusUrl, {
              method: 'GET',
              headers: authHeaders,
            });
            if (statusResponse.ok) {
              const order = await statusResponse.json() as { status?: string };
              const orderStatus = String(order?.status || '').toLowerCase();

              if (orderStatus === 'at_terminal') {
                return { canceled: false, reason: 'at_terminal' };
              }

              if ((orderStatus === 'created' || orderStatus === 'opened') && cancelResult.channel === 'point') {
                return { canceled: false, reason: 'at_terminal' };
              }

              // QR orders in 'created'/'opened' state: cancel locally since API didn't accept
              if ((orderStatus === 'created' || orderStatus === 'opened') && cancelResult.channel !== 'point') {
                await paymentRef.set({
                  status: 'canceled',
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return { canceled: true, reason: 'provider_canceled' };
              }

              if (orderStatus === 'processed') {
                return { canceled: false, reason: 'already_processed' };
              }

              if (orderStatus === 'canceled' || orderStatus === 'cancelled') {
                await paymentRef.set({
                  status: 'canceled',
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return { canceled: true, reason: 'provider_canceled' };
              }
            }
          } catch (statusErr) {
            logger.warn('[cancelMercadoPagoPayment] Failed to resolve order status after cancel non-ok', statusErr);
          }

          logger.info('[cancelMercadoPagoPayment] Provider cancel returned non-ok, sync will handle', {
            status: response.status,
            providerOrderId: cancelResult.providerOrderId,
          });
        }
      } catch (err) {
        logger.warn('[cancelMercadoPagoPayment] Provider cancel attempt error:', err);
      }
    }

    return { canceled: cancelResult.canceled, reason: cancelResult.reason };
  }
);

/**
 * Check MP payment status on-demand (Cloud Function fallback for frontend).
 * Frontend calls this when onSnapshot hasn't updated after 10s.
 */
export const checkMercadoPagoPaymentStatus = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    requireAuth(request);

    const data = request.data as { franchiseId: string; storeId: string; paymentId: string };
    const { franchiseId, storeId, paymentId } = data;
    if (!franchiseId || !storeId || !paymentId) {
      throw new HttpsError('invalid-argument', 'franchiseId, storeId e paymentId obrigatorios.');
    }

    await requireFranchiseAccess(request, franchiseId);
    await requireStoreAccess(request, franchiseId, storeId);

    const paymentRef = db.doc(`franchises/${franchiseId}/stores/${storeId}/payments/${paymentId}`);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      throw new HttpsError('not-found', 'Pagamento nao encontrado.');
    }

    const payment = paymentSnap.data() as import('./types').PaymentRecord;
    if (payment.provider !== 'mercado_pago') {
      throw new HttpsError('failed-precondition', 'Pagamento nao e Mercado Pago.');
    }

    if (!payment.providerOrderId) {
      return { status: payment.status };
    }

    // Terminal states — no need to query provider
    if (TERMINAL_STATUSES.includes(payment.status)) {
      return { status: payment.status };
    }

    try {
      const storeRef = db.doc(`franchises/${franchiseId}/stores/${storeId}`);
      const storeSnap = await storeRef.get();
      const { normalizePaymentGatewayConfig, resolveMercadoPagoConfig } = await import('./storeConfig');
      const { createMercadoPagoProvider } = await import('./providers/mercadopago');
      const gatewayConfig = normalizePaymentGatewayConfig(storeSnap.data());

      if (!gatewayConfig || gatewayConfig.provider !== 'mercado_pago') {
        return { status: payment.status };
      }

      const mpConfig = resolveMercadoPagoConfig(gatewayConfig);
      const provider = createMercadoPagoProvider(mpConfig);
      const statusResult = await provider.getPaymentStatus?.(payment);

      if (!statusResult) {
        return { status: payment.status };
      }

      if (statusResult.status !== payment.status || statusResult.providerStatus !== payment.providerStatus) {
        const updateData: Record<string, unknown> = {
          providerOrderId: statusResult.providerOrderId,
          providerPaymentId: statusResult.providerPaymentId,
          providerStatus: statusResult.providerStatus || undefined,
        };

        if (payment.cancelRequested && statusResult.status === 'paid') {
          updateData.requiresRefund = true;
          updateData.cancelRequestedBeforePayment = true;
        }

        const { updatePaymentStatus } = await import('./paymentService');
        await updatePaymentStatus(paymentRef, statusResult.status, updateData);
      }

      return { status: statusResult.status };
    } catch (error) {
      logger.warn('[checkMercadoPagoPaymentStatus] Error checking status', {
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: payment.status };
    }
  }
);
