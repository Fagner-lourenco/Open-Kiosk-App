import * as functions from 'firebase-functions';
import crypto from 'crypto';
import { db, admin, requireAuth, requireFranchiseAccess, sanitizeForLog } from '../lib';
import { createPagBankProvider, type PagBankProviderConfig } from './providers/pagbank';
import {
  type CreatePaymentInput,
  type CreatePaymentResponse,
  type PaymentMethod,
  type PaymentRecord,
  type PaymentStatus,
  type ProviderCreatePaymentInput,
} from './types';
import { normalizePaymentGatewayConfig, isMethodEnabled } from './storeConfig';

const DEFAULT_QR_EXPIRATION_MINUTES = 30;

const buildReferenceId = (franchiseId: string, storeId: string, paymentId: string): string =>
  `okp|${franchiseId}|${storeId}|${paymentId}`;

export const parseReferenceId = (referenceId?: string | null): {
  franchiseId: string;
  storeId: string;
  paymentId: string;
} | null => {
  if (!referenceId) return null;
  const parts = referenceId.split('|');
  if (parts.length !== 4) return null;
  if (parts[0] !== 'okp') return null;
  const [, franchiseId, storeId, paymentId] = parts;
  if (!franchiseId || !storeId || !paymentId) return null;
  return { franchiseId, storeId, paymentId };
};

const assertStoreAccess = async (
  context: functions.https.CallableContext,
  franchiseId: string,
  storeId: string
): Promise<void> => {
  requireAuth(context);

  const role = context.auth!.token.role as string | undefined;
  if (role === 'superadmin') return;

  const storeIdClaim = context.auth!.token.storeId as string | undefined;
  if (storeIdClaim && storeIdClaim !== storeId) {
    throw new functions.https.HttpsError('permission-denied', 'Sem acesso a esta loja');
  }

  const storeAccess = context.auth!.token.storeAccess as string[] | undefined;
  if (Array.isArray(storeAccess) && storeAccess.length > 0) {
    if (storeAccess.includes('*') || storeAccess.includes(storeId)) return;
    throw new functions.https.HttpsError('permission-denied', 'Sem acesso a esta loja');
  }

  const memberDoc = await db
    .doc(`franchises/${franchiseId}/members/${context.auth!.uid}`)
    .get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Sem acesso a esta loja');
  }

  const membership = memberDoc.data() as { storeAccess?: string[] } | undefined;
  const accessList = Array.isArray(membership?.storeAccess) ? membership?.storeAccess : [];
  if (accessList.includes('*') || accessList.includes(storeId)) return;

  throw new functions.https.HttpsError('permission-denied', 'Sem acesso a esta loja');
};

const resolvePagBankConfig = (environment: 'sandbox' | 'production'): PagBankProviderConfig => {
  const config = functions.config().pagbank || {};
  const configuredEnv = config.env === 'production' ? 'production' : 'sandbox';
  const resolvedEnv = environment || configuredEnv;
  const authToken =
    (resolvedEnv === 'production' ? config.auth_token_production : config.auth_token_sandbox) ||
    config.auth_token;

  if (!authToken) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'PagBank auth_token nao configurado nas Functions.'
    );
  }

  return {
    environment: resolvedEnv,
    authToken,
    webhookUrl: config.webhook_url,
  };
};

/** @deprecated Full PAN masking removed (Phase 0 Security Hardening). cardLast4 is now extracted from provider response. */
// const maskCardLast4 — REMOVED: never receive full PAN in Cloud Functions

const ensureMethodAllowed = (configProvider: string, method: PaymentMethod): void => {
  if (configProvider !== 'pagbank') {
    throw new functions.https.HttpsError('failed-precondition', 'Gateway nao suportado para createPayment.');
  }
  if (!['pix', 'credit', 'debit'].includes(method)) {
    throw new functions.https.HttpsError('invalid-argument', 'Metodo de pagamento invalido.');
  }
};

