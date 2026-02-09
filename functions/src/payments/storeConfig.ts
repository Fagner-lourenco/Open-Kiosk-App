import type { NormalizedPaymentGatewayConfig, PaymentMethod } from './types';

const DEFAULT_ENABLED_METHODS = {
  cash: true,
  pix: true,
  credit: true,
  debit: true,
};

/**
 * Normaliza formato de payment provider (legacy → canonical)
 *
 * Converte legacy 'mercadopago' para canonical 'mercado_pago'.
 * Esta é a primeira linha de defesa para backward-compatibility com dados antigos.
 *
 * @param provider - Valor do Firestore (pode estar em formato legado)
 * @returns Canonical payment provider
 */
const normalizeProvider = (provider?: string): NormalizedPaymentGatewayConfig['provider'] => {
  if (!provider) return 'mercado_pago';
  if (provider === 'mercadopago') return 'mercado_pago';
  if (provider === 'none' || provider === 'mercado_pago' || provider === 'pagbank') return provider;
  return 'none';
};

export const normalizePaymentGatewayConfig = (
  storeData?: Record<string, unknown> | null
): NormalizedPaymentGatewayConfig | null => {
  if (!storeData) return null;

  const legacy = storeData as Record<string, any>;
  const legacyGateway = legacy.paymentGateway || {};
  const current = legacy.paymentGatewayConfig as Record<string, any> | undefined;

  const hasLegacyFields =
    legacy.acceptCash !== undefined ||
    legacy.acceptPix !== undefined ||
    legacy.acceptCard !== undefined ||
    legacy.pixKey !== undefined ||
    legacy.paymentGateway !== undefined;

  if (!current && !hasLegacyFields && !legacyGateway) {
    return null;
  }

  const provider = normalizeProvider(current?.provider || legacyGateway.provider);
  const environment = current?.environment || legacyGateway.environment || legacyGateway.mode || 'sandbox';

  return {
    provider,
    environment,
    enabledMethods: {
      cash: current?.enabledMethods?.cash ?? legacy.acceptCash ?? DEFAULT_ENABLED_METHODS.cash,
      pix: current?.enabledMethods?.pix ?? legacy.acceptPix ?? DEFAULT_ENABLED_METHODS.pix,
      credit: current?.enabledMethods?.credit ?? legacy.acceptCard ?? DEFAULT_ENABLED_METHODS.credit,
      debit: current?.enabledMethods?.debit ?? legacyGateway?.enabledMethods?.debit ?? DEFAULT_ENABLED_METHODS.debit,
    },
    pixKey: current?.pixKey ?? legacy.pixKey,
    providers: {
      pagbank: {
        ...(current?.providers?.pagbank || {}),
        clientId: current?.providers?.pagbank?.clientId || legacyGateway?.clientId,
        merchantId: current?.providers?.pagbank?.merchantId || legacyGateway?.merchantId,
        publicKey: current?.providers?.pagbank?.publicKey || legacyGateway?.publicKey,
      },
      mercadopago: {
        ...(current?.providers?.mercadopago || {}),
        userId: current?.providers?.mercadopago?.userId || legacyGateway?.userId,
        storeId: current?.providers?.mercadopago?.storeId || legacyGateway?.storeId,
        externalPosId: current?.providers?.mercadopago?.externalPosId || legacyGateway?.externalPosId,
        terminalId: current?.providers?.mercadopago?.terminalId || legacyGateway?.terminalId,
      },
    },
    qrExpirationMinutes: current?.qrExpirationMinutes || legacyGateway?.qrExpirationMinutes,
  };
};

export const isMethodEnabled = (config: NormalizedPaymentGatewayConfig, method: PaymentMethod): boolean => {
  if (method === 'pix') return config.enabledMethods.pix;
  if (method === 'credit') return config.enabledMethods.credit;
  if (method === 'debit') return config.enabledMethods.debit;
  return false;
};
