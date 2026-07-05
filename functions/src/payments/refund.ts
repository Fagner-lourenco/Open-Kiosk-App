/**
 * ============================================================================
 * Refund - Estorno real de pagamento Mercado Pago via gateway
 * ============================================================================
 *
 * Callable usado pelo Admin para devolver o dinheiro ao cliente (ex.: pedido
 * pago cuja dispensação falhou). Antes deste callable, o Admin apenas marcava
 * paymentStatus='refunded' no Firestore sem devolver o valor.
 *
 * Fluxo:
 *   1. Auth + acesso à franquia/loja (mesmos guards dos demais callables).
 *   2. Localiza PaymentRecord por paymentId OU por orderId.
 *   3. Transação: valida status 'paid' e marca refundRequested (evita duplo estorno).
 *   4. POST /v1/orders/{id}/refund no MP (refund total).
 *   5. Sucesso → status 'refunded'; falha → limpa refundRequested e propaga erro.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { randomUUID } from 'node:crypto';
import { db, admin, requireAuth, requireFranchiseAccess, requireStoreAccess } from '../lib';
import type { PaymentRecord } from './types';

interface RefundInput {
  franchiseId: string;
  storeId: string;
  /** ID do documento de payment (preferencial). */
  paymentId?: string;
  /** Fallback: localizar payment pelo orderId do pedido. */
  orderId?: string;
}

export const refundMercadoPagoPayment = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    requireAuth(request);

    const { franchiseId, storeId, paymentId, orderId } = (request.data || {}) as RefundInput;
    if (!franchiseId || !storeId || (!paymentId && !orderId)) {
      throw new HttpsError(
        'invalid-argument',
        'franchiseId, storeId e paymentId (ou orderId) obrigatorios.'
      );
    }

    await requireFranchiseAccess(request, franchiseId);
    await requireStoreAccess(request, franchiseId, storeId);

    const paymentsCol = db.collection(`franchises/${franchiseId}/stores/${storeId}/payments`);

    // Resolve payment doc (por ID direto ou por orderId)
    let paymentRef = paymentId ? paymentsCol.doc(paymentId) : null;
    if (!paymentRef && orderId) {
      const byOrder = await paymentsCol.where('orderId', '==', orderId).limit(1).get();
      if (!byOrder.empty) {
        paymentRef = byOrder.docs[0].ref;
      }
    }
    if (!paymentRef) {
      throw new HttpsError('not-found', 'Pagamento nao encontrado para este pedido.');
    }

    // Transação: valida e trava contra duplo estorno
    const claim = await db.runTransaction(async (txn) => {
      const snap = await txn.get(paymentRef!);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Pagamento nao encontrado.');
      }
      const payment = snap.data() as PaymentRecord;

      if (payment.status === 'refunded') {
        return { alreadyRefunded: true as const };
      }
      if (payment.status !== 'paid') {
        throw new HttpsError(
          'failed-precondition',
          `Somente pagamentos pagos podem ser estornados (status atual: ${payment.status}).`
        );
      }
      if (payment.provider !== 'mercado_pago') {
        throw new HttpsError(
          'failed-precondition',
          'Estorno automatico disponivel apenas para Mercado Pago.'
        );
      }
      if (!payment.providerOrderId) {
        throw new HttpsError('failed-precondition', 'Pagamento sem providerOrderId.');
      }
      if ((payment as PaymentRecord & { refundRequested?: boolean }).refundRequested) {
        throw new HttpsError('failed-precondition', 'Estorno ja em andamento.');
      }

      txn.set(paymentRef!, {
        refundRequested: true,
        refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return { alreadyRefunded: false as const, providerOrderId: payment.providerOrderId };
    });

    if (claim.alreadyRefunded) {
      return { refunded: true, reason: 'already_refunded' };
    }

    // Chamada ao MP fora da transação (I/O externo)
    try {
      const storeSnap = await db.doc(`franchises/${franchiseId}/stores/${storeId}`).get();
      const { normalizePaymentGatewayConfig, resolveMercadoPagoConfig } = await import('./storeConfig');
      const gatewayConfig = normalizePaymentGatewayConfig(storeSnap.data());
      if (!gatewayConfig || gatewayConfig.provider !== 'mercado_pago') {
        throw new HttpsError('failed-precondition', 'Gateway Mercado Pago nao configurado na loja.');
      }
      const mpConfig = resolveMercadoPagoConfig(gatewayConfig);

      const response = await fetch(
        `https://api.mercadopago.com/v1/orders/${claim.providerOrderId}/refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mpConfig.accessToken}`,
            'X-Idempotency-Key': randomUUID(),
          },
        }
      );

      if (!response.ok) {
        const body = await response.text();
        logger.error('[refundMercadoPagoPayment] MP refund failed', {
          status: response.status,
          body: body.substring(0, 500),
          providerOrderId: claim.providerOrderId,
        });
        throw new HttpsError(
          'aborted',
          `Mercado Pago recusou o estorno (HTTP ${response.status}).`
        );
      }

      await paymentRef.set({
        status: 'refunded',
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: request.auth?.uid || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Auditoria canônica
      try {
        await db.collection(`franchises/${franchiseId}/auditLogs`).add({
          action: 'payment.refund',
          actor: {
            id: request.auth?.uid || 'unknown',
            email: request.auth?.token?.email || '',
            name: request.auth?.token?.name || null,
          },
          target: { type: 'payment', id: paymentRef.id, name: paymentRef.id },
          details: { storeId, providerOrderId: claim.providerOrderId, provider: 'mercado_pago' },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (auditError) {
        logger.warn('[refundMercadoPagoPayment] Audit log falhou (não-fatal):', auditError);
      }

      logger.info('[refundMercadoPagoPayment] Refund OK', {
        paymentId: paymentRef.id,
        providerOrderId: claim.providerOrderId,
      });
      return { refunded: true, reason: 'provider_refunded' };
    } catch (error) {
      // Libera a trava para permitir nova tentativa
      await paymentRef.set({
        refundRequested: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => { /* melhor esforço */ });

      if (error instanceof HttpsError) throw error;
      logger.error('[refundMercadoPagoPayment] Erro inesperado:', error);
      throw new HttpsError('internal', 'Erro ao processar estorno.');
    }
  }
);
