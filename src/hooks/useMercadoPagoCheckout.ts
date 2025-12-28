/**
 * Hook compartilhado para lógica de checkout Mercado Pago
 * 
 * Encapsula a lógica duplicada entre Checkout.tsx e DrinkQuickCheckoutModal.tsx:
 * - Criação de ordens QR e Point
 * - Cancelamento de pagamentos
 * - Gerenciamento de estados (orderId, qrData, error, pointStatus)
 * - Integração com useMercadoPagoPolling
 */

import { useState, useRef, useCallback } from 'react';
import { paymentService } from '@/services/paymentService';
import { useMercadoPagoPolling } from './useMercadoPagoPolling';
import { MERCADO_PAGO_CONFIG, validateMercadoPagoConfig } from '@/config/mercadopago';
import type { Order, OrderStatus, PaymentStatus } from '@/types/mercadopago';

export type PointStatusType = 'idle' | 'sending' | 'at_terminal' | 'processing' | 'error';
export type PaymentMethodType = 'pix_qr' | 'credit_card' | 'debit_card';

export interface MercadoPagoItem {
  title: string;
  unit_price: string;
  quantity: number;
  unit_measure: string;
  total_amount: string;
}

export interface UseMercadoPagoCheckoutOptions {
  /** Callback quando pagamento é aprovado */
  onPaymentApproved: (order: Order) => void | Promise<void>;
  /** Callback quando ocorre erro no pagamento */
  onPaymentError: (errorMessage: string) => void;
  /** Callback opcional para mudança de status */
  onStatusChange?: (status: OrderStatus, paymentStatus?: PaymentStatus) => void;
  /** Método de pagamento atual (para atualizar pointStatus corretamente) */
  paymentMethod: PaymentMethodType;
  /** Função de tradução (t) */
  t: (key: string) => string;
}

export interface UseMercadoPagoCheckoutReturn {
  // Estados
  mpOrderId: string | null;
  mpQrData: string | null;
  mpError: string | null;
  pointStatus: PointStatusType;
  isPolling: boolean;
  pollingAttempt: number;
  
  // Ações
  startQRPayment: (totalAmount: number, items: MercadoPagoItem[], orderNumber: string) => Promise<boolean>;
  startPointPayment: (totalAmount: number, items: MercadoPagoItem[], orderNumber: string, paymentType: 'credit_card' | 'debit_card') => Promise<boolean>;
  cancelPayment: (transactionId?: string) => Promise<{ canceled: boolean; reason?: string }>;
  resetState: () => void;
  
  // Polling controls (expostos para casos específicos)
  stopPolling: () => void;
  clearPersistedState: () => void;
}

/**
 * Hook para gerenciar checkout com Mercado Pago (QR e Point)
 * 
 * @example
 * ```tsx
 * const {
 *   mpOrderId,
 *   mpQrData,
 *   mpError,
 *   pointStatus,
 *   startQRPayment,
 *   startPointPayment,
 *   cancelPayment,
 *   resetState,
 * } = useMercadoPagoCheckout({
 *   onPaymentApproved: async (order) => {
 *     await handlePaymentSuccess(order);
 *   },
 *   onPaymentError: (error) => {
 *     toast({ title: 'Erro', description: error, variant: 'destructive' });
 *   },
 *   paymentMethod,
 *   t,
 * });
 * ```
 */
