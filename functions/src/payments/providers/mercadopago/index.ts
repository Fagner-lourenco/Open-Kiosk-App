import * as logger from 'firebase-functions/logger';
import crypto from 'crypto';
import type {
  PaymentProvider,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderPaymentStatusResult,
  ProviderMetadata,
  PaymentRecord,
  PaymentStatus,
} from '../../types';

export interface MercadoPagoProviderConfig {
  environment: 'sandbox' | 'production';
  accessToken: string;
  webhookSecret?: string;
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  terminalId?: string;
}

const MP_BASE_URL = 'https://api.mercadopago.com';

/**
 * MP Orders API expects amounts as strings with 2 decimal places.
 */
const toAmountString = (amount: number): string => amount.toFixed(2);

/**
 * Map MP order status to our PaymentStatus.
 *
 * MP statuses: created, opened, at_terminal, processed, canceled, expired, failed
 * MP payment statuses within transactions: processed, approved, rejected, refunded
 */
export const mapMPStatus = (status?: string): PaymentStatus => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'processed' || normalized === 'approved') return 'paid';
  if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'failed' || normalized === 'rejected') return 'failed';
  if (normalized === 'refunded') return 'refunded';
  // created, opened, at_terminal → pending
  return 'pending';
};

/**
 * Extract only allowlisted fields from MP order response.
 * NEVER store the full order object — it may contain PII.
 */
const extractProviderMetadata = (order: any): ProviderMetadata => {
  const payment = order?.transactions?.payments?.[0];
  return {
    orderId: typeof order?.id === 'string' ? order.id : undefined,
    status: typeof order?.status === 'string' ? order.status : undefined,
    cardBrand: typeof payment?.payment_method?.id === 'string' ? payment.payment_method.id : undefined,
    nsu: typeof payment?.reference?.id === 'string' ? String(payment.reference.id) : undefined,
  };
};

/**
 * Make authenticated request to MP API.
 */
const mpRequest = async <T>(
  config: MercadoPagoProviderConfig,
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: string }
): Promise<T> => {
  const url = `${MP_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    logger.error('[MercadoPago] API error', {
      status: response.status,
      errorBody: text.substring(0, 1000),
      errors: payload?.errors,
      errorMessage: payload?.message,
    });
    const details = payload?.errors?.map((e: any) => e.details?.join('; ')).join(' | ') || '';
    const message = details
      ? `MercadoPago HTTP ${response.status}: ${details}`
      : payload?.message || `MercadoPago HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
};

/**
 * Create Mercado Pago payment provider following the same factory pattern as PagBank.
 *
 * Supports Orders API V2 for both QR and Point channels.
 */
export const createMercadoPagoProvider = (config: MercadoPagoProviderConfig): PaymentProvider => {
  return {
    async createPayment(input: ProviderCreatePaymentInput): Promise<ProviderCreatePaymentResult> {
      const channel = input.channel;
      if (!channel || (channel !== 'qr' && channel !== 'point')) {
        throw new Error('Channel (qr ou point) obrigatorio para Mercado Pago.');
      }

      const amountStr = toAmountString(input.amount);
      const idempotencyKey = crypto.randomUUID();

      // Build items for the order (QR only — Point does NOT accept items)
      const items = input.items.map((item) => ({
        title: item.name,
        quantity: item.quantity,
        unit_price: toAmountString(item.unitAmount),
        unit_measure: 'unit',
      }));

      // Base order payload (common for QR and Point)
      // NOTE: MP Orders API V2 does NOT accept 'title' at root level
      const orderPayload: Record<string, any> = {
        type: channel,
        external_reference: input.referenceId,
        description: `Pagamento Open Kiosk`,
        transactions: {
          payments: [
            {
              amount: amountStr,
            },
          ],
        },
      };

      // Channel-specific config
      if (channel === 'qr') {
        if (!config.externalPosId) {
          throw new Error('externalPosId obrigatorio para pagamento QR no Mercado Pago.');
        }
        // QR: needs total_amount at root level, items allowed
        orderPayload.total_amount = amountStr;
        orderPayload.items = items;
        orderPayload.config = {
          qr: {
            external_pos_id: config.externalPosId,
            mode: 'dynamic',
          },
        };
      } else {
        // Point
        if (!config.terminalId) {
          throw new Error('terminalId obrigatorio para pagamento Point no Mercado Pago.');
        }
        // Point: NO total_amount, NO items at root level
        // Map method to MP payment_method type for Point terminal
        const pointPaymentType = input.method === 'debit' ? 'debit_card' : 'credit_card';
        orderPayload.config = {
          point: {
            terminal_id: config.terminalId,
            print_on_terminal: 'no_ticket',
          },
          payment_method: {
            default_type: pointPaymentType,
          },
        };
      }

      const order = await mpRequest<any>(config, '/v1/orders', {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(orderPayload),
      });

      // For QR: extract qr_data from the response
      // MP returns qr_data at order.type_response.qr_data (NOT config.qr.type_response)
      const qrData = order?.type_response?.qr_data;

      if (channel === 'qr' && !qrData) {
        logger.error('[MercadoPago] QR order created but qr_data missing from response', {
          orderId: order?.id,
          status: order?.status,
        });
      }

      return {
        status: mapMPStatus(order?.status),
        providerOrderId: order?.id,
        providerPaymentId: order?.transactions?.payments?.[0]?.reference?.id
          ? String(order.transactions.payments[0].reference.id)
          : undefined,
        qrData: qrData || undefined,
        providerMetadata: extractProviderMetadata(order),
      };
    },

    async getPaymentStatus(payment: PaymentRecord): Promise<ProviderPaymentStatusResult> {
      if (!payment.providerOrderId) {
        throw new Error('providerOrderId ausente para consulta no Mercado Pago.');
      }

      const order = await mpRequest<any>(config, `/v1/orders/${payment.providerOrderId}`, {
        method: 'GET',
      });

      const paymentTx = order?.transactions?.payments?.[0];

      return {
        status: mapMPStatus(order?.status),
        providerStatus: order?.status || undefined,
        providerOrderId: order?.id,
        providerPaymentId: paymentTx?.reference?.id
          ? String(paymentTx.reference.id)
          : undefined,
        providerMetadata: extractProviderMetadata(order),
      };
    },
  };
};

/**
 * Verify Mercado Pago webhook HMAC signature.
 *
 * MP sends `x-signature: ts=<ts>,v1=<hash>`
 * Template: `id:<data_id_lowercase>;request-id:<x_request_id>;ts:<ts>;`
 * HMAC-SHA256 with webhook secret from dashboard.
 *
 * @param xSignature - x-signature header value
 * @param dataId - data.id from query parameter (MP order ID)
 * @param xRequestId - x-request-id header value
 * @param secret - webhook secret from MP dashboard
 */
export const verifyMPSignature = (
  xSignature: string | undefined,
  dataId: string | undefined,
  xRequestId: string | undefined,
  secret: string
): boolean => {
  if (!xSignature || !dataId || !xRequestId) return false;

  // Parse ts and v1 from x-signature header
  const parts = xSignature.split(',');
  let ts = '';
  let hash = '';
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key?.trim() === 'ts') ts = value?.trim() || '';
    if (key?.trim() === 'v1') hash = value?.trim() || '';
  }

  if (!ts || !hash) return false;

  // IMPORTANT: data.id must be LOWERCASE in the template
  const template = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(template)
    .digest('hex');

  const hashBuffer = Buffer.from(hash);
  const expectedBuffer = Buffer.from(expected);

  if (hashBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(hashBuffer, expectedBuffer);
};
