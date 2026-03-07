/**
 * ============================================================================
 * Payment Gateway Normalization Utilities
 * ============================================================================
 *
 * Functions to normalize, sanitize, and validate payment gateway configuration.
 * Handles backward compatibility with legacy Firestore field formats.
 */

import type {
  PaymentGatewayConfig,
  PaymentProvider,
  PaymentEnvironment,
  EnabledPaymentMethods,
} from '@/types/store';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

export const DEFAULT_ENABLED_METHODS: EnabledPaymentMethods = {
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
 * @returns Canonical PaymentProvider
 */
export const normalizeProvider = (provider?: PaymentProvider | string): PaymentProvider => {
  if (!provider) return 'mercado_pago';
  if (provider === 'mercadopago') return 'mercado_pago';
  if (provider === 'none' || provider === 'mercado_pago' || provider === 'pagbank') return provider;
  return 'none';
};

/**
 * Normalize raw Firestore data into canonical PaymentGatewayConfig.
 * Supports both legacy flat fields and the new nested paymentGatewayConfig format.
 */
export const normalizePaymentGatewayConfig = (data?: Record<string, any> | null): PaymentGatewayConfig => {
  const legacy = (data as Record<string, any>) || {};
  const legacyGateway = legacy.paymentGateway || {};
  const current = data?.paymentGatewayConfig;
  const provider = normalizeProvider(current?.provider || legacyGateway.provider);
  const environment: PaymentEnvironment = current?.environment || legacyGateway.environment || legacyGateway.mode || 'sandbox';

  const enabledMethods: EnabledPaymentMethods = {
    cash: current?.enabledMethods?.cash ?? legacy.acceptCash ?? DEFAULT_ENABLED_METHODS.cash,
    pix: current?.enabledMethods?.pix ?? legacy.acceptPix ?? DEFAULT_ENABLED_METHODS.pix,
    credit: current?.enabledMethods?.credit ?? legacy.acceptCard ?? DEFAULT_ENABLED_METHODS.credit,
    debit: current?.enabledMethods?.debit ?? legacyGateway?.enabledMethods?.debit ?? DEFAULT_ENABLED_METHODS.debit,
  };

  const pixKey = current?.pixKey ?? legacy.pixKey;

  return {
    provider,
    environment,
    enabledMethods,
    pixKey,
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
    configuredAt: current?.configuredAt || legacyGateway?.configuredAt,
    lastValidatedAt: current?.lastValidatedAt || legacyGateway?.lastValidatedAt,
    lastValidationResult: current?.lastValidationResult || legacyGateway?.lastValidationResult,
  };
};

/**
 * Sanitize a PaymentGatewayConfig for Firestore write.
 * Removes secrets and legacy fields that should not be persisted.
 */
export const sanitizePaymentGatewayConfigForSave = (config: PaymentGatewayConfig): PaymentGatewayConfig => {
  const sanitized = sanitizeFirestoreData(config) as PaymentGatewayConfig;
  // Remove segredos e campos legados do payload de escrita
  delete (sanitized as any).accessToken;
  delete (sanitized as any).mode;
  delete (sanitized as any).userId;
  delete (sanitized as any).storeId;
  delete (sanitized as any).externalPosId;
  delete (sanitized as any).terminalId;
  // Clean dead PagBank fields
  if (sanitized.providers?.pagbank) {
    delete (sanitized.providers.pagbank as any).clientId;
    delete (sanitized.providers.pagbank as any).merchantId;
  }
  return sanitized;
};

/**
 * Validate payment gateway config and return an array of error messages.
 * Returns empty array if validation passes.
 */
export const validatePaymentGatewayConfig = (config: PaymentGatewayConfig): string[] => {
  const errors: string[] = [];

  if (config.provider === 'pagbank') {
    const publicKey = config.providers?.pagbank?.publicKey;
    const plugpagEnabled = (config.providers?.pagbank as any)?.plugpag?.enabled;
    const needsCard = config.enabledMethods?.credit || config.enabledMethods?.debit;

    // publicKey is only needed for online card payments (PagBank.js SDK).
    // PlugPag terminal payments are processed locally and don't need it.
    if (needsCard && !publicKey && !plugpagEnabled) {
      errors.push('PagBank: Public Key é obrigatório para cartão online (não necessário com maquininha).');
    }
    // clientId is NOT required — PagBank API uses Bearer token auth only
  }

  return errors;
};
