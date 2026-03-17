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
// CANONICAL SOURCE: shared/utils/normalizeProvider.ts
// Cópia local mantida porque FUNCTIONS não importa de shared/.
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
  const legacyGateway = legacy.paymentGateway as Record<string, any> | undefined;
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

  const provider = normalizeProvider(current?.provider || legacyGateway?.provider);
  const environment = current?.environment || legacyGateway?.environment || legacyGateway?.mode || 'sandbox';

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
        // clientId and merchantId removed — dead fields never used by PagBank API
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

export interface MercadoPagoProviderConfig {
  environment: 'sandbox' | 'production';
  accessToken: string;
  webhookSecret?: string;
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  terminalId?: string;
}

export const resolveMercadoPagoConfig = (
  gatewayConfig: NormalizedPaymentGatewayConfig
): MercadoPagoProviderConfig => {
  const accessToken =
    (gatewayConfig.environment === 'production'
      ? process.env.MP_ACCESS_TOKEN_PRODUCTION
      : process.env.MP_ACCESS_TOKEN_SANDBOX) ||
    process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    const { HttpsError } = require('firebase-functions/v2/https');
    throw new HttpsError(
      'failed-precondition',
      'MP access_token nao configurado nas Functions.'
    );
  }

  const mpConfig = gatewayConfig.providers?.mercadopago;

  return {
    environment: gatewayConfig.environment,
    accessToken,
    webhookSecret: process.env.MP_WEBHOOK_SECRET,
    userId: mpConfig?.userId,
    storeId: mpConfig?.storeId,
    externalPosId: mpConfig?.externalPosId,
    terminalId: mpConfig?.terminalId,
  };
};

export const isMethodEnabled = (config: NormalizedPaymentGatewayConfig, method: PaymentMethod): boolean => {
  if (method === 'pix') return config.enabledMethods.pix;
  if (method === 'credit') return config.enabledMethods.credit;
  if (method === 'debit') return config.enabledMethods.debit;
  return false;
};

/**
 * Resolve terminalId / externalPosId por torneira (tap-level),
 * com fallback para store-level quando o tap não tem configuração específica.
 *
 * Cadeia de resolução:
 *   1. tap.mpTerminalId / tap.mpExternalPosId  (per-tap)
 *   2. storeConfig.providers.mercadopago.terminalId / externalPosId  (store-level)
 */
export const resolveTerminalForTap = (
  tapId: string | undefined,
  storeData: Record<string, any> | undefined,
  storeConfig: MercadoPagoProviderConfig,
): { terminalId?: string; externalPosId?: string } => {
  if (tapId && storeData?.taps && Array.isArray(storeData.taps)) {
    const tap = storeData.taps.find(
      (t: any) => String(t.id) === String(tapId)
    );
    if (tap) {
      return {
        terminalId: tap.mpTerminalId || storeConfig.terminalId,
        externalPosId: tap.mpExternalPosId || storeConfig.externalPosId,
      };
    }
  }
  // Fallback: store-level (compatível com fluxo atual)
  return {
    terminalId: storeConfig.terminalId,
    externalPosId: storeConfig.externalPosId,
  };
};
