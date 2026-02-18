/**
 * Hook customizado para polling de status de pagamento Mercado Pago
 * 
 * Features:
 * - Exponential backoff com feedback rápido (5s inicial, cresce gradualmente)
 * - Persistência no localStorage para sobreviver refresh/crash
 * - Retry automático em falhas de rede (max 3 tentativas)
 * - Cleanup automático ao desmontar componente
 * - Logs estruturados para observabilidade
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { paymentService } from '@/services/paymentService';
import { MERCADO_PAGO_CONFIG } from '@/config/mercadopago';
import { systemLogService } from '@/services/systemLogService';
import type { Order, OrderStatus, PaymentStatus } from '@/types/mercadopago';

// Constantes de configuração - usar valores do config centralizado
const STORAGE_KEY = 'mp_polling_state';
const INITIAL_INTERVAL_MS = MERCADO_PAGO_CONFIG.POLLING_INTERVAL_MS; // 3 segundos (do config)
const MAX_INTERVAL_MS = 10000; // Máximo 10 segundos entre tentativas
const MAX_ATTEMPTS = MERCADO_PAGO_CONFIG.POLLING_MAX_ATTEMPTS; // 45 tentativas = ~135s (cobre 2min + margem)
const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_DELAY_MS = 2000;
const MAX_PROCESSED_ORDERS = 50; // Limite do Set para evitar memory leak

// Exportar MAX_ATTEMPTS para uso na UI
export const POLLING_MAX_ATTEMPTS = MAX_ATTEMPTS;

// Tipos
export interface PollingState {
  orderId: string;
  isPointPayment: boolean;
  attempts: number;
  startedAt: number;
  lastAttemptAt: number | null;
}

export interface UseMercadoPagoPollingOptions {
  onSuccess: (order: Order) => void;
  onError: (error: string) => void;
  onStatusChange?: (status: OrderStatus, paymentStatus?: PaymentStatus) => void;
  onAttempt?: (attempt: number, maxAttempts: number) => void;
}

export interface UseMercadoPagoPollingReturn {
  isPolling: boolean;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  currentOrderId: string | null;
  startPolling: (orderId: string, isPointPayment?: boolean) => void;
  stopPolling: () => void;
  clearPersistedState: () => void;
}

// Flag para habilitar logs detalhados (apenas em desenvolvimento ou debug)
const isDebugEnabled = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true';

// Helpers para logs estruturados
const logPolling = (level: 'info' | 'warn' | 'error' | 'success', message: string, data?: object) => {
  // Em produção, logar apenas erros e warnings críticos
  if (!isDebugEnabled && level === 'info') return;
  
  const timestamp = new Date().toISOString();
  const prefix = `[MercadoPago Polling][${timestamp}]`;
  const emoji = { info: '[INFO]', warn: '[WARN]', error: '[ERROR]', success: '[OK]' }[level];
  
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logFn(`${prefix} ${emoji} ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

// Calcula intervalo com exponential backoff (feedback rápido inicial, depois cresce)
const getPollingInterval = (attempt: number): number => {
  // Primeiras 3 tentativas: intervalo inicial fixo (9s de feedback rápido)
  if (attempt <= 3) return INITIAL_INTERVAL_MS;
  
  // Depois: cresce com fator 1.4 até MAX_INTERVAL_MS
  // Isso atinge ~20s em ~8 tentativas adicionais
  const interval = INITIAL_INTERVAL_MS * Math.pow(1.4, attempt - 3);
  return Math.min(Math.round(interval), MAX_INTERVAL_MS);
};

// Verifica se é erro de rede
const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  const message = error.message?.toLowerCase() || '';
  return (
    error.name === 'TypeError' ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('offline')
  );
};

// Persistência no localStorage
const savePollingState = (state: PollingState | null) => {
  try {
    if (state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    logPolling('warn', 'Falha ao salvar estado no localStorage', { error: (e as Error).message });
  }
};

const loadPollingState = (): PollingState | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const state = JSON.parse(stored) as PollingState;
    
    // Verificar se não expirou (máximo 10 minutos desde início)
    const maxAge = 10 * 60 * 1000;
    if (Date.now() - state.startedAt > maxAge) {
      logPolling('info', 'Estado persistido expirou, removendo');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    
    return state;
  } catch (e) {
    logPolling('warn', 'Falha ao carregar estado do localStorage', { error: (e as Error).message });
    return null;
  }
};

export function useMercadoPagoPolling(options: UseMercadoPagoPollingOptions): UseMercadoPagoPollingReturn {
  const { onSuccess, onError, onStatusChange, onAttempt } = options;

  // Refs estáveis para callbacks (evita stale closures no restore do localStorage)
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onStatusChangeRef = useRef(onStatusChange);
  const onAttemptRef = useRef(onAttempt);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { onAttemptRef.current = onAttempt; }, [onAttempt]);

  // Estados
  const [isPolling, setIsPolling] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  // Refs para controle interno
  const pollTimeoutRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const networkRetriesRef = useRef(0);
  const isPointPaymentRef = useRef(false);
  const currentAttemptRef = useRef(0);
  const isMountedRef = useRef(true);
  const processedOrdersRef = useRef<Set<string>>(new Set()); // Idempotency: track already processed orders

  // Limpar timeout e abort controller
  const cleanup = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Parar polling
  const stopPolling = useCallback(() => {
    // Só logar se houver polling ativo para evitar logs desnecessários
    if (currentOrderId || currentAttemptRef.current > 0) {
      logPolling('info', 'Parando polling', { orderId: currentOrderId, attempts: currentAttemptRef.current });
    }
    cleanup();
    setIsPolling(false);
    savePollingState(null);
  }, [cleanup, currentOrderId]);

  // Limpar estado persistido manualmente
  const clearPersistedState = useCallback(() => {
    // Só logar se houver estado persistido para evitar logs desnecessários
    const hasState = loadPollingState() !== null;
    savePollingState(null);
    if (hasState) {
      logPolling('info', 'Estado persistido limpo manualmente');
    }
  }, []);

  // Função principal de polling
  const poll = useCallback(async (orderId: string) => {
    if (!isMountedRef.current) return;

    currentAttemptRef.current++;
    const attempt = currentAttemptRef.current;

    // Verificar limite de tentativas
    if (attempt > MAX_ATTEMPTS) {
      logPolling('warn', 'Timeout - pagamento não confirmado', { orderId, attempts: attempt });
      systemLogService.warn('payment', `Polling timeout: ${orderId}`, { orderId, attempts: attempt });
      setError('Tempo limite excedido. Verifique o status do pagamento.');
      setIsPolling(false);
      savePollingState(null);
      onErrorRef.current('Tempo limite excedido. Verifique o status do pagamento.');
      return;
    }

    // Atualizar estado
    setAttempts(attempt);
    onAttemptRef.current?.(attempt, MAX_ATTEMPTS);

    // Persistir estado
    savePollingState({
      orderId,
      isPointPayment: isPointPaymentRef.current,
      attempts: attempt,
      startedAt: loadPollingState()?.startedAt || Date.now(),
      lastAttemptAt: Date.now(),
    });

    const startTime = Date.now();

    try {
      logPolling('info', `Verificando status (${attempt}/${MAX_ATTEMPTS})`, { orderId });

      // Criar novo AbortController para esta tentativa
      abortControllerRef.current = new AbortController();
      
      const order = await paymentService.checkMercadoPagoOrderStatus(
        orderId, 
        abortControllerRef.current.signal
      );

      const latency = Date.now() - startTime;
      const paymentStatus = order.transactions?.payments?.[0]?.status;

      logPolling('info', 'Status recebido', {
        orderId,
        orderStatus: order.status,
        paymentStatus,
        latencyMs: latency,
      });

      // Reset network retries em sucesso
      networkRetriesRef.current = 0;

      // Notificar mudança de status
      onStatusChangeRef.current?.(order.status, paymentStatus);

      // Verificar status de falha
      if (order.status === 'failed' || order.status === 'expired' || order.status === 'canceled') {
        const errorMessages: Record<string, string> = {
          failed: 'Pagamento recusado',
          expired: 'Pagamento expirado',
          canceled: 'Pagamento cancelado',
        };
        const errorMsg = errorMessages[order.status] || 'Pagamento não aprovado';
        
        logPolling('error', `Pagamento ${order.status}`, { orderId });
        systemLogService.warn('payment', `Pagamento ${order.status}: ${orderId}`, { orderId, status: order.status });
        setError(errorMsg);
        setIsPolling(false);
        savePollingState(null);
        onErrorRef.current(errorMsg);
        return;
      }

      // Verificar se pagamento foi aprovado
      const isOrderProcessed = order.status === 'processed' || order.status === 'closed';
      const isPaymentApproved = paymentStatus === 'approved' || paymentStatus === 'processed';

      if (isOrderProcessed && isPaymentApproved) {
        // Idempotency check: prevent duplicate processing of the same order
        if (processedOrdersRef.current.has(orderId)) {
          logPolling('warn', 'Order já processado, ignorando callback duplicado', { orderId });
          setIsPolling(false);
          savePollingState(null);
          return;
        }
        
        // Limitar tamanho do Set para evitar memory leak - remover entradas mais antigas
        if (processedOrdersRef.current.size >= MAX_PROCESSED_ORDERS) {
          // Converter para array, remover os primeiros 10 (mais antigos)
          const entries = Array.from(processedOrdersRef.current);
          entries.slice(0, 10).forEach(id => processedOrdersRef.current.delete(id));
          logPolling('info', `Set de ordens processadas limpo (removidas ${Math.min(10, entries.length)} entradas antigas)`);
        }
        processedOrdersRef.current.add(orderId);
        
        logPolling('success', 'Pagamento aprovado!', { orderId, paymentStatus });
        setIsPolling(false);
        savePollingState(null);
        onSuccessRef.current(order);
        return;
      }

      // Continuar polling com backoff
      if (isMountedRef.current) {
        const nextInterval = getPollingInterval(attempt);
        logPolling('info', `Próxima verificação em ${nextInterval}ms`, { orderId, attempt });
        pollTimeoutRef.current = window.setTimeout(() => poll(orderId), nextInterval);
      }

    } catch (err: any) {
      // Ignorar aborts (cleanup, HMR)
      if (err?.name === 'AbortError') {
        logPolling('info', 'Requisição abortada (cleanup)', { orderId });
        return;
      }

      logPolling('error', 'Erro ao verificar status', { 
        orderId, 
        error: err.message,
        attempt,
      });

      // Retry em erros de rede
      if (isNetworkError(err) && networkRetriesRef.current < MAX_NETWORK_RETRIES) {
        networkRetriesRef.current++;
        logPolling('warn', `Erro de rede, retry ${networkRetriesRef.current}/${MAX_NETWORK_RETRIES}`, { orderId });
        
        pollTimeoutRef.current = window.setTimeout(() => poll(orderId), NETWORK_RETRY_DELAY_MS);
        return;
      }

      // Erro definitivo
      const errorMsg = err.message || 'Erro ao verificar pagamento';
      systemLogService.error('payment', `Polling erro definitivo: ${errorMsg}`, { orderId, attempt });
      setError(errorMsg);
      setIsPolling(false);
      savePollingState(null);
      onErrorRef.current(errorMsg);
    }
  }, []); // Callbacks via refs estáveis - sem deps

  // Iniciar polling
  const startPolling = useCallback((orderId: string, isPointPayment: boolean = false) => {
    logPolling('info', 'Iniciando polling', { orderId, isPointPayment });
    
    // Limpar qualquer polling anterior
    cleanup();

    // Configurar estado inicial
    setCurrentOrderId(orderId);
    setIsPolling(true);
    setError(null);
    setAttempts(0);
    currentAttemptRef.current = 0;
    networkRetriesRef.current = 0;
    isPointPaymentRef.current = isPointPayment;

    // Salvar estado inicial
    savePollingState({
      orderId,
      isPointPayment,
      attempts: 0,
      startedAt: Date.now(),
      lastAttemptAt: null,
    });

    // Iniciar primeira verificação
    poll(orderId);
  }, [cleanup, poll]);

  // Restaurar polling ao montar (se houver estado persistido)
  // Intencionalmente executado apenas uma vez no mount
  useEffect(() => {
    isMountedRef.current = true;
    
    const persistedState = loadPollingState();
    if (persistedState) {
      logPolling('info', 'Restaurando polling do localStorage', {
        orderId: persistedState.orderId,
        attempts: persistedState.attempts,
        elapsedMinutes: ((Date.now() - persistedState.startedAt) / 60000).toFixed(1),
      });
      systemLogService.info('payment', `Polling restaurado do localStorage: ${persistedState.orderId}`, { orderId: persistedState.orderId, attempts: persistedState.attempts });

      // Verificar se ainda está montado antes de atualizar estados
      if (!isMountedRef.current) {
        logPolling('warn', 'Componente desmontado durante restore, abortando');
        return;
      }

      setCurrentOrderId(persistedState.orderId);
      setAttempts(persistedState.attempts);
      currentAttemptRef.current = persistedState.attempts;
      isPointPaymentRef.current = persistedState.isPointPayment;
      setIsPolling(true);

      // Verificar novamente antes de iniciar polling async
      if (isMountedRef.current) {
        // Retomar polling
        poll(persistedState.orderId);
      }
    }

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  return {
    isPolling,
    attempts,
    maxAttempts: MAX_ATTEMPTS,
    error,
    currentOrderId,
    startPolling,
    stopPolling,
    clearPersistedState,
  };
}

export default useMercadoPagoPolling;
