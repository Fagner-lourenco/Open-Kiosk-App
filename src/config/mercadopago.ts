/**
 * Configuração de constantes do Mercado Pago QR e Point
 * Obtidas do painel de integração e das variáveis de ambiente
 */

/**
 * Obtém o token de acesso correto baseado no modo (sandbox/production)
 */
function getAccessToken(): string {
  const mode = import.meta.env.VITE_MP_MODE || 'sandbox';
  
  if (mode === 'production') {
    return import.meta.env.VITE_MP_ACCESS_TOKEN_PRODUCTION || import.meta.env.VITE_MP_ACCESS_TOKEN || '';
  }
  
  return import.meta.env.VITE_MP_ACCESS_TOKEN_SANDBOX || import.meta.env.VITE_MP_ACCESS_TOKEN || '';
}

export const MERCADO_PAGO_CONFIG = {
  // Token de acesso (selecionado automaticamente baseado no modo)
  ACCESS_TOKEN: getAccessToken(),
  
  // Modo de operação
  MODE: (import.meta.env.VITE_MP_MODE || 'sandbox') as 'sandbox' | 'production',
  
  // User ID (necessário para endpoint QR Instore)
  USER_ID: import.meta.env.VITE_MP_USER_ID || '1180135961',
  
  // Loja e POS/Caixa para QR Instore (PIX)
  // Deve ser criado via API /users/{user_id}/stores e /pos
  STORE_ID: import.meta.env.VITE_MP_STORE_ID || '',
  EXTERNAL_STORE_ID: 'LOJ001',
  POS_ID: import.meta.env.VITE_MP_POS_ID || '',
  EXTERNAL_POS_ID: import.meta.env.VITE_MP_EXTERNAL_POS_ID || '',
  
  // Terminal Point (para pagamentos com cartão físico no terminal)
  // Formato: TIPO__SERIAL (ex: NEWLAND_N950__N950NCB300544833)
  // IMPORTANTE: Terminal Point é diferente de POS. Terminal = cartão físico, POS = QR/PIX
  TERMINAL_ID: import.meta.env.VITE_MP_TERMINAL_ID || '',
  
  // Timeouts otimizados para self-service
  QR_EXPIRATION_MINUTES: 10, // 10 minutos para QR (padrão razoável)
  POINT_EXPIRATION_TIME: import.meta.env.VITE_MP_POINT_EXPIRATION || 'PT3M', // 3 minutos para terminal (recomendado self-service)
  POLLING_INTERVAL_MS: 3000, // 3 segundos (feedback rápido)
  POLLING_MAX_ATTEMPTS: 60, // ~3 minutos com intervalo de 3s
  
  // Categoria MCC (Gastronomia/Restaurantes)
  MCC_CATEGORY: 621102,
} as const;

/**
 * Status possíveis de uma order Point
 */
export const POINT_ORDER_STATUS = {
  CREATED: 'created',
  AT_TERMINAL: 'at_terminal',
  PROCESSED: 'processed',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  FAILED: 'failed',
  ACTION_REQUIRED: 'action_required',
} as const;

/**
 * Verificar se o POS ID está correto
 */
export function validateMercadoPagoConfig(): boolean {
  const { EXTERNAL_POS_ID } = MERCADO_PAGO_CONFIG;
  
  if (!EXTERNAL_POS_ID || EXTERNAL_POS_ID.length === 0) {
    console.error('[Config] EXTERNAL_POS_ID não configurado');
    return false;
  }
  
  return true;
}

/**
 * Verificar se o terminal Point está configurado
 */
export function validatePointConfig(): { valid: boolean; terminalId?: string; error?: string } {
  const { TERMINAL_ID } = MERCADO_PAGO_CONFIG;
  
  if (!TERMINAL_ID || TERMINAL_ID.length === 0) {
    return { 
      valid: false, 
      error: 'Terminal Point não configurado. Defina VITE_MP_TERMINAL_ID ou será buscado automaticamente.' 
    };
  }
  
  return { valid: true, terminalId: TERMINAL_ID };
}