export const createPaymentIntent = async (
  data: CreatePaymentInput,
  context: functions.https.CallableContext
): Promise<CreatePaymentResponse> => {
  requireAuth(context);

  const { franchiseId, storeId, method, amount, currency } = data;

  if (!franchiseId || !storeId) {
    throw new functions.https.HttpsError('invalid-argument', 'franchiseId e storeId sao obrigatorios.');
  }
  if (!method) {
    throw new functions.https.HttpsError('invalid-argument', 'Metodo de pagamento obrigatorio.');
  }
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Valor invalido.');
  }
  if (!currency) {
    throw new functions.https.HttpsError('invalid-argument', 'Moeda obrigatoria.');
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Itens do pedido sao obrigatorios.');
  }
  if (!data.customer?.name || !data.customer?.taxId) {
    throw new functions.https.HttpsError('invalid-argument', 'Dados do cliente obrigatorios.');
  }
  if ((method === 'credit' || method === 'debit') && !data.card) {
    throw new functions.https.HttpsError('invalid-argument', 'Dados do cartao obrigatorios.');
  }
  if (data.card) {
    if (!data.card.encrypted) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Campo card.encrypted obrigatorio. Dados raw de cartao (PAN/CVV) nao sao aceitos.'
      );
    }
  }

  requireFranchiseAccess(context, franchiseId);
  await assertStoreAccess(context, franchiseId, storeId);

  const storeRef = db.doc(`franchises/${franchiseId}/stores/${storeId}`);
  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Loja nao encontrada.');
  }

  const gatewayConfig = normalizePaymentGatewayConfig(storeSnap.data());
  if (!gatewayConfig || gatewayConfig.provider === 'none') {
    throw new functions.https.HttpsError('failed-precondition', 'Gateway de pagamento nao configurado.');
  }

  ensureMethodAllowed(gatewayConfig.provider, method);

  if (!isMethodEnabled(gatewayConfig, method)) {
    throw new functions.https.HttpsError('failed-precondition', 'Metodo de pagamento desativado.');
  }

  const pagbankClientId = gatewayConfig.providers?.pagbank?.clientId;
  const pagbankPublicKey = gatewayConfig.providers?.pagbank?.publicKey;
  if (!pagbankClientId) {
    throw new functions.https.HttpsError('failed-precondition', 'PagBank clientId nao configurado.');
  }
  if ((method === 'credit' || method === 'debit') && !pagbankPublicKey) {
    throw new functions.https.HttpsError('failed-precondition', 'PagBank publicKey nao configurado.');
  }

  // ====================================================================
  // KIO-18: Idempotency — deduplicate by orderId before creating new payment
  // If an active (non-terminal) payment already exists for this orderId,
  // return it instead of creating a duplicate.
  // ====================================================================
  if (data.orderId) {
    const existingSnap = await storeRef
      .collection('payments')
      .where('orderId', '==', data.orderId)
      .where('status', 'in', ['pending', 'paid'])
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingPayment = existingDoc.data() as PaymentRecord;
      functions.logger.info('[payments] Idempotency hit — returning existing payment', {
        paymentId: existingDoc.id,
        orderId: data.orderId,
        status: existingPayment.status,
      });
      return {
        paymentId: existingDoc.id,
        provider: existingPayment.provider,
        method: existingPayment.method,
        status: existingPayment.status,
        pix: existingPayment.pix,
        providerOrderId: existingPayment.providerOrderId,
        providerPaymentId: existingPayment.providerPaymentId,
      };
    }
  }

  const paymentRef = storeRef.collection('payments').doc();
  const referenceId = buildReferenceId(franchiseId, storeId, paymentRef.id);
  const expiresAt =
    method === 'pix'
      ? new Date(
          Date.now() +
            (gatewayConfig.qrExpirationMinutes ?? DEFAULT_QR_EXPIRATION_MINUTES) * 60 * 1000
        ).toISOString()
      : undefined;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const paymentRecord: PaymentRecord = {
    franchiseId,
    storeId,
    provider: gatewayConfig.provider,
    method,
    status: 'pending',
    amount,
    currency,
    orderId: data.orderId,
    referenceId,
    environment: gatewayConfig.environment,
    pix: expiresAt ? { expiresAt } : undefined,
    customer: data.customer
      ? {
          name: data.customer.name,
          taxId: data.customer.taxId,
          email: data.customer.email,
        }
      : undefined,
    // cardLast4 will be set from provider response (see below)
    createdAt: now,
    updatedAt: now,
  };

  await paymentRef.set(paymentRecord);

  try {
    const pagbankConfig = resolvePagBankConfig(gatewayConfig.environment);
    const provider = createPagBankProvider(pagbankConfig);

    const providerPayload: ProviderCreatePaymentInput = {
      paymentId: paymentRef.id,
      referenceId,
      orderId: data.orderId,
      amount,
      currency,
      method,
      items: data.items,
      customer: data.customer,
      card: data.card,
      expiresAt,
    };

    const providerResult = await provider.createPayment(providerPayload);

    const update: Partial<PaymentRecord> = {
      status: providerResult.status,
      providerOrderId: providerResult.providerOrderId,
      providerPaymentId: providerResult.providerPaymentId,
      pix: providerResult.pix ?? paymentRecord.pix,
      // Extract cardLast4 from provider response (never from raw PAN)
      cardLast4: providerResult.providerMetadata?.cardLast4,
      updatedAt: now,
    };

    await paymentRef.set(update, { merge: true });

    return {
      paymentId: paymentRef.id,
      provider: gatewayConfig.provider,
      method,
      status: providerResult.status,
      pix: update.pix,
      providerOrderId: providerResult.providerOrderId,
      providerPaymentId: providerResult.providerPaymentId,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro ao criar pagamento.';
    await paymentRef.set(
      {
        status: 'failed',
        error: errorMessage,
        updatedAt: now,
      },
      { merge: true }
    );
    functions.logger.error('[payments] PagBank createPayment error', sanitizeForLog({ error: errorMessage }));
    throw new functions.https.HttpsError('internal', errorMessage);
  }
};