export function useMercadoPagoCheckout(options: UseMercadoPagoCheckoutOptions): UseMercadoPagoCheckoutReturn {
  const { onPaymentApproved, onPaymentError, onStatusChange, paymentMethod, t } = options;

  // Estados
  const [mpOrderId, setMpOrderId] = useState<string | null>(null);
  const [mpQrData, setMpQrData] = useState<string | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  const [pointStatus, setPointStatus] = useState<PointStatusType>('idle');
  
  // Guard contra duplicação
  const saleRecordedRef = useRef(false);
  const paymentInProgressRef = useRef(false);

  // Hook de polling com callbacks
  const {
    isPolling,
    attempts: pollingAttempt,
    startPolling,
    stopPolling,
    clearPersistedState,
  } = useMercadoPagoPolling({
    onSuccess: async (order) => {
      console.log('[MercadoPagoCheckout] Pagamento aprovado via polling', { orderId: order.id });
      
      // Guard contra duplicação
      if (saleRecordedRef.current) {
        console.log('[MercadoPagoCheckout] Já processado, ignorando duplicação');
        return;
      }
      saleRecordedRef.current = true;
      
      // Liberar terminal para próxima ordem (self-service)
      paymentService.markTerminalOrderComplete();
      
      setPointStatus('idle');
      await onPaymentApproved(order);
    },
    onError: (errorMsg) => {
      console.error('[MercadoPagoCheckout] Erro no polling:', errorMsg);
      
      // Mapear mensagens de erro para português amigável
      const errorMessages: Record<string, string> = {
        'Pagamento recusado': t('checkout.paymentDeclinedDescription') || 'O pagamento foi recusado. Verifique o limite do cartão ou tente outro método de pagamento.',
        'Pagamento expirado': t('checkout.paymentExpiredDescription') || 'O tempo para pagamento expirou. Por favor, tente novamente.',
        'Pagamento cancelado': t('checkout.paymentCanceledDescription') || 'O pagamento foi cancelado.',
      };
      
      const friendlyError = errorMessages[errorMsg] || errorMsg || t('checkout.paymentErrorDescription') || 'Ocorreu um erro ao processar o pagamento.';
      
      setMpError(friendlyError);
      setPointStatus('error');
      onPaymentError(friendlyError);
    },
    onStatusChange: (status, paymentStatus) => {
      console.log('[MercadoPagoCheckout] Status changed:', { status, paymentStatus });
      
      // Para Point: atualizar status visual quando a order chega no terminal
      if (paymentMethod !== 'pix_qr' && status === 'at_terminal') {
        setPointStatus('at_terminal');
      }
      
      onStatusChange?.(status, paymentStatus);
    },
    onAttempt: (attempt, maxAttempts) => {
      console.log(`[MercadoPagoCheckout] Polling tentativa ${attempt}/${maxAttempts}`);
    },
  });

  /**
   * Iniciar pagamento via QR Code (PIX)
   */
  const startQRPayment = useCallback(async (
    totalAmount: number,
    items: MercadoPagoItem[],
    orderNumber: string
  ): Promise<boolean> => {
    // Proteção contra múltiplos cliques
    if (paymentInProgressRef.current) {
      console.log('[MercadoPagoCheckout] Pagamento QR já em andamento');
      return false;
    }
    
    console.log('[MercadoPagoCheckout] Iniciando pagamento QR...');
    paymentInProgressRef.current = true;
    setMpError(null);
    
    try {
      // Validar configuração
      validateMercadoPagoConfig();

      const externalRef = `KIOSK-${orderNumber}-${Date.now()}`;

      console.log('[MercadoPagoCheckout] Criando QR Order:', {
        amount: totalAmount,
        items: items.length,
        externalRef,
      });

      const result = await paymentService.processMercadoPagoQR(
        totalAmount,
        items,
        externalRef,
        MERCADO_PAGO_CONFIG.EXTERNAL_POS_ID
      );

      console.log('[MercadoPagoCheckout] QR Order criada:', { orderId: result.orderId });

      setMpOrderId(result.orderId || null);
      setMpQrData(result.qrData || null);
      
      // Iniciar polling
      if (result.orderId) {
        startPolling(result.orderId, false);
      }
      
      return true;
    } catch (error: any) {
      console.error('[MercadoPagoCheckout] Erro ao criar QR:', error);
      const errorMsg = error.message || t('checkout.paymentErrorGeneric');
      setMpError(errorMsg);
      paymentInProgressRef.current = false;
      onPaymentError(errorMsg);
      return false;
    }
  }, [t, startPolling, onPaymentError]);

  /**
   * Iniciar pagamento via Point (Terminal físico)
   */
  const startPointPayment = useCallback(async (
    totalAmount: number,
    items: MercadoPagoItem[],
    orderNumber: string,
    paymentType: 'credit_card' | 'debit_card'
  ): Promise<boolean> => {
    // Proteção contra múltiplos cliques
    if (paymentInProgressRef.current || pointStatus !== 'idle') {
      console.log('[MercadoPagoCheckout] Pagamento Point já em andamento');
      return false;
    }
    
    console.log('[MercadoPagoCheckout] Iniciando pagamento Point:', paymentType);
    paymentInProgressRef.current = true;
    setPointStatus('sending');
    setMpError(null);
    
    try {
      const externalRef = `KIOSK-${orderNumber}-${Date.now()}`;
      
      console.log('[MercadoPagoCheckout] Criando Point Order:', {
        amount: totalAmount,
        items: items.length,
        externalRef,
        paymentType,
        terminalId: MERCADO_PAGO_CONFIG.TERMINAL_ID || 'auto-detect'
      });

      const result = await paymentService.processMercadoPagoPoint(
        totalAmount,
        items,
        externalRef,
        MERCADO_PAGO_CONFIG.TERMINAL_ID || undefined,
        {
          defaultPaymentType: paymentType,
          defaultInstallments: paymentType === 'debit_card' ? 1 : undefined,
        }
      );

      console.log('[MercadoPagoCheckout] Point Order criada:', { orderId: result.orderId, paymentType });

      setMpOrderId(result.orderId || null);
      setPointStatus('at_terminal');
      
      if (result.orderId) {
        startPolling(result.orderId, true);
      }
      
      return true;
    } catch (error: any) {
      console.error('[MercadoPagoCheckout] Erro ao criar Point order:', error);
      const errorMsg = error.message || t('checkout.terminalSendError');
      setMpError(errorMsg);
      setPointStatus('error');
      paymentInProgressRef.current = false;
      onPaymentError(errorMsg);
      return false;
    }
  }, [t, pointStatus, startPolling, onPaymentError]);

  /**
   * Cancelar pagamento atual
   */
  const cancelPayment = useCallback(async (transactionId?: string): Promise<{ canceled: boolean; reason?: string }> => {
    // Capturar orderId ANTES de limpar estado (evita race condition)
    const orderIdToCancel = mpOrderId;
    
    console.log('[MercadoPagoCheckout] Cancelando pagamento:', { orderIdToCancel, transactionId });
    
    // Parar polling primeiro
    stopPolling();
    clearPersistedState();
    
    // Reset estados locais
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
    setPointStatus('idle');
    saleRecordedRef.current = false;
    paymentInProgressRef.current = false;
    
    // Cancelar ordem remotamente no Mercado Pago
    if (transactionId || orderIdToCancel) {
      try {
        const result = await paymentService.cancelPayment(transactionId || '', orderIdToCancel ?? undefined);
        console.log('[MercadoPagoCheckout] Resultado do cancelamento:', result);
        return result;
      } catch (error) {
        console.warn('[MercadoPagoCheckout] Falha ao cancelar ordem remotamente:', error);
        return { canceled: false, reason: 'error' };
      }
    }
    
    return { canceled: true, reason: 'no_order' };
  }, [mpOrderId, stopPolling, clearPersistedState]);

  /**
   * Reset completo do estado
   */
  const resetState = useCallback(() => {
    stopPolling();
    clearPersistedState();
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
    setPointStatus('idle');
    saleRecordedRef.current = false;
    paymentInProgressRef.current = false;
  }, [stopPolling, clearPersistedState]);

  return {
    // Estados
    mpOrderId,
    mpQrData,
    mpError,
    pointStatus,
    isPolling,
    pollingAttempt,
    
    // Ações
    startQRPayment,
    startPointPayment,
    cancelPayment,
    resetState,
    
    // Polling controls
    stopPolling,
    clearPersistedState,
  };
}

export default useMercadoPagoCheckout;
