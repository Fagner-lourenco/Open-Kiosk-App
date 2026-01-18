/**
 * Mercado Pago API Client
 * Wrapper para endpoints oficiais do Mercado Pago Point/QR
 * Referência: https://www.mercadopago.com.br/developers/pt/reference
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import type {
  MercadoPagoConfig,
  Terminal,
  TerminalsListResponse,
  Order,
  CreateOrderRequest
} from '@/types/mercadopago';

export class MercadoPagoAPI {
  private config: MercadoPagoConfig;
  private defaultTimeoutMs = 30000; // 30 segundos timeout padrão

  constructor(config: MercadoPagoConfig) {
    this.config = config;
  }

  /**
   * Detecta se está rodando em plataforma nativa (Android/iOS)
   * onde precisamos usar CapacitorHttp para bypass de CORS
   */
  private isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Requisição usando CapacitorHttp (nativo - sem CORS)
   */
  private async nativeRequest<T>(
    endpoint: string,
    options: { method?: string; body?: string; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      console.log('[MercadoPagoAPI] Native request:', { url, method: options.method || 'GET' });
      
      const response: HttpResponse = await CapacitorHttp.request({
        url,
        method: options.method || 'GET',
        headers,
        data: options.body ? JSON.parse(options.body) : undefined,
        connectTimeout: this.defaultTimeoutMs,
        readTimeout: this.defaultTimeoutMs,
      });

      console.log('[MercadoPagoAPI] Native response:', { status: response.status });

      if (response.status >= 400) {
        const error = response.data;
        console.error('[MercadoPagoAPI] Native Error:', JSON.stringify(error, null, 2));
        // Suportar múltiplos formatos de erro da API Mercado Pago
        const errorMessage = 
          error?.message || 
          (Array.isArray(error?.errors) && error.errors[0]?.message) ||
          (Array.isArray(error?.errors) && error.errors[0]?.description) ||
          (Array.isArray(error?.cause) && error.cause[0]?.description) ||
          `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      // 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return response.data as T;
    } catch (error) {
      console.error('[MercadoPagoAPI] Native request failed:', error);
      throw error;
    }
  }

  /**
   * Requisição usando fetch (web - com proxy dev ou produção web)
   */
  private async webRequest<T>(
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
        const error = await response.json();
        console.error('[MercadoPagoAPI] Error:', JSON.stringify(error, null, 2));
        // Suportar múltiplos formatos de erro da API Mercado Pago
        const errorMessage = 
          error.message || 
          (Array.isArray(error.errors) && error.errors[0]?.message) ||
          (Array.isArray(error.errors) && error.errors[0]?.description) ||
          (Array.isArray(error.cause) && error.cause[0]?.description) ||
          `HTTP ${response.status}`;
        throw new Error(errorMessage);
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

  /**
   * Método request unificado - escolhe automaticamente entre nativo e web
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<T> {
    // Em plataforma nativa (Android/iOS), usar CapacitorHttp para bypass de CORS
    if (this.isNativePlatform()) {
      return this.nativeRequest<T>(endpoint, {
        method: options.method,
        body: options.body as string | undefined,
        headers: options.headers as Record<string, string> | undefined,
      });
    }
    
    // Em web (dev ou produção web), usar fetch normal
    return this.webRequest<T>(endpoint, options, timeoutMs);
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

/**
 * Configuração de override para criar API com credenciais customizadas
 */
export interface MercadoPagoAPIOverride {
  accessToken?: string;
  mode?: 'sandbox' | 'production';
}

/**
 * Factory com configuração do ambiente
 * 
 * @param overrideConfig - Configuração opcional para sobrescrever env vars
 *                         Usado quando configuração vem do Firestore
 * @returns Instância da API ou null se não configurado
 */
export function createMercadoPagoAPI(overrideConfig?: MercadoPagoAPIOverride): MercadoPagoAPI | null {
  // Prioridade: override > env vars
  const envMode = import.meta.env.VITE_MP_MODE as 'sandbox' | 'production' || 'sandbox';
  const mode = overrideConfig?.mode || envMode;
  
  // Selecionar token: prioridade para override
  let accessToken: string;
  
  if (overrideConfig?.accessToken) {
    // Usar token do Firestore
    accessToken = overrideConfig.accessToken;
  } else if (mode === 'production') {
    // Fallback para env vars - produção
    accessToken = import.meta.env.VITE_MP_ACCESS_TOKEN_PRODUCTION || import.meta.env.VITE_MP_ACCESS_TOKEN || '';
  } else {
    // Fallback para env vars - sandbox
    accessToken = import.meta.env.VITE_MP_ACCESS_TOKEN_SANDBOX || import.meta.env.VITE_MP_ACCESS_TOKEN || '';
  }

  if (!accessToken) {
    console.warn('[MercadoPagoAPI] Access token não configurado');
    return null;
  }

  // Detectar plataforma
  const isNative = Capacitor.isNativePlatform();
  const isDev = import.meta.env.DEV;
  
  // Em desenvolvimento web, usar proxy do Vite para evitar CORS
  // Em nativo (Android/iOS) ou produção web, usar URL direta
  // O CapacitorHttp no nativo bypassa CORS automaticamente
  const baseUrl = (isDev && !isNative)
    ? '/api/mp'  // Proxy do Vite - evita CORS em desenvolvimento web
    : 'https://api.mercadopago.com';  // Nativo ou produção - chamadas diretas

  // Log de inicialização sem expor credenciais
  const configSource = overrideConfig?.accessToken ? 'firestore' : 'env';
  console.log(`[MercadoPagoAPI] Inicializado em modo ${mode.toUpperCase()} (config: ${configSource})`, {
    isDev,
    isNative,
    baseUrl,
    hasToken: !!accessToken,
    configSource,
  });

  const config: MercadoPagoConfig = {
    accessToken,
    mode,
    baseUrl,
  };

  return new MercadoPagoAPI(config);
}