export const updatePaymentStatus = async (
  paymentRef: FirebaseFirestore.DocumentReference,
  status: PaymentStatus,
  update: Partial<PaymentRecord>
): Promise<void> => {
  await paymentRef.set(
    {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...update,
    },
    { merge: true }
  );
};

export const syncPendingPaymentsForPagBank = async (): Promise<void> => {
  const pendingSnap = await db
    .collectionGroup('payments')
    .where('status', '==', 'pending')
    .limit(50)
    .get();

  for (const doc of pendingSnap.docs) {
    const payment = doc.data() as PaymentRecord;
    if (payment.provider !== 'pagbank') continue;
    if (!payment.providerOrderId) continue;

    try {
      const pagbankConfig = resolvePagBankConfig(payment.environment || 'sandbox');
      const provider = createPagBankProvider(pagbankConfig);
      const statusResult = await provider.getPaymentStatus?.(payment);
      if (!statusResult) continue;
      if (statusResult.status !== payment.status) {
        // KIO-03/KIO-04: If cancel was requested but provider says paid,
        // mark as paid_after_cancel for admin reconciliation (requires manual refund).
        const isCancelRequested = !!(payment as any).cancelRequested;
        const newStatus = (isCancelRequested && statusResult.status === 'paid')
          ? 'paid' as PaymentStatus  // still mark as paid — but flag for refund
          : statusResult.status;

        const extraUpdate: Record<string, unknown> = {
          providerOrderId: statusResult.providerOrderId,
          providerPaymentId: statusResult.providerPaymentId,
          pix: statusResult.pix,
        };

        if (isCancelRequested && statusResult.status === 'paid') {
          extraUpdate.requiresRefund = true;
          extraUpdate.cancelRequestedBeforePayment = true;
          functions.logger.warn('[payments] Payment arrived AFTER cancel_requested — needs refund', {
            paymentId: doc.id,
            orderId: payment.orderId,
          });
        }

        await updatePaymentStatus(doc.ref, newStatus, extraUpdate);
      }
    } catch (error) {
      functions.logger.warn('[payments] sync pending failed', {
        paymentId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

export const verifyPagBankSignature = (
  signatureHeader: string | undefined,
  rawBody: string,
  token: string
): boolean => {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHash('sha256')
    .update(`${token}-${rawBody}`)
    .digest('hex');

  const signatureBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
};
