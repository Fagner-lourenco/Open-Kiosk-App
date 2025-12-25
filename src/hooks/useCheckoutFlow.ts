import { useCallback, useEffect, useState } from "react";
import {
  CheckoutFlowActions,
  CheckoutFlowState,
  CheckoutStep,
  ProcessingStage,
  TimerVariant,
  UseCheckoutFlowOptions,
  UseCheckoutFlowReturn,
} from "@/types/checkoutFlow";

const buildInitialState = (initialTimeoutSeconds: number, paymentTimeoutSeconds: number): CheckoutFlowState => ({
  currentStep: 1,
  completedSteps: [],
  isProcessing: false,
  isTimerActive: false,
  inactivityTimeLeft: initialTimeoutSeconds,
  maxInactivityTime: initialTimeoutSeconds,
  isInactivityWarning: false,
  timerVariant: "idle",
  processingStage: "idle",
  processingProgress: 0,
  processingSteps: [],
  selectedSize: null,
  quantity: 0,
  selectedPayment: null,
  error: null,
  isPaymentCancellable: true,
  paymentTimeoutSeconds,
});

export function useCheckoutFlow(options: UseCheckoutFlowOptions = {}): UseCheckoutFlowReturn {
  const {
    initialTimeoutSeconds = 60,
    paymentTimeoutSeconds = 300,
    warningThresholdSeconds = 10,
    onStepChange,
    onTimeout,
    onWarning,
    onProcessingChange,
    onError,
  } = options;

  const [state, setState] = useState<CheckoutFlowState>(buildInitialState(initialTimeoutSeconds, paymentTimeoutSeconds));

  // Inatividade: roda apenas quando timer está ativo
  useEffect(() => {
    if (!state.isTimerActive) return;

    const interval = setInterval(() => {
      let warningPayload: { step: CheckoutStep; timeLeft: number } | null = null;
      let timeoutStep: CheckoutStep | null = null;

      setState((prev) => {
        if (!prev.isTimerActive) return prev;

        const newTimeLeft = Math.max(0, prev.inactivityTimeLeft - 1);
        let variant: TimerVariant = "running";
        if (newTimeLeft <= warningThresholdSeconds) {
          variant = "critical";
        } else if (newTimeLeft <= 30) {
          variant = "warning";
        }

        if (!prev.isInactivityWarning && newTimeLeft <= warningThresholdSeconds) {
          warningPayload = { step: prev.currentStep, timeLeft: newTimeLeft };
        }

        if (newTimeLeft === 0 && prev.inactivityTimeLeft > 0) {
          timeoutStep = prev.currentStep;
        }

        return {
          ...prev,
          inactivityTimeLeft: newTimeLeft,
          isInactivityWarning: newTimeLeft <= warningThresholdSeconds,
          timerVariant: newTimeLeft === 0 ? "idle" : variant,
          isTimerActive: newTimeLeft === 0 ? false : prev.isTimerActive,
        };
      });

      if (warningPayload && onWarning) {
        onWarning(warningPayload.step, warningPayload.timeLeft);
      }

      if (timeoutStep !== null) {
        onTimeout?.(timeoutStep);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isTimerActive, warningThresholdSeconds, onTimeout, onWarning]);

  const actions: CheckoutFlowActions = {
    moveToStep: useCallback(
      (step: CheckoutStep) => {
        setState((prev) => {
          // Mark previous step as completed only when moving forward.
          const movingForward = step > prev.currentStep;
          const completed = new Set(prev.completedSteps);
          if (movingForward && step > 1) completed.add((step - 1) as CheckoutStep);
          // If moving backward, remove any steps beyond the new current step
          if (!movingForward) {
            for (const s of [...completed]) {
              if (s >= step) completed.delete(s as CheckoutStep);
            }
          }
          return {
            ...prev,
            currentStep: step,
            completedSteps: Array.from(completed).sort() as CheckoutStep[],
            isTimerActive: true,
            timerVariant: "running",
          };
        });
        onStepChange?.(step);
      },
      [onStepChange]
    ),

    goBack: useCallback(() => {
      setState((prev) => {
        const newStep = Math.max(1, prev.currentStep - 1) as CheckoutStep;
        const filteredCompleted = prev.completedSteps.filter((s) => s < newStep) as CheckoutStep[];
        return {
          ...prev,
          currentStep: newStep,
          completedSteps: filteredCompleted,
          timerVariant: newStep <= 0 ? "idle" : prev.timerVariant,
        };
      });
    }, []),

    updateInactivityTime: useCallback((seconds: number) => {
      setState((prev) => ({
        ...prev,
        inactivityTimeLeft: seconds,
        isInactivityWarning: seconds <= warningThresholdSeconds,
        timerVariant: seconds <= 0 ? "idle" : prev.timerVariant,
      }));
    }, [warningThresholdSeconds]),

    extendInactivityTimeout: useCallback((seconds: number) => {
      setState((prev) => ({
        ...prev,
        inactivityTimeLeft: Math.min(prev.maxInactivityTime, prev.inactivityTimeLeft + seconds),
        isInactivityWarning: false,
        timerVariant: "running",
      }));
    }, []),

    resetInactivityTimer: useCallback(() => {
      setState((prev) => ({
        ...prev,
        inactivityTimeLeft: prev.maxInactivityTime,
        isInactivityWarning: false,
        timerVariant: prev.maxInactivityTime > 0 ? "running" : "idle",
        isTimerActive: prev.maxInactivityTime > 0,
      }));
    }, []),

    setTimerActive: useCallback((active: boolean) => {
      setState((prev) => ({
        ...prev,
        isTimerActive: active,
        timerVariant: active ? "running" : "idle",
      }));
    }, []),

    setMaxInactivityTime: useCallback((seconds: number) => {
      setState((prev) => ({
        ...prev,
        maxInactivityTime: seconds,
        inactivityTimeLeft: Math.min(seconds, prev.inactivityTimeLeft),
        timerVariant: seconds <= 0 ? "idle" : prev.timerVariant,
      }));
    }, []),

    updateProcessingStage: useCallback(
      (stage: ProcessingStage) => {
        setState((prev) => ({
          ...prev,
          processingStage: stage,
        }));
        onProcessingChange?.(stage);
      },
      [onProcessingChange]
    ),

    updateProcessingProgress: useCallback((percent: number) => {
      setState((prev) => ({
        ...prev,
        processingProgress: Math.min(100, Math.max(0, percent)),
      }));
    }, []),

    setProcessingSteps: useCallback((steps) => {
      setState((prev) => ({
        ...prev,
        processingSteps: steps,
      }));
    }, []),

    setIsProcessing: useCallback((value: boolean) => {
      setState((prev) => ({
        ...prev,
        isProcessing: value,
      }));
    }, []),

    updateSelectedSize: useCallback((size) => {
      setState((prev) => ({ ...prev, selectedSize: size }));
    }, []),

    updateQuantity: useCallback((qty: number) => {
      setState((prev) => ({ ...prev, quantity: qty }));
    }, []),

    updateSelectedPayment: useCallback((method) => {
      setState((prev) => ({ ...prev, selectedPayment: method }));
    }, []),

    setError: useCallback(
      (error: string | null) => {
        setState((prev) => ({
          ...prev,
          error,
          processingStage: error ? "error" : prev.processingStage,
        }));
        if (error) onError?.(error);
      },
      [onError]
    ),

    reset: useCallback(() => {
      setState(buildInitialState(initialTimeoutSeconds, paymentTimeoutSeconds));
    }, [initialTimeoutSeconds, paymentTimeoutSeconds]),

    cancel: useCallback(() => {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        processingStage: "idle",
        currentStep: 1,
        completedSteps: [],
        isTimerActive: false,
        timerVariant: "idle",
      }));
    }, []),

    complete: useCallback(() => {
      setState((prev) => ({
        ...prev,
        processingStage: "complete",
        isProcessing: false,
        isTimerActive: false,
        timerVariant: "idle",
      }));
    }, []),
  };

  return { state, actions };
}
