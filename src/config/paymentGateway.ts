/**
 * Payment Gateway Configuration Helper
 * 
 * Provê configuração dinâmica de pagamento com prioridade:
 * 1. Config do Firestore (se disponível)
 * 2. Variáveis de ambiente (fallback)
 * 
 * Isso permite que cada loja configure seu próprio gateway
 * sem modificar variáveis de ambiente ou código.
 */

import { MERCADO_PAGO_CONFIG } from './mercadopago';
import type { PaymentGatewayConfig, PaymentProvider, PaymentEnvironment, EnabledPaymentMethods } from '@/types/store';

/**
 * Configuração resolvida de pagamento
 */
export interface ResolvedPaymentConfig {
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  enabledMethods: EnabledPaymentMethods;
  pixKey?: string;
  accessToken: string;
  mode: 'sandbox' | 'production';
  userId: string;
  storeId: string;
  externalPosId: string;
  terminalId: string;
  pointExpirationTime: string;
  qrExpirationMinutes: number;
  pollingIntervalMs: number;
  pollingMaxAttempts: number;
  /** Origem da configuração: 'firestore' ou 'env' */
  source: 'firestore' | 'env';
}

/**
 * Retorna configuração de pagamento com prioridade:
 * 1. Config do Firestore (se disponível e com accessToken)
 * 2. Variáveis de ambiente (fallback)
 * 
 * @param gatewayConfig - Configuração do Firestore (opcional)
 * @returns Configuração resolvida com todos os campos
 */
/**
 * Normaliza formato de payment provider (legacy → canonical)
 *
 * Converte legacy 'mercadopago' para canonical 'mercado_pago'.
 * Esta é a primeira linha de defesa para backward-compatibility com dados antigos.
 *
 * @param provider - Valor do Firestore (pode estar em formato legado)
 * @returns Canonical PaymentProvider
 */
const normalizeProvider = (provider?: PaymentProvider | string): PaymentProvider => {
  if (!provider) return 'mercado_pago';
  if (provider === 'mercadopago') return 'mercado_pago';
  if (provider === 'none' || provider === 'mercado_pago' || provider === 'pagbank') return provider;
  return 'none';
};

const resolveEnabledMethods = (gatewayConfig?: PaymentGatewayConfig | null): EnabledPaymentMethods => ({
  cash: gatewayConfig?.enabledMethods?.cash ?? true,
  pix: gatewayConfig?.enabledMethods?.pix ?? true,
  credit: gatewayConfig?.enabledMethods?.credit ?? true,
  debit: gatewayConfig?.enabledMethods?.debit ?? true,
});

/**
 * Normaliza configuração de pagamento a partir do documento da loja (Admin Web).
 * Mantém compatibilidade com campos legados sem reescrita duplicada.
 */
export function normalizePaymentGatewayConfigFromStore(
  storeData?: Record<string, unknown> | null
): PaymentGatewayConfig | null {
  if (!storeData) return null;

  const legacy = storeData as Record<string, any>;
  const legacyGateway = legacy.paymentGateway || {};
  const current = legacy.paymentGatewayConfig as PaymentGatewayConfig | undefined;

  const hasLegacyFields =
    legacy.acceptCash !== undefined ||
    legacy.acceptPix !== undefined ||
    legacy.acceptCard !== undefined ||
    legacy.pixKey !== undefined ||
    legacy.paymentGateway !== undefined;

  if (!current && !hasLegacyFields) {
    return null;
  }

  const provider = normalizeProvider(current?.provider || legacyGateway.provider);
  const environment: PaymentEnvironment =
    current?.environment || legacyGateway.environment || legacyGateway.mode || 'sandbox';

  const enabledMethods: EnabledPaymentMethods = {
    cash: current?.enabledMethods?.cash ?? legacy.acceptCash ?? true,
    pix: current?.enabledMethods?.pix ?? legacy.acceptPix ?? true,
    credit: current?.enabledMethods?.credit ?? legacy.acceptCard ?? true,
    debit: current?.enabledMethods?.debit ?? legacyGateway?.enabledMethods?.debit ?? true,
  };

  return {
    provider,
    environment,
    enabledMethods,
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
    accessToken: current?.accessToken || legacyGateway?.accessToken,
    mode: current?.mode || legacyGateway?.mode,
    userId: current?.userId || legacyGateway?.userId,
    storeId: current?.storeId || legacyGateway?.storeId,
    externalPosId: current?.externalPosId || legacyGateway?.externalPosId,
    terminalId: current?.terminalId || legacyGateway?.terminalId,
    pollingIntervalMs: current?.pollingIntervalMs || legacyGateway?.pollingIntervalMs,
    pollingMaxAttempts: current?.pollingMaxAttempts || legacyGateway?.pollingMaxAttempts,
    pointExpirationTime: current?.pointExpirationTime || legacyGateway?.pointExpirationTime,
    qrExpirationMinutes: current?.qrExpirationMinutes || legacyGateway?.qrExpirationMinutes,
    configuredAt: current?.configuredAt || legacyGateway?.configuredAt,
    configuredBy: current?.configuredBy || legacyGateway?.configuredBy,
    lastValidatedAt: current?.lastValidatedAt || legacyGateway?.lastValidatedAt,
    lastValidationResult: current?.lastValidationResult || legacyGateway?.lastValidationResult,
  };
}

