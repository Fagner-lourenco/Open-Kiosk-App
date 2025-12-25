export type ProcessingStage =
  | "idle"
  | "awaiting_payment"
  | "payment_approved"
  | "recording_sale"
  | "dispensing"
  | "ready_pickup"
  | "complete"
  | "error";

export type TimerVariant = "idle" | "running" | "warning" | "critical";
export type CheckoutStep = 1 | 2 | 3 | 4;

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "in-progress" | "completed" | "error";
}

export interface CheckoutFlowState {
  currentStep: CheckoutStep;
  completedSteps: CheckoutStep[];
  isProcessing: boolean;
  isTimerActive: boolean;

  inactivityTimeLeft: number;
  maxInactivityTime: number;
  isInactivityWarning: boolean;
  timerVariant: TimerVariant;

  // Timeout específico de pagamento (para fácil integração futura)
  paymentTimeoutSeconds?: number;

  processingStage: ProcessingStage;
  processingProgress: number;
  processingSteps: ProgressStep[];

  selectedSize: any | null;
  quantity: number;
  selectedPayment: "pix_qr" | "card" | "debit" | null;

  error: string | null;
  isPaymentCancellable: boolean;
}

export interface CheckoutFlowActions {
  moveToStep(step: CheckoutStep): void;
  goBack(): void;

  updateInactivityTime(seconds: number): void;
  extendInactivityTimeout(seconds: number): void;
  resetInactivityTimer(): void;
  setTimerActive(active: boolean): void;
  setMaxInactivityTime(seconds: number): void;

  updateProcessingStage(stage: ProcessingStage): void;
  updateProcessingProgress(percent: number): void;
  setProcessingSteps(steps: ProgressStep[]): void;
  setIsProcessing(value: boolean): void;

  updateSelectedSize(size: any): void;
  updateQuantity(qty: number): void;
  updateSelectedPayment(method: "pix_qr" | "card" | "debit"): void;
  setError(error: string | null): void;

  reset(): void;
  cancel(): void;
  complete(): void;
}

export interface UseCheckoutFlowReturn {
  state: CheckoutFlowState;
  actions: CheckoutFlowActions;
}

export interface UseCheckoutFlowOptions {
  initialTimeoutSeconds?: number;
  paymentTimeoutSeconds?: number;
  warningThresholdSeconds?: number;
  onStepChange?: (step: CheckoutStep) => void;
  onTimeout?: (step: CheckoutStep) => void;
  onWarning?: (step: CheckoutStep, timeLeft: number) => void;
  onProcessingChange?: (stage: ProcessingStage) => void;
  onError?: (error: string) => void;
}

export interface StepperIndicatorProps {
  currentStep: CheckoutStep;
  completedSteps: CheckoutStep[];
  steps: Array<{ label: string; description?: string }>;
}

export interface InactivityTimerProps {
  secondsLeft: number;
  maxSeconds: number;
  variant: TimerVariant;
  onTimeout?: () => void;
  onWarning?: (secondsLeft: number) => void;
}

export interface ProcessingProgressProps {
  stage: ProcessingStage;
  steps: ProgressStep[];
  showPercentage?: boolean;
}

export interface TimeoutWarningProps {
  isOpen: boolean;
  secondsLeft: number;
  action: string;
  onExtend: () => void;
  onProceed: () => void;
}
