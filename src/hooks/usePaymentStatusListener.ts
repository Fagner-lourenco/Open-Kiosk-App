/**
 * usePaymentStatusListener — Hybrid onSnapshot + Cloud Function fallback.
 *
 * Primary: Firestore onSnapshot listens for payment doc updates (webhook → Firestore → listener).
 * Fallback: If no status change via onSnapshot after FALLBACK_DELAY_MS, calls CF to poll MP API.
 *
 * This replaces direct API polling with a server-managed approach where the access token
 * stays on the backend.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { paymentService } from '@/services/paymentService';
import type { PaymentRecord, PaymentStatus } from '@/types/payments';

const FALLBACK_DELAY_MS = 10_000; // 10s before first CF fallback
const FALLBACK_INTERVAL_MS = 5_000; // 5s between subsequent CF fallback calls
const MAX_FALLBACK_ATTEMPTS = 36; // ~3 minutes of fallback polling

const TERMINAL_STATUSES: PaymentStatus[] = ['paid', 'canceled', 'expired', 'failed', 'refunded'];

export interface UsePaymentStatusListenerOptions {
  onStatusChange?: (status: PaymentStatus, payment: PaymentRecord) => void;
  onPaid?: (payment: PaymentRecord) => void;
  onError?: (error: string) => void;
  onFallbackAttempt?: (attempt: number, maxAttempts: number) => void;
  storeId?: string;
  franchiseId?: string;
}

export interface UsePaymentStatusListenerReturn {
  isListening: boolean;
  status: PaymentStatus | null;
  payment: PaymentRecord | null;
  error: string | null;
  startListening: (paymentId: string) => void;
  stopListening: () => void;
}

export function usePaymentStatusListener(
  options: UsePaymentStatusListenerOptions
): UsePaymentStatusListenerReturn {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackAttemptRef = useRef(0);
  const paymentIdRef = useRef<string | null>(null);
  const lastStatusRef = useRef<PaymentStatus | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearFallback = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    fallbackAttemptRef.current = 0;
  }, []);

  const stopListening = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    clearFallback();
    setIsListening(false);
    paymentIdRef.current = null;
    lastStatusRef.current = null;
  }, [clearFallback]);

  const doFallbackCheck = useCallback(async () => {
    const pid = paymentIdRef.current;
    if (!pid) return;

    // Don't check if already terminal
    if (lastStatusRef.current && TERMINAL_STATUSES.includes(lastStatusRef.current)) {
      clearFallback();
      return;
    }

    fallbackAttemptRef.current += 1;
    const attempt = fallbackAttemptRef.current;

    if (attempt > MAX_FALLBACK_ATTEMPTS) {
      clearFallback();
      optionsRef.current.onError?.('Timeout aguardando pagamento.');
      return;
    }

    optionsRef.current.onFallbackAttempt?.(attempt, MAX_FALLBACK_ATTEMPTS);

    try {
      await paymentService.checkMercadoPagoPaymentStatusCF(pid, {
        storeId: optionsRef.current.storeId,
        franchiseId: optionsRef.current.franchiseId,
      });
      // The CF updates Firestore → onSnapshot fires → status updates automatically
    } catch (err) {
      console.warn('[usePaymentStatusListener] Fallback check error:', err);
    }
  }, [clearFallback]);

  const resetFallbackTimer = useCallback(() => {
    clearFallback();

    // Start fallback timer — if no terminal status arrives in FALLBACK_DELAY_MS,
    // start periodic CF checks
    fallbackTimerRef.current = setTimeout(() => {
      doFallbackCheck();
      fallbackIntervalRef.current = setInterval(doFallbackCheck, FALLBACK_INTERVAL_MS);
    }, FALLBACK_DELAY_MS);
  }, [clearFallback, doFallbackCheck]);

  const startListening = useCallback((paymentId: string) => {
    // Cleanup previous listener
    stopListening();

    paymentIdRef.current = paymentId;
    setIsListening(true);
    setError(null);

    try {
      const unsub = paymentService.watchPaymentStatus(
        paymentId,
        (updatedPayment) => {
          setPayment(updatedPayment);
          const newStatus = updatedPayment.status as PaymentStatus;
          setStatus(newStatus);

          // Notify status change
          if (newStatus !== lastStatusRef.current) {
            lastStatusRef.current = newStatus;
            optionsRef.current.onStatusChange?.(newStatus, updatedPayment);

            if (newStatus === 'paid') {
              optionsRef.current.onPaid?.(updatedPayment);
              clearFallback();
              return;
            }

            // Terminal state — stop fallback
            if (TERMINAL_STATUSES.includes(newStatus)) {
              clearFallback();
              return;
            }
          }

          // Reset fallback timer on any snapshot update (means connection is alive)
          resetFallbackTimer();
        },
        {
          storeId: optionsRef.current.storeId,
          franchiseId: optionsRef.current.franchiseId,
          onError: (err) => {
            console.error('[usePaymentStatusListener] Snapshot error:', err);
            setError(err.message);
            optionsRef.current.onError?.(err.message);
          },
        }
      );

      unsubRef.current = unsub;

      // Start initial fallback timer
      resetFallbackTimer();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsListening(false);
      optionsRef.current.onError?.(message);
    }
  }, [stopListening, clearFallback, resetFallbackTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
      }
      clearFallback();
    };
  }, [clearFallback]);

  return {
    isListening,
    status,
    payment,
    error,
    startListening,
    stopListening,
  };
}
