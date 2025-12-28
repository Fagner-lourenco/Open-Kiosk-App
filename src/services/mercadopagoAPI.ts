/**
 * Mercado Pago API Client
 * Wrapper para endpoints oficiais do Mercado Pago Point/QR
 * Referência: https://www.mercadopago.com.br/developers/pt/reference
 */

import type {
  MercadoPagoConfig,
  Terminal,
  TerminalsListResponse,
  Order,
  CreateOrderRequest,
  MercadoPagoError
} from '@/types/mercadopago';

export class MercadoPagoAPI {
  private config: MercadoPagoConfig;
  private defaultTimeoutMs = 30000; // 30 segundos timeout padrão

  constructor(config: MercadoPagoConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Criar AbortController para timeout
    const controller = new AbortController();
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combinar signals se já existir um externo (com cleanup para evitar memory leak)
    const existingSignal = options.signal;
    let abortHandler: (() => void) | null = null;
    if (existingSignal) {
      abortHandler = () => controller.abort();
      existingSignal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      // Cleanup: remover event listener para evitar memory leak
      if (existingSignal && abortHandler) {
        existingSignal.removeEventListener('abort', abortHandler);
      }

      if (!response.ok) {
        const error: MercadoPagoError = await response.json();
        console.error('[MercadoPagoAPI] Error:', error);
        const causeMsg = Array.isArray(error.cause) && error.cause.length > 0 ? error.cause[0].description : '';
        const msg = error.message || causeMsg || `HTTP ${response.status}`;
        throw new Error(msg);
      }

      // 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      // Cleanup: remover event listener para evitar memory leak (também no catch)
      if (existingSignal && abortHandler) {
        existingSignal.removeEventListener('abort', abortHandler);
      }
      
      // Tratar timeout como erro específico
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Verificar se foi timeout interno ou abort externo
        if (existingSignal?.aborted) {
          throw error; // Abort externo, propagar
        }
        throw new Error('Tempo limite da requisição excedido. Tente novamente.');
      }
      console.error('[MercadoPagoAPI] Request failed:', error);
      throw error;
    }
  }

  private generateIdempotencyKey(): string {
    // Usar crypto.randomUUID se disponível
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ===== TERMINALS =====

  async listTerminals(params?: {
    limit?: number;
    offset?: number;
    store_id?: string;
    pos_id?: number;
  }): Promise<TerminalsListResponse> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.store_id) queryParams.append('store_id', params.store_id);
    if (params?.pos_id) queryParams.append('pos_id', params.pos_id.toString());

    const query = queryParams.toString();
    const endpoint = `/terminals/v1/list${query ? `?${query}` : ''}`;

    return this.request<TerminalsListResponse>(endpoint);
  }

  async updateTerminalMode(
    terminals: Array<{ id: string; operating_mode: 'PDV' | 'STANDALONE' }>
  ): Promise<{ terminals: Terminal[] }> {
    return this.request<{ terminals: Terminal[] }>('/terminals/v1/setup', {
      method: 'PATCH',
      body: JSON.stringify({ terminals }),
    });
  }

  // ===== ORDERS =====

  async createOrder(request: CreateOrderRequest): Promise<Order> {
    const idempotencyKey = this.generateIdempotencyKey();

    return this.request<Order>('/v1/orders', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(request),
    });
  }

  async getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
    return this.request<Order>(`/v1/orders/${orderId}`, { signal });
  }

  async cancelOrder(orderId: string): Promise<Order> {
    const idempotencyKey = this.generateIdempotencyKey();

    return this.request<Order>(`/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({}),
    });
  }

  async refundOrder(
    orderId: string,
    options?: {
      amount?: string;
      reason?: 'customer_request' | 'fraud' | 'duplicate' | 'other';
    }
  ): Promise<Order> {
    const idempotencyKey = this.generateIdempotencyKey();

    return this.request<Order>(`/v1/orders/${orderId}/refund`, {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(options || {}),
    });
  }

  // Simulação (sandbox apenas)
  async simulateOrderEvent(
    orderId: string,
    event: {
      status: 'processed' | 'canceled' | 'expired' | 'action_required';
      payment_method_type?: 'debit_card' | 'credit_card' | 'qr';
      installments?: number;
      payment_method_id?: 'visa' | 'master' | 'amex';
      status_detail?: string;
    }
  ): Promise<void> {
    if (this.config.mode !== 'sandbox') {
      throw new Error('Simulação disponível apenas em sandbox');
    }

    await this.request<void>(`/v1/orders/${orderId}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }
}

// Factory com configuração do ambiente
export function createMercadoPagoAPI(): MercadoPagoAPI | null {
  const mode = import.meta.env.VITE_MP_MODE as 'sandbox' | 'production' || 'sandbox';
  
  // Selecionar token baseado no modo
  let accessToken: string;
  if (mode === 'production') {
    accessToken = import.meta.env.VITE_MP_ACCESS_TOKEN_PRODUCTION || import.meta.env.VITE_MP_ACCESS_TOKEN || '';
  } else {
    accessToken = import.meta.env.VITE_MP_ACCESS_TOKEN_SANDBOX || import.meta.env.VITE_MP_ACCESS_TOKEN || '';
  }

  if (!accessToken) {
    console.warn('[MercadoPagoAPI] Access token não configurado');
    return null;
  }

  // Em desenvolvimento, usar proxy do Vite para evitar CORS
  // Em produção (totem/kiosk), usar URL direta - CORS não é problema em modo kiosk
  const isDev = import.meta.env.DEV;
  const baseUrl = isDev
    ? '/api/mp'  // Proxy do Vite - evita CORS em desenvolvimento
    : 'https://api.mercadopago.com';  // Totem/Kiosk - chamadas diretas

  // Log de inicialização sem expor credenciais
  if (import.meta.env.DEV) {
    console.log(`[MercadoPagoAPI] Inicializado em modo ${mode.toUpperCase()}`, {
      isDev,
      baseUrl,
      hasToken: !!accessToken,
    });
  }

  const config: MercadoPagoConfig = {
    accessToken,
    mode,
    baseUrl,
  };

  return new MercadoPagoAPI(config);
}
