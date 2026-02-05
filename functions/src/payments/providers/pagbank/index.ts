import type {
  PaymentProvider,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderPaymentStatusResult,
  PaymentRecord,
  PaymentStatus,
} from '../../types';

export interface PagBankProviderConfig {
  environment: 'sandbox' | 'production';
  authToken: string;
  webhookUrl?: string;
}

const PAGBANK_BASE_URL: Record<PagBankProviderConfig['environment'], string> = {
  sandbox: 'https://sandbox.api.pagseguro.com',
  production: 'https://api.pagseguro.com',
};

const toCents = (amount: number): number => Math.round(amount * 100);

const mapPagBankStatus = (status?: string): PaymentStatus => {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'PAID' || normalized === 'AUTHORIZED') return 'paid';
  if (normalized === 'CANCELED' || normalized === 'CANCELLED') return 'canceled';
  if (normalized === 'DECLINED' || normalized === 'FAILED') return 'failed';
  if (normalized === 'EXPIRED') return 'expired';
  return 'pending';
};

const extractQrCode = (order: any): { qrCodeText?: string; qrCodeImage?: string } => {
  const qr = Array.isArray(order?.qr_codes) ? order.qr_codes[0] : undefined;
  const qrCodeText = qr?.text || qr?.links?.find?.((link: any) => link?.rel === 'QRCODE')?.href;
  const qrCodeImage = qr?.links?.find?.((link: any) => {
    const rel = (link?.rel || '').toString().toLowerCase();
    return rel.includes('qrcode') || rel.includes('image');
  })?.href;
  return { qrCodeText, qrCodeImage };
};

const pagbankRequest = async <T>(
  config: PagBankProviderConfig,
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: string }
): Promise<T> => {
  const url = `${PAGBANK_BASE_URL[config.environment]}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.authToken}`,
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
    const message = payload?.error_description || payload?.message || `PagBank HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
};

export const createPagBankProvider = (config: PagBankProviderConfig): PaymentProvider => {
  return {
    async createPayment(input: ProviderCreatePaymentInput): Promise<ProviderCreatePaymentResult> {
      const amountValue = toCents(input.amount);
      const itemList = input.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_amount: toCents(item.unitAmount),
      }));

      const payload: Record<string, any> = {
        reference_id: input.referenceId,
        items: itemList,
      };

      if (config.webhookUrl) {
        payload.notification_urls = [config.webhookUrl];
      }

      if (input.customer) {
        payload.customer = {
          name: input.customer.name,
          tax_id: input.customer.taxId,
          email: input.customer.email,
        };
      }

      if (input.method === 'pix') {
        payload.qr_codes = [
          {
            amount: { value: amountValue },
            expiration_date: input.expiresAt,
          },
        ];
      } else {
        if (!input.card) {
          throw new Error('Dados do cartao ausentes para pagamento com cartao.');
        }
        payload.charges = [
          {
            amount: {
              value: amountValue,
              currency: input.currency || 'BRL',
            },
            payment_method: {
              type: input.method === 'credit' ? 'CREDIT_CARD' : 'DEBIT_CARD',
              card: {
                number: input.card.number,
                exp_month: input.card.expMonth,
                exp_year: input.card.expYear,
                security_code: input.card.securityCode,
                holder: {
                  name: input.card.holderName,
                  tax_id: input.card.holderTaxId,
                },
              },
            },
          },
        ];
      }

      const order = await pagbankRequest<any>(config, '/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const qrData = extractQrCode(order);
      const charge = Array.isArray(order?.charges) ? order.charges[0] : undefined;

      return {
        status: mapPagBankStatus(order?.status || charge?.status),
        providerOrderId: order?.id,
        providerPaymentId: charge?.id,
        pix: qrData.qrCodeText || qrData.qrCodeImage
          ? {
              qrCodeText: qrData.qrCodeText,
              qrCodeImage: qrData.qrCodeImage,
              expiresAt: input.expiresAt,
            }
          : undefined,
        raw: order,
      };
    },

    async getPaymentStatus(payment: PaymentRecord): Promise<ProviderPaymentStatusResult> {
      if (!payment.providerOrderId) {
        throw new Error('providerOrderId ausente para consulta no PagBank.');
      }

      const order = await pagbankRequest<any>(config, `/orders/${payment.providerOrderId}`, {
        method: 'GET',
      });

      const qrData = extractQrCode(order);
      const charge = Array.isArray(order?.charges) ? order.charges[0] : undefined;

      return {
        status: mapPagBankStatus(order?.status || charge?.status),
        providerOrderId: order?.id,
        providerPaymentId: charge?.id,
        pix: qrData.qrCodeText || qrData.qrCodeImage
          ? {
              qrCodeText: qrData.qrCodeText,
              qrCodeImage: qrData.qrCodeImage,
              expiresAt: payment.pix?.expiresAt,
            }
          : undefined,
        raw: order,
      };
    },
  };
};
