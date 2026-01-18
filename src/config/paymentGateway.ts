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
import type { PaymentGatewayConfig } from '@/types/store';

/**
 * Configuração resolvida de pagamento
 */
export interface ResolvedPaymentConfig {
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
export function getPaymentConfig(gatewayConfig?: PaymentGatewayConfig | null): ResolvedPaymentConfig {
  // Se não há config do Firestore ou não tem token, usa env vars
  if (!gatewayConfig?.accessToken) {
    return {
      accessToken: MERCADO_PAGO_CONFIG.ACCESS_TOKEN,
      mode: MERCADO_PAGO_CONFIG.MODE,
      userId: MERCADO_PAGO_CONFIG.USER_ID,
      storeId: MERCADO_PAGO_CONFIG.STORE_ID,
      externalPosId: MERCADO_PAGO_CONFIG.EXTERNAL_POS_ID,
      terminalId: MERCADO_PAGO_CONFIG.TERMINAL_ID,
      pointExpirationTime: MERCADO_PAGO_CONFIG.POINT_EXPIRATION_TIME,
      qrExpirationMinutes: MERCADO_PAGO_CONFIG.QR_EXPIRATION_MINUTES,
      pollingIntervalMs: MERCADO_PAGO_CONFIG.POLLING_INTERVAL_MS,
      pollingMaxAttempts: MERCADO_PAGO_CONFIG.POLLING_MAX_ATTEMPTS,
      source: 'env',
    };
  }

  // Config do Firestore com fallback para env vars em campos ausentes
  return {
    accessToken: gatewayConfig.accessToken,
    mode: gatewayConfig.mode || MERCADO_PAGO_CONFIG.MODE,
    userId: gatewayConfig.userId || MERCADO_PAGO_CONFIG.USER_ID,
    storeId: gatewayConfig.storeId || MERCADO_PAGO_CONFIG.STORE_ID,
    externalPosId: gatewayConfig.externalPosId || MERCADO_PAGO_CONFIG.EXTERNAL_POS_ID,
    terminalId: gatewayConfig.terminalId || MERCADO_PAGO_CONFIG.TERMINAL_ID,
    pointExpirationTime: gatewayConfig.pointExpirationTime || MERCADO_PAGO_CONFIG.POINT_EXPIRATION_TIME,
    qrExpirationMinutes: gatewayConfig.qrExpirationMinutes || MERCADO_PAGO_CONFIG.QR_EXPIRATION_MINUTES,
    pollingIntervalMs: gatewayConfig.pollingIntervalMs || MERCADO_PAGO_CONFIG.POLLING_INTERVAL_MS,
    pollingMaxAttempts: gatewayConfig.pollingMaxAttempts || MERCADO_PAGO_CONFIG.POLLING_MAX_ATTEMPTS,
    source: 'firestore',
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

  // Validações obrigatórias
  if (!config.accessToken) {
    errors.push('Access Token não configurado');
  }
  
  if (!config.externalPosId) {
    errors.push('External POS ID não configurado');
  }
  
  if (!config.userId) {
    errors.push('User ID não configurado');
  }

  // Avisos (não bloqueantes)
  if (!config.terminalId) {
    warnings.push('Terminal ID não configurado (será detectado automaticamente para pagamentos Point)');
  }

  if (!config.storeId) {
    warnings.push('Store ID não configurado (opcional para QR dinâmico)');
  }

  // Validação de formato do token (básica)
  if (config.accessToken && config.accessToken.length < 20) {
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