export function getPaymentConfig(gatewayConfig?: PaymentGatewayConfig | null): ResolvedPaymentConfig {
  const provider = normalizeProvider(gatewayConfig?.provider);
  const environment = gatewayConfig?.environment || gatewayConfig?.mode || MERCADO_PAGO_CONFIG.MODE;
  const enabledMethods = resolveEnabledMethods(gatewayConfig);

  const hasFirestoreToken = !!gatewayConfig?.accessToken;
  const accessToken = gatewayConfig?.accessToken || MERCADO_PAGO_CONFIG.ACCESS_TOKEN;

  return {
    provider,
    environment,
    enabledMethods,
    pixKey: gatewayConfig?.pixKey,
    accessToken,
    mode: environment,
    userId: gatewayConfig?.providers?.mercadopago?.userId || gatewayConfig?.userId || MERCADO_PAGO_CONFIG.USER_ID,
    storeId: gatewayConfig?.providers?.mercadopago?.storeId || gatewayConfig?.storeId || MERCADO_PAGO_CONFIG.STORE_ID,
    externalPosId: gatewayConfig?.providers?.mercadopago?.externalPosId || gatewayConfig?.externalPosId || MERCADO_PAGO_CONFIG.EXTERNAL_POS_ID,
    terminalId: gatewayConfig?.providers?.mercadopago?.terminalId || gatewayConfig?.terminalId || MERCADO_PAGO_CONFIG.TERMINAL_ID,
    pointExpirationTime: gatewayConfig?.pointExpirationTime || MERCADO_PAGO_CONFIG.POINT_EXPIRATION_TIME,
    qrExpirationMinutes: gatewayConfig?.qrExpirationMinutes || MERCADO_PAGO_CONFIG.QR_EXPIRATION_MINUTES,
    pollingIntervalMs: gatewayConfig?.pollingIntervalMs || MERCADO_PAGO_CONFIG.POLLING_INTERVAL_MS,
    pollingMaxAttempts: gatewayConfig?.pollingMaxAttempts || MERCADO_PAGO_CONFIG.POLLING_MAX_ATTEMPTS,
    source: hasFirestoreToken ? 'firestore' : 'env',
  };
}

/**
 * Resultado de validação da configuração de pagamento
 */
export interface PaymentConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida se há configuração mínima para processar pagamentos
 * 
 * @param gatewayConfig - Configuração do Firestore (opcional)
 * @returns Objeto com status de validação e lista de erros/avisos
 */
export function validatePaymentConfig(gatewayConfig?: PaymentGatewayConfig | null): PaymentConfigValidation {
  const config = getPaymentConfig(gatewayConfig);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.provider === 'none') {
    warnings.push('Gateway de pagamento desativado');
    return { valid: true, errors, warnings };
  }

  if (config.provider === 'pagbank') {
    const clientId = gatewayConfig?.providers?.pagbank?.clientId;
    const publicKey = gatewayConfig?.providers?.pagbank?.publicKey;
    const needsPix = config.enabledMethods.pix;
    const needsCard = config.enabledMethods.credit || config.enabledMethods.debit;

    if ((needsPix || needsCard) && !clientId) {
      errors.push('PagBank Client ID não configurado');
    }
    if (needsCard && !publicKey) {
      errors.push('PagBank Public Key não configurada');
    }
  } else if (config.provider === 'mercado_pago') {
    if (!config.accessToken) {
      errors.push('Access Token não configurado');
    }
    if (!config.externalPosId) {
      errors.push('External POS ID não configurado');
    }
    if (!config.userId) {
      errors.push('User ID não configurado');
    }
  }

  // Avisos (não bloqueantes)
  if (config.provider === 'mercado_pago' && !config.terminalId) {
    warnings.push('Terminal ID não configurado (será detectado automaticamente para pagamentos Point)');
  }

  if (config.provider === 'mercado_pago' && !config.storeId) {
    warnings.push('Store ID não configurado (opcional para QR dinâmico)');
  }

  // Validação de formato do token (básica)
  if (config.provider === 'mercado_pago' && config.accessToken && config.accessToken.length < 20) {
    errors.push('Access Token parece inválido (muito curto)');
  }

  // Validação de modo
  if (config.mode !== 'sandbox' && config.mode !== 'production') {
    errors.push('Modo deve ser "sandbox" ou "production"');
  }

  return { 
    valid: errors.length === 0, 
    errors, 
    warnings 
  };
}

/**
 * Verifica se pagamentos estão configurados (Firestore ou env vars)
 */
export function isPaymentConfigured(gatewayConfig?: PaymentGatewayConfig | null): boolean {
  const config = getPaymentConfig(gatewayConfig);
  if (config.provider === 'pagbank') {
    const clientId = gatewayConfig?.providers?.pagbank?.clientId;
    const publicKey = gatewayConfig?.providers?.pagbank?.publicKey;
    const needsPix = config.enabledMethods.pix;
    const needsCard = config.enabledMethods.credit || config.enabledMethods.debit;

    if (!needsPix && !needsCard) {
      return true;
    }

    if (needsCard) {
      return !!clientId && !!publicKey;
    }

    return !!clientId;
  }
  if (config.provider === 'none') {
    return false;
  }
  return !!config.accessToken && !!config.externalPosId && !!config.userId;
}

/**
 * Retorna descrição legível da fonte de configuração
 */
export function getPaymentConfigSource(gatewayConfig?: PaymentGatewayConfig | null): string {
  const config = getPaymentConfig(gatewayConfig);
  
  if (config.source === 'firestore') {
    return 'Configurado via Painel Admin';
  }
  
  return 'Usando variáveis de ambiente';
}
