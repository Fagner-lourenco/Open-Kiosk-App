/**
 * Configuração de constantes do Mercado Pago QR e Point
 * Obtidas do painel de integração e testes
 */

export const MERCADO_PAGO_CONFIG = {
  // Loja criada
  STORE_ID: '72549157',
  EXTERNAL_STORE_ID: 'LOJ001',
  
  // POS/Caixa criado
  POS_ID: '123344143',
  EXTERNAL_POS_ID: 'LOJ001POS001', // CRÍTICO: Deve ser enviado em config.qr.external_pos_id
  
  // Terminal Point (para pagamentos com cartão)
  // Formato: TIPO__SERIAL (ex: NEWLAND_N950__N950NCB801293324)
  // Obter via API listTerminals ou variável de ambiente
  TERMINAL_ID: import.meta.env.VITE_MP_TERMINAL_ID || '',
  
  // Timeouts
  QR_EXPIRATION_MINUTES: 15, // Padrão Mercado Pago
  POINT_EXPIRATION_TIME: 'PT5M', // 5 minutos para pagamento no terminal
  POLLING_INTERVAL_MS: 5000, // 5 segundos
  POLLING_MAX_ATTEMPTS: 60, // 5 minutos total
  
  // Categoria MCC (Gastronomia)
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
