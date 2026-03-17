import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Minus, Plus, CreditCard, QrCode, Clock, Loader, AlertCircle, Smartphone, Check, ShieldAlert, AlertTriangle, RefreshCw, PhoneCall, TrendingDown, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { salesService } from "@/services/salesService";
import { useESP32 } from "@/context/ESP32Context";
import { paymentService } from "@/services/paymentService";
import { CartItem, Product } from "@/types/product";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCheckoutFlow } from "@/hooks/useCheckoutFlow";
import { InactivityTimer, ProcessingProgress, StepperIndicator, TimeoutWarning } from "./checkout/index";
import { usePaymentGateway } from "@/context/PaymentGatewayContext";
import { usePaymentStatusListener } from "@/hooks/usePaymentStatusListener";
import type { OrderCustomerData } from "@/types/sales";
import QRCode from "react-qr-code";
import { useTranslation } from "@/i18n";
import { getCurrentFranchiseId, getCurrentStoreId } from "@/services/firebase";
import { storeSubPath } from "@/lib/pathResolver";
import { persistFailedDispense, getPendingFailedDispenses, clearFailedDispense } from "@/services/dispenseRecoveryService";
import { systemLogService } from "@/services/systemLogService";
import type { CreatePaymentInput, PaymentMethod as GatewayPaymentMethod, PaymentRecord, PaymentStatus as GatewayPaymentStatus } from "@/types/payments";
import { encryptCard } from "@/utils/pagbankEncrypt";
import { evaluateDynamicPrice, toPricingSnapshot } from "../../shared/utils/dynamicPricingEngine";
import type { DynamicPricingResult, PricingSnapshot } from "../../shared/types/dynamicPricing";
import { useAudioVoice } from "@/hooks/useAudioVoice";
import {
  plugpagPaymentService,
  MAX_PLUGPAG_RETRIES,
  type PlugPagTerminalState,
} from "@/services/plugpagPaymentService";
import { PlugPagTerminalStatus } from "@/components/PlugPagTerminalStatus";
import { getPlugPagDeviceId } from "@/components/TapSettingsSync";

interface DrinkCheckoutSelection {
  product: Product;
  sizeKey: string;
  sizeLabel: string;
  mlPerUnit: number;
  price: number;
  quantity: number;
  totalAmount: number;
}

interface DrinkQuickCheckoutModalProps {
  isOpen: boolean;
  product: Product | null;
  currentCartItems: CartItem[];
  onComplete: (data: { orderNumber: string; drinkData: DrinkCheckoutSelection; enrichData?: { customerName?: string; customerIdentification?: string; payerId?: string; cardFirstDigits?: string; cardLastDigits?: string; } | null; storeId?: string }) => void;
  onCancel: () => void;
}

// v4.1.5: Checkpoint key para crash recovery entre pagamento aprovado e persistFailedDispense.
// Salvo em localStorage (síncrono) antes de qualquer chamada async — garante durabilidade imediata.
const CHECKOUT_PROGRESS_KEY = 'kiosk_checkout_progress';

const DrinkQuickCheckoutModal = ({ isOpen, product, currentCartItems, onComplete, onCancel }: DrinkQuickCheckoutModalProps) => {
  const [selectedSizeKey, setSelectedSizeKey] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(0);
  const [maxQty, setMaxQty] = useState<number>(0);
  
  // Função para determinar método de pagamento inicial baseado nos habilitados
  const getDefaultPaymentMethod = (): "pix_qr" | "credit_card" | "debit_card" => {
    // Usar enabledMethods do contexto quando disponível
    // Como o hook é chamado depois, usamos uma verificação lazy
    return "pix_qr"; // Será atualizado pelo useEffect
  };
  
  const [selectedPayment, setSelectedPayment] = useState<"pix_qr" | "credit_card" | "debit_card">(getDefaultPaymentMethod());
  const [currentTransactionId, setCurrentTransactionId] = useState<string | null>(null);
  
  // Estado de verificação de idade (antes do fluxo de checkout)
  const [ageVerified, setAgeVerified] = useState<boolean>(false);

  // Estados para Mercado Pago QR
  const [mpOrderId, setMpOrderId] = useState<string | null>(null);
  const [mpQrData, setMpQrData] = useState<string | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  
  // 🔧 FIX R10-66: Refs para IDs de pagamento — evita stale closure no emergency timeout
  const mpOrderIdRef = useRef<string | null>(null);
  const currentTransactionIdRef = useRef<string | null>(null);
  
  // Guardar orderNumber para uso no callback do polling
  const orderNumberRef = useRef<string>("");
  
  // Guard contra duplicação de processamento
  const saleRecordedRef = useRef(false);
  // Track which orderNumber has been recorded in Firestore (prevents duplicate sale on retry)
  const recordedOrderRef = useRef<string | null>(null);

  // Ranking opt-in: dados para fingerprinting de clientes recorrentes
  const lastEnrichDataRef = useRef<OrderCustomerData | null>(null);

  // Estados específicos para Mercado Pago Point (Terminal)
  const [pointStatus, setPointStatus] = useState<'idle' | 'sending' | 'at_terminal' | 'card_processing' | 'processing' | 'error'>('idle');
  // Flag: cancel não é possível quando ordem está no terminal
  const [cancelBlocked, setCancelBlocked] = useState(false);

  const { currentCurrency } = useSettings();
  const { toast } = useToast();
  const { settings: storeSettings } = useStoreSettings();
  const { t } = useTranslation();

  // ── Áudio de voz ─────────────────────────────────────────────────────
  const soundEnabled = storeSettings?.drinkPickupSoundEnabled ?? true;
  const { playGuarded, playGuardedDelayed, clearScope } = useAudioVoice(soundEnabled);
  /** ID único por abertura do modal — garante que prompts once-per-scope se reiniciem para cada cliente */
  const modalScopeId = useRef('');
  /** Contador de tentativas de pagamento — scope único por tentativa */
  const paymentAttemptRef = useRef(0);
  
  // Configuração do gateway de pagamento (Firestore > env vars)
  const { gatewayConfig, resolvedConfig, isConfigured, enabledMethods } = usePaymentGateway();
  const provider = gatewayConfig?.provider || resolvedConfig.provider || 'none';
  const isPagBank = provider === 'pagbank';

  // PlugPag: card-present via terminal Bluetooth (Moderninha Pro 2, etc)
  const isPlugPagEnabled = useMemo(() => {
    if (!isPagBank) return false;
    const plugpagConfig = gatewayConfig?.providers?.pagbank?.plugpag;
    if (!plugpagConfig?.enabled) return false;
    const deviceId = getPlugPagDeviceId();
    return !!deviceId;
  }, [isPagBank, gatewayConfig]);

  // Quando PlugPag está ativo e o método é cartão, usamos o terminal físico
  // PIX fica via API REST (QR na tela do kiosk) — melhor UX para o cliente
  const usePlugPagForCard = isPlugPagEnabled && (selectedPayment === 'credit_card' || selectedPayment === 'debit_card');

  // 🔍 DIAG: Log decisão de pagamento para debug de sync Admin→Kiosk
  useEffect(() => {
    const deviceId = getPlugPagDeviceId();
    console.log('[DrinkQuickCheckout] Payment decision:', {
      'gatewayConfig.provider': gatewayConfig?.provider ?? '(null)',
      'resolvedConfig.provider': resolvedConfig.provider,
      provider,
      isPagBank,
      isPlugPagEnabled,
      usePlugPagForCard,
      plugpagDeviceId: deviceId || '(empty)',
      plugpagEnabled: gatewayConfig?.providers?.pagbank?.plugpag?.enabled ?? false,
      isConfigured,
    });
  }, [provider, isPagBank, isPlugPagEnabled, usePlugPagForCard, gatewayConfig, resolvedConfig, isConfigured]);

  useEffect(() => {
    const unsubscribe = plugpagPaymentService.onStateChange((state) => {
      setPlugpagTerminalState(state);
    });
    return unsubscribe;
  }, []);

  // PagBank (estado local)
  const [pagbankPaymentId, setPagbankPaymentId] = useState<string | null>(null);
  const [pagbankStatus, setPagbankStatus] = useState<GatewayPaymentStatus | null>(null);
  const [pagbankQrCodeText, setPagbankQrCodeText] = useState<string | null>(null);
  const [pagbankError, setPagbankError] = useState<string | null>(null);
  const [plugpagTerminalState, setPlugpagTerminalState] = useState<PlugPagTerminalState>(plugpagPaymentService.getState());
  const pagbankUnsubscribeRef = useRef<(() => void) | null>(null);

  // PlugPag: retry state for card-present payment failures
  const plugpagRetryCountRef = useRef(0);
  const plugpagLastOrderRef = useRef<string | null>(null);
  const plugpagLastAmountRef = useRef<number>(0);

  // PagBank (dados do pagador e cartão)
  const [payerName, setPayerName] = useState('');
  const [payerTaxId, setPayerTaxId] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  
  // Hook unificado para comunicação ESP32
  const { releaseDrink: esp32ReleaseDrink, status: esp32Status, selectedTapId } = useESP32();

  const { state: flowState, actions: flowActions } = useCheckoutFlow({
    initialTimeoutSeconds: 60,
    paymentTimeoutSeconds: 120, // Sincronizado com MERCADO_PAGO_CONFIG.POINT_EXPIRATION_TIME (PT2M = 2min)
    warningThresholdSeconds: 10,
    onTimeout: () => {
      toast({ title: t('checkout.sessionExpired'), description: t('checkout.checkoutCancelledInactivity'), variant: "destructive" });
      onCancel();
    },
  });

  const {
    moveToStep,
    reset,
    setMaxInactivityTime,
    resetInactivityTimer,
    setTimerActive,
    updateProcessingStage,
    setIsProcessing,
    cancel: flowCancel,
  } = flowActions;

  const processingStageRef = useRef(flowState.processingStage);

  // Hook de status via Firestore onSnapshot + Cloud Function fallback
  const {
    isListening: isPolling,
    status: listenerStatus,
    payment: listenerPayment,
    startListening,
    stopListening,
  } = usePaymentStatusListener({
    storeId: getCurrentStoreId() || undefined,
    franchiseId: getCurrentFranchiseId() || undefined,
    onPaid: async (payment) => {
      console.log('[DrinkMP] Pagamento aprovado via listener', { paymentId: payment.id, providerOrderId: payment.providerOrderId });
      systemLogService.info('payment', `Pagamento aprovado: ${payment.id}`, { paymentId: payment.id, orderNumber: orderNumberRef.current });
      
      // Guard contra duplicação
      if (saleRecordedRef.current) {
        console.log('[DrinkMP] Já processado, ignorando duplicação');
        return;
      }
      saleRecordedRef.current = true;
      
      // Liberar terminal para próxima ordem (self-service)
      paymentService.markTerminalOrderComplete();
      
      setPointStatus('idle');
      toast({
        title: t('checkout.paymentApprovedToast'),
        description: t('checkout.paymentConfirmedSuccess')
      });
      updateProcessingStage("payment_approved");
      
      // Buscar dados do pagador (nome, email, cartão) via providerOrderId — não bloqueia dispense
      const orderNumber = orderNumberRef.current;
      if (payment.providerOrderId) {
        paymentService.checkMercadoPagoOrderStatus(payment.providerOrderId)
          .then((order) => paymentService.fetchPayerDataFromOrder(order, gatewayConfig))
          .then(async (customerData) => {
            if (customerData && orderNumber) {
              lastEnrichDataRef.current = customerData;
              await salesService.enrichOrderWithCustomerData(orderNumber, customerData, getCurrentStoreId());
              systemLogService.info('payment', `Dados do pagador gravados: ${orderNumber}`, {
                hasName: !!customerData.customerName,
                hasCpf: !!customerData.customerIdentification,
                provider: customerData.gatewayProvider,
                cardBrand: customerData.cardBrand,
              });
            }
          })
          .catch((err) => {
            console.warn('[DrinkMP] Falha ao enriquecer com dados do pagador (não-bloqueante):', err);
            systemLogService.warn('payment', `Falha ao buscar dados do pagador: ${err instanceof Error ? err.message : String(err)}`, { orderNumber });
          });
      }

      // Continuar com o fluxo pós-pagamento usando o orderNumber salvo
      await finishPaymentFlow(orderNumber);
    },
    onError: (errorMsg) => {
      console.error('[DrinkMP] Erro no listener:', errorMsg);
      systemLogService.error('payment', `Pagamento falhou: ${errorMsg}`, { orderNumber: orderNumberRef.current });
      
      // Mapear mensagens de erro para português amigável
      const errorMessages: Record<string, { title: string; description: string }> = {
        'Pagamento recusado': {
          title: 'Pagamento Recusado',
          description: 'O pagamento foi recusado. Verifique o limite do cartão ou tente outro método de pagamento.'
        },
        'Pagamento expirado': {
          title: 'Tempo Expirado',
          description: 'O tempo para pagamento expirou. Por favor, tente novamente.'
        },
        'Pagamento cancelado': {
          title: 'Pagamento Cancelado',
          description: 'O pagamento foi cancelado.'
        },
      };
      
      const errorInfo = errorMessages[errorMsg] || {
        title: 'Erro no Pagamento',
        description: errorMsg || 'Ocorreu um erro ao processar o pagamento. Tente novamente.'
      };
      
      // Mostrar toast de erro com mensagem clara
      toast({
        title: errorInfo.title,
        description: errorInfo.description,
        variant: 'destructive',
      });
      
      setMpError(errorInfo.description);
      setPointStatus('error');
      setIsProcessing(false);
      updateProcessingStage("idle");
      moveToStep(2);
      // Áudio: erro de pagamento com cooldown de 10s (evita repetição em retry rápido)
      playGuarded('payment_error', modalScopeId.current, 10_000);
    },
    onStatusChange: (status: GatewayPaymentStatus, payment) => {
      console.log('[DrinkMP] Status changed:', { status, channel: payment.channel, providerStatus: (payment as any).providerStatus });
      const providerStatus = ((payment as any).providerStatus || '').toLowerCase();

      // Granular Point status from providerStatus
      if (selectedPayment !== 'pix_qr') {
        if (providerStatus === 'at_terminal' || providerStatus === 'opened') {
          setPointStatus('at_terminal');
          setCancelBlocked(true);
        } else if (providerStatus === 'processing') {
          setPointStatus('card_processing');
          setCancelBlocked(true);
        }
      }

      // Terminal statuses: pagamento recusado/cancelado/expirado
      if (['canceled', 'expired', 'failed'].includes(status)) {
        const errorMessages: Record<string, string> = {
          failed: 'Pagamento recusado',
          expired: 'Pagamento expirado',
          canceled: 'Pagamento cancelado',
        };
        const errorMsg = errorMessages[status] || 'Pagamento não aprovado';
        setMpError(errorMsg);
        setPointStatus('error');
        setCancelBlocked(false);
        setIsProcessing(false);
        updateProcessingStage('idle');
        moveToStep(2);
        toast({ title: 'Erro no Pagamento', description: errorMsg, variant: 'destructive' });
        playGuarded('payment_error', modalScopeId.current, 10_000);
      }
    },
    onFallbackAttempt: (attempt, maxAttempts) => {
      console.log(`[DrinkMP] Fallback tentativa ${attempt}/${maxAttempts}`);
    },
  });
  const emergencyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupPagBankListener = useCallback(() => {
    if (pagbankUnsubscribeRef.current) {
      pagbankUnsubscribeRef.current();
      pagbankUnsubscribeRef.current = null;
    }
  }, []);

  const buildGatewayItems = () => {
    if (!product || !selectedSize) return [];
    return [{
      name: `${product.title} - ${selectedSize.label}`,
      quantity,
      unitAmount: resolvedUnitPrice,
    }];
  };

  const mapGatewayMethod = (method: "pix_qr" | "credit_card" | "debit_card"): GatewayPaymentMethod => {
    if (method === "pix_qr") return "pix";
    if (method === "credit_card") return "credit";
    return "debit";
  };

  useEffect(() => {
    processingStageRef.current = flowState.processingStage;
  }, [flowState.processingStage]);

  useEffect(() => {
    return () => {
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }
      // 🔧 FIX Bug #22: Garantir limpeza do checkpoint no unmount do componente.
      // Cobre desmonte abrupto por navegação ou React StrictMode sem ter passado
      // pelo handleCancelPayment ou pelos paths de sucesso/falha normais.
      localStorage.removeItem(CHECKOUT_PROGRESS_KEY);
      cleanupPagBankListener();
    };
  }, [cleanupPagBankListener]);

  const selectedSize = useMemo(() => {
    return product?.sizes?.find((s) => s.key === selectedSizeKey);
  }, [product, selectedSizeKey]);

  // ── Keg Level (para Barril Progressivo) ──────────────────────────────
  const [kegLevelPercent, setKegLevelPercent] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || !selectedTapId) {
      setKegLevelPercent(undefined);
      return;
    }

    const franchiseId = getCurrentFranchiseId();
    const storeId = getCurrentStoreId();
    if (!franchiseId || !storeId) return;

    let unsubKeg: (() => void) | null = null;
    let isMounted = true;

    (async () => {
      try {
        const db = (await import('@/services/firebase')).getFirebaseDb();
        const { doc, getDoc, onSnapshot } = await import('firebase/firestore');

        // 🔒 FIX Bug-24: Guard against orphaned listener if component unmounted during async setup
        if (!isMounted) return;

        // 1. Ler tap operacional → currentKegId (one-shot — tap raramente muda)
        const tapDocPath = `${storeSubPath(franchiseId, storeId, 'taps')}/${selectedTapId}`;
        const tapSnap = await getDoc(doc(db, tapDocPath));
        if (!isMounted) return;
        if (!tapSnap.exists()) return;

        const currentKegId = tapSnap.data()?.currentKegId;
        if (!currentKegId) return;

        // 2. Real-time listener no keg → recalcula nível quando remainingMl muda
        const kegDocPath = `${storeSubPath(franchiseId, storeId, 'kegs')}/${currentKegId}`;
        unsubKeg = onSnapshot(doc(db, kegDocPath), (kegSnap) => {
          if (!isMounted) return;
          if (!kegSnap.exists()) return;
          const kegData = kegSnap.data();
          const volumeMl = kegData?.volumeMl ?? 0;
          const remainingMl = kegData?.remainingMl ?? 0;

          if (volumeMl > 0) {
            // % consumido (0 = cheio, 100 = vazio)
            const consumed = ((volumeMl - remainingMl) / volumeMl) * 100;
            setKegLevelPercent(Math.max(0, Math.min(100, consumed)));
          }
        }, (err) => {
          console.warn('[DrinkCheckout] Keg level listener error (non-critical):', err);
        });
      } catch (err) {
        console.warn('[DrinkCheckout] Keg level lookup failed (non-critical):', err);
      }
    })();

    return () => {
      isMounted = false;
      if (unsubKeg) unsubKeg();
    };
  }, [isOpen, selectedTapId]);

  // ── Dynamic Pricing ─────────────────────────────────────────────────
  // DP ativo se: config.enabled OU event mode com activateDynamicPricing
  const dpConfig = storeSettings?.dynamicPricingConfig;
  const eventDpOverride = storeSettings?.eventMode?.enabled && storeSettings?.eventMode?.activateDynamicPricing;
  const isDpActive = !!(dpConfig?.rules?.length && (dpConfig.enabled || eventDpOverride));

  // 🔧 Tick reativo para recalcular DP quando Happy Hour começa/termina
  const [dpTick, setDpTick] = useState(0);
  useEffect(() => {
    if (!isDpActive) return;
    const interval = setInterval(() => setDpTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [isDpActive]);

  const dynamicPriceResult = useMemo(() => {
    if (!selectedSize || !isDpActive || !dpConfig) return null;
    const basePricePerMl = selectedSize.price / selectedSize.ml;
    // Quando DP ativado via event mode, tratar config como enabled
    const effectiveConfig = dpConfig.enabled ? dpConfig : { ...dpConfig, enabled: true };
    return evaluateDynamicPrice(basePricePerMl, effectiveConfig, {
      timestamp: new Date(),
      kegLevelPercent,
    });
     
  }, [selectedSize, isDpActive, dpConfig, kegLevelPercent, dpTick]);

  /** Preço unitário resolvido (com ou sem DP) */
  const resolvedUnitPrice = useMemo(() => {
    if (!selectedSize) return 0;
    if (!dynamicPriceResult || dynamicPriceResult.deltaPercent === 0) return selectedSize.price;
    return Number((dynamicPriceResult.effectivePricePerMl * selectedSize.ml).toFixed(
      dpConfig?.roundingPrecision ?? 2
    ));
  }, [selectedSize, dynamicPriceResult, dpConfig?.roundingPrecision]);

  /** Snapshot de pricing para auditoria no pedido */
  const currentPricingSnapshot: PricingSnapshot | undefined = useMemo(() => {
    if (!dynamicPriceResult || !selectedSize || dynamicPriceResult.deltaPercent === 0) return undefined;
    return toPricingSnapshot(dynamicPriceResult, selectedSize.price, resolvedUnitPrice);
  }, [dynamicPriceResult, selectedSize, resolvedUnitPrice]);

  const processingSteps = useMemo(() => {
    const order = ["awaiting_payment", "payment_approved", "recording_sale", "dispensing", "ready_pickup", "complete"] as const;
    const statusFor = (target: typeof order[number]) => {
      const currentIndex = order.indexOf(flowState.processingStage as typeof order[number]);
      const targetIndex = order.indexOf(target);
      if (currentIndex > targetIndex) return "completed" as const;
      if (currentIndex === targetIndex) return "in-progress" as const;
      return "pending" as const;
    };

    return [
      { id: "payment", label: t('checkout.paymentStep'), status: statusFor("awaiting_payment") },
      { id: "approved", label: t('checkout.approved'), status: statusFor("payment_approved") },
      { id: "sale", label: t('checkout.recordingSaleStep'), status: statusFor("recording_sale") },
      { id: "dispense", label: t('checkout.dispensingStep'), status: statusFor("dispensing") },
      { id: "ready", label: t('checkout.readyForPickup'), status: statusFor("ready_pickup") },
    ];
  }, [flowState.processingStage, t]);

  useEffect(() => {
    if (isOpen && product?.sizes?.length) {
      const initialKey = product.defaultSizeKey || product.sizes[0].key;
      setSelectedSizeKey(initialKey || "");
      setQuantity(1);
      reset();
      setMaxInactivityTime(60);
      resetInactivityTimer();
      setTimerActive(true);
      moveToStep(1);
      updateProcessingStage("idle");
      setIsProcessing(false);
    }
  }, [isOpen, product, moveToStep, reset, resetInactivityTimer, setIsProcessing, setMaxInactivityTime, setTimerActive, updateProcessingStage]);

  // ── Áudio: gerar scope ao abrir modal, limpar ao fechar ────────────────
  useEffect(() => {
    if (isOpen) {
      modalScopeId.current = `modal-${Date.now()}`;
    } else {
      clearScope(modalScopeId.current);
      paymentAttemptRef.current = 0;
      modalScopeId.current = '';
    }
  }, [isOpen, clearScope]);

  // ── Áudio: verificação de idade ────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !ageVerified && modalScopeId.current) {
      playGuarded('age_verify', modalScopeId.current);
    }
  }, [isOpen, ageVerified, playGuarded]);

  // ── Áudio: step 1 — tamanho e quantidade ──────────────────────────────
  useEffect(() => {
    if (flowState.currentStep === 1 && ageVerified && modalScopeId.current) {
      playGuarded('choose_size_and_quantity', modalScopeId.current);
    }
  }, [flowState.currentStep, ageVerified, playGuarded]);

  // ── Áudio: estoque baixo (cooldown 10s) ───────────────────────────────
  useEffect(() => {
    if (flowState.currentStep === 1 && maxQty > 0 && maxQty <= 2) {
      playGuarded('stock_limit', modalScopeId.current, 10_000);
    }
  }, [maxQty, flowState.currentStep, playGuarded]);

  // ── Áudio: step 2 — escolha do pagamento (cooldown 15s para replay nas tentativas) ──
  useEffect(() => {
    if (flowState.currentStep === 2 && modalScopeId.current) {
      playGuarded('choose_payment', modalScopeId.current, 15_000);
    }
  }, [flowState.currentStep, playGuarded]);

  // ── Áudio: pagamento aprovado ──────────────────────────────────────────
  useEffect(() => {
    if (flowState.processingStage === 'payment_approved' && orderNumberRef.current) {
      playGuarded('payment_approved', `${orderNumberRef.current}-approved`);
    }
  }, [flowState.processingStage, playGuarded]);

  // ── Áudio: gravando venda (sistema confirmando/processando) ────────────
  useEffect(() => {
    if (flowState.processingStage === 'recording_sale' && orderNumberRef.current) {
      playGuarded('processing_payment', `${orderNumberRef.current}-recording`);
    }
  }, [flowState.processingStage, playGuarded]);

  // ── Áudio: dispense_failed ────────────────────────────────────────────
  useEffect(() => {
    if (flowState.processingStage === 'dispense_failed' && orderNumberRef.current) {
      playGuarded('dispense_failed', `${orderNumberRef.current}-dispense`);
    }
  }, [flowState.processingStage, playGuarded]);

  useEffect(() => {
    if (!product || !selectedSizeKey) {
      setMaxQty(0);
      return;
    }

    const size = product.sizes?.find((s) => s.key === selectedSizeKey);
    if (!size || !size.ml || size.ml <= 0) {
      setMaxQty(0);
      return;
    }

    const mlInCart = currentCartItems
      .filter((i) => i.product.id === product.id)
      .reduce((sum, i) => sum + ((i.mlPerUnit || 0) * i.quantity), 0);

    const mlAvailable = (product.totalMlAvailable || 0) - mlInCart;
    const max = Math.max(0, Math.floor(mlAvailable / size.ml));

    setMaxQty(max);
    // quantity é usado apenas para leitura aqui, não precisa estar nas deps
  }, [currentCartItems, product, selectedSizeKey]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedSizeKey("");
      setQuantity(0);
      setMaxQty(0);
      setSelectedPayment("pix_qr");
      setCurrentTransactionId(null);
      currentTransactionIdRef.current = null;
      flowCancel();
      setTimerActive(false);
      updateProcessingStage("idle");
      // Reset Point status
      setPointStatus('idle');
      setCancelBlocked(false);
      // Cleanup: Mercado Pago listener
      stopListening();
      setMpOrderId(null);
      mpOrderIdRef.current = null;
      setMpQrData(null);
      setMpError(null);
      cleanupPagBankListener();
      setPagbankPaymentId(null);
      setPagbankStatus(null);
      setPagbankQrCodeText(null);
      setPagbankError(null);
      setPayerName('');
      setPayerTaxId('');
      setPayerEmail('');
      setCardNumber('');
      setCardExpMonth('');
      setCardExpYear('');
      setCardCvv('');
      // Reset sale guard
      saleRecordedRef.current = false;
      recordedOrderRef.current = null;
      // Reset ranking opt-in state
      lastEnrichDataRef.current = null;
      // Reset dispense retry count para próximo cliente
      dispenseRetryCountRef.current = 0;
      // Reset PlugPag retry state
      plugpagRetryCountRef.current = 0;
      plugpagLastOrderRef.current = null;
      plugpagLastAmountRef.current = 0;
      orderNumberRef.current = '';
      // Reset verificação de idade
      setAgeVerified(false);
      // Cleanup: cancelar pagamentos pendentes via CF
      if (currentTransactionId && !isPagBank) {
        paymentService.cancelMercadoPagoPaymentCF(currentTransactionId).catch(console.error);
      }
    }
  }, [isOpen, currentTransactionId, flowCancel, setTimerActive, updateProcessingStage, stopListening, cleanupPagBankListener, isPagBank]);

  // Ajustar método de pagamento se o atual estiver desabilitado
  useEffect(() => {
    const isCurrentMethodDisabled = 
      (selectedPayment === 'pix_qr' && !enabledMethods.pix) ||
      (selectedPayment === 'credit_card' && !enabledMethods.credit) ||
      (selectedPayment === 'debit_card' && !enabledMethods.debit);
    
    if (isCurrentMethodDisabled) {
      // Selecionar primeiro método habilitado
      if (enabledMethods.pix) setSelectedPayment('pix_qr');
      else if (enabledMethods.credit) setSelectedPayment('credit_card');
      else if (enabledMethods.debit) setSelectedPayment('debit_card');
    }
  }, [enabledMethods, selectedPayment]);

  const handleNext = (fromStep: number) => {
    resetInactivityTimer();
    if (fromStep === 1) {
      if (!product || !selectedSize || !selectedSizeKey || quantity <= 0 || maxQty <= 0) {
        toast({ title: t('common.error'), description: t('checkout.selectValidSizeQuantity'), variant: "destructive" });
        return;
      }
      moveToStep(2);
      return;
    }
  };

  // Iniciar pagamento diretamente do Step 2
  const handleStartPayment = async () => {
    resetInactivityTimer();
    if (!selectedPayment) {
      toast({ title: t('common.error'), description: t('checkout.selectPaymentMethodError'), variant: "destructive" });
      return;
    }
    if (!selectedSize || selectedSize.ml <= 0) {
      toast({ title: t('common.error'), description: t('checkout.invalidSize'), variant: "destructive" });
      return;
    }
    if (quantity <= 0 || maxQty <= 0) {
      toast({ title: t('common.error'), description: t('checkout.quantityUnavailable'), variant: "destructive" });
      return;
    }
    await handlePaymentComplete();
  };

  const handleBack = (fromStep: number) => {
    if (fromStep === 2) {
      moveToStep(1);
    } else if (fromStep === 1) {
      onCancel();
    }
  };

  const handleCancelPayment = async () => {
    if (emergencyTimeoutRef.current) {
      clearTimeout(emergencyTimeoutRef.current);
      emergencyTimeoutRef.current = null;
    }

    // 🔧 FIX Bug #22: Limpar checkpoint de crash ao cancelar pagamento.
    // Sem isso, se finishPaymentFlow gravou o checkpoint antes do cancelamento
    // (ex: emergencyTimeout dispara logo após pagamento aprovado), o reconcileOnStartup
    // marcaria o pedido como failed_dispense mesmo sem pagamento confirmado.
    localStorage.removeItem(CHECKOUT_PROGRESS_KEY);

    // PlugPag: abortar pagamento no terminal físico
    if (usePlugPagForCard) {
      const aborted = await plugpagPaymentService.abortPayment();
      // Reset retry counter
      plugpagRetryCountRef.current = 0;
      plugpagLastOrderRef.current = null;
      plugpagLastAmountRef.current = 0;
      setPagbankError(null);
      setIsProcessing(false);
      updateProcessingStage("idle");
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(2);
      toast({
        title: t('checkout.paymentCanceled') || 'Pagamento cancelado',
        description: aborted
          ? 'Pagamento cancelado no terminal.'
          : 'Cancelamento enviado — aguarde o terminal.',
      });
      return;
    }

    if (isPagBank) {
      // KIO-03 fix: Cancel PagBank remotely via Cloud Function (not local-only)
      cleanupPagBankListener();
      const cancelPaymentId = pagbankPaymentId;
      setPagbankPaymentId(null);
      setPagbankStatus('canceled');
      setPagbankQrCodeText(null);
      setPagbankError(null);
      setIsProcessing(false);
      updateProcessingStage("idle");
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(2);
      saleRecordedRef.current = false;
      recordedOrderRef.current = null;

      // Fire-and-forget remote cancel — best effort
      if (cancelPaymentId) {
        systemLogService.info('payment', 'Pagamento PagBank cancelado pelo usuário', { paymentId: cancelPaymentId });
        paymentService.cancelPagBankPayment(cancelPaymentId).then(result => {
          console.log('[DrinkQR] PagBank cancel result:', result);
        }).catch(err => {
          console.warn('[DrinkQR] PagBank remote cancel failed (cancel_requested fallback):', err);
          systemLogService.error('payment', 'Falha ao cancelar PagBank remotamente', { paymentId: cancelPaymentId, error: err instanceof Error ? err.message : String(err) });
        });
      }

      toast({
        title: t('checkout.paymentCanceled') || 'Pagamento cancelado',
        description: 'Cancelamento solicitado ao gateway.',
        variant: 'default',
      });
      return;
    }
    
    // Capturar orderId ANTES de limpar estado (evita race condition)
    // 🔧 FIX R10-66: Usar refs ao invés de state para evitar stale closure no emergency timeout
    const orderIdToCancel = mpOrderIdRef.current ?? mpOrderId;
    const transactionIdToCancel = currentTransactionIdRef.current ?? currentTransactionId;
    
    // Cancelar ordem remotamente via Cloud Function (usando valor capturado)
    if (transactionIdToCancel || orderIdToCancel) {
      try {
        const paymentIdToCancel = transactionIdToCancel || orderIdToCancel || '';
        const result = await paymentService.cancelMercadoPagoPaymentCF(paymentIdToCancel);
        
        if (result.canceled) {
          // Cancelamento confirmado — limpar tudo e voltar ao Step 2
          stopListening();
          setMpOrderId(null);
          mpOrderIdRef.current = null;
          setMpQrData(null);
          setMpError(null);
          setPointStatus('idle');
          setCancelBlocked(false);
          saleRecordedRef.current = false;
          setIsProcessing(false);
          updateProcessingStage("idle");
          setCurrentTransactionId(null);
          currentTransactionIdRef.current = null;
          setMaxInactivityTime(60);
          resetInactivityTimer();
          moveToStep(2);
          toast({ title: t('checkout.paymentCanceled'), description: t('checkout.operationCancelledByUser') });
        } else if (result.reason === 'at_terminal') {
          // ⚠️ Ordem está no terminal — NÃO parar listener, NÃO voltar ao Step 2
          // Manter no Step 3 monitorando. O cliente deve completar ou aguardar expiração.
          setCancelBlocked(true);
          toast({ 
            title: 'Cancelamento não disponível', 
            description: 'Complete o pagamento na maquininha ou aguarde a expiração automática.',
            variant: 'default'
          });
        } else if (result.reason === 'already_processed') {
          toast({ 
            title: 'Pagamento já processado', 
            description: 'Este pagamento já foi concluído.',
            variant: 'default'
          });
        } else {
          // cancel_requested — manter listener para capturar resultado final
          setCancelBlocked(true);
          toast({
            title: t('checkout.paymentCanceled'),
            description: 'Cancelamento solicitado. Aguardando confirmação...',
            variant: 'default'
          });
        }
      } catch (error) {
        console.warn("[DrinkQR] Falha ao cancelar ordem remotamente:", error);
        systemLogService.error('payment', 'Falha ao cancelar ordem MP remotamente', { orderId: orderIdToCancel, error: error instanceof Error ? error.message : String(error) });
        // Em caso de erro, limpar e voltar
        stopListening();
        setMpOrderId(null);
        mpOrderIdRef.current = null;
        setMpQrData(null);
        setMpError(null);
        setPointStatus('idle');
        setCancelBlocked(false);
        saleRecordedRef.current = false;
        setIsProcessing(false);
        updateProcessingStage("idle");
        setCurrentTransactionId(null);
        currentTransactionIdRef.current = null;
        setMaxInactivityTime(60);
        resetInactivityTimer();
        moveToStep(2);
        toast({ title: t('checkout.paymentCanceled'), description: t('checkout.operationCancelledByUser') });
      }
    } else {
      // Sem IDs para cancelar — limpar e voltar
      stopListening();
      setMpOrderId(null);
      mpOrderIdRef.current = null;
      setMpQrData(null);
      setMpError(null);
      setPointStatus('idle');
      setCancelBlocked(false);
      saleRecordedRef.current = false;
      setIsProcessing(false);
      updateProcessingStage("idle");
      setCurrentTransactionId(null);
      currentTransactionIdRef.current = null;
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(2);
    }
  };

  // KIO-02: Retry dispense para pedidos já pagos com dispense falhado
  const dispenseRetryCountRef = useRef(0);
  const MAX_DISPENSE_RETRIES = 2;

  const handleRetryDispense = useCallback(async () => {
    if (!product || !selectedSize || !orderNumberRef.current) return;
    if (dispenseRetryCountRef.current >= MAX_DISPENSE_RETRIES) {
      toast({
        title: t('checkout.dispenserWarning'),
        description: 'Número máximo de tentativas atingido. Procure um atendente.',
        variant: 'destructive',
      });
      return;
    }
    dispenseRetryCountRef.current += 1;
    updateProcessingStage("dispensing");

    try {
      // 🔧 Resume parcial: buscar progresso do dispense falhado para dispensar apenas o restante
      let remainingMl = selectedSize.ml;
      let remainingCups = quantity;
      const pendingDispenses = await getPendingFailedDispenses();
      const failedEntry = pendingDispenses.find(d => d.orderNumber === orderNumberRef.current);

      // 🔧 FIX Bug #23: Se flowStarted=true E mlDispensed=0, a solenóide pode ter aberto
      // sem o sensor de fluxo medir nada — caso ambíguo, pode ter dispensado tudo sem registro.
      // Dispensar novamente poderia entregar o dobro do produto. Exigir atendente.
      if (failedEntry?.flowStarted === true && (!failedEntry.mlDispensed || failedEntry.mlDispensed === 0)) {
        toast({
          title: t('checkout.dispenserWarning'),
          description: 'Não foi possível confirmar o volume dispensado. Procure um atendente para verificar.',
          variant: 'destructive',
        });
        updateProcessingStage("dispense_failed");
        systemLogService.error('dispense', `Retry bloqueado: ambiguous flow (flowStarted=true, mlDispensed=0)`, {
          orderNumber: orderNumberRef.current, reason: failedEntry.reason,
        });
        return;
      }

      if (failedEntry?.mlDispensed && failedEntry.mlDispensed > 0 && failedEntry?.targetMl) {
        const alreadyDispensed = Math.floor(failedEntry.mlDispensed);
        remainingMl = Math.max(1, failedEntry.targetMl - alreadyDispensed);
        // Se era multi-cup e o copo atual já estava em progresso, continuar do copo atual
        if (failedEntry.cup && failedEntry.totalCups && failedEntry.cup > 1) {
          // Cups já completos não precisam ser re-dispensados
          remainingCups = failedEntry.totalCups - (failedEntry.cup - 1);
          if (remainingCups <= 0) remainingCups = 1;
        }
        console.log(`[DrinkMP] Resume parcial: já dispensou ${alreadyDispensed}ml de ${failedEntry.targetMl}ml, restam ${remainingMl}ml (copo ${failedEntry.cup}/${failedEntry.totalCups})`);
        systemLogService.info('dispense', `Resume parcial: ${alreadyDispensed}ml já dispensados, restam ${remainingMl}ml`, {
          orderNumber: orderNumberRef.current, alreadyDispensed, remainingMl, cup: failedEntry.cup, totalCups: failedEntry.totalCups,
        });
      }

      // Limpar entrada de falha anterior antes do retry
      if (failedEntry) {
        await clearFailedDispense(failedEntry.orderNumber);
      }

      const releaseSuccess = await esp32ReleaseDrink(
        orderNumberRef.current,
        remainingMl,
        remainingCups,
        selectedSize.label,
        selectedTapId
      );

      if (releaseSuccess) {
        // Sucesso no retry — concluir fluxo
        // v4.1.5: Status 'dispensed' será atualizado pelo ESP32Context ao receber stage:'completed'
        // (igual ao fluxo principal — não escrever aqui para evitar inconsistência/bypass da confirmação física)
        updateProcessingStage("ready_pickup");

        const subtotal = Math.round(resolvedUnitPrice * quantity * 100) / 100;
        const taxRate = (storeSettings?.taxPercentage || 0) / 100;
        const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
        const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

        const enrichData = lastEnrichDataRef.current;
        onComplete({
          orderNumber: orderNumberRef.current,
          drinkData: {
            product,
            sizeKey: selectedSize.key,
            sizeLabel: selectedSize.label,
            mlPerUnit: selectedSize.ml,
            price: resolvedUnitPrice,
            quantity,
            totalAmount,
          },
          enrichData: enrichData ? {
            customerName: enrichData.customerName,
            customerIdentification: enrichData.customerIdentification,
            payerId: enrichData.payerId,
            cardFirstDigits: enrichData.cardFirstDigits,
            cardLastDigits: enrichData.cardLastDigits,
          } : null,
          storeId: getCurrentStoreId() || undefined,
        });

        setIsProcessing(false);
        updateProcessingStage("complete");
        setTimeout(() => { onCancel(); }, 1500);
      } else {
        // Retry falhou novamente
        await salesService.updateOrderDispenseStatus(orderNumberRef.current, 'failed_dispense', getCurrentStoreId())
          .catch(e => console.warn('[DrinkMP] Falha ao atualizar status failed:', e));
        updateProcessingStage("dispense_failed");
        toast({
          title: t('checkout.dispenserWarning'),
          description: `Tentativa ${dispenseRetryCountRef.current}/${MAX_DISPENSE_RETRIES} falhou.`,
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[DrinkMP] Retry dispense error:', err);
      systemLogService.error('dispense', `Retry dispense error: ${err instanceof Error ? err.message : String(err)}`, { attempt: dispenseRetryCountRef.current });
      updateProcessingStage("dispense_failed");
    }
  }, [product, selectedSize, quantity, selectedTapId, esp32ReleaseDrink, onComplete, onCancel, storeSettings, t, toast, updateProcessingStage, setIsProcessing]);

  // Função para processar etapas pós-pagamento (venda, dispensing, etc)
  const finishPaymentFlow = async (orderNumber: string) => {
    if (!product || !selectedSize) return;

    const subtotal = Math.round(resolvedUnitPrice * quantity * 100) / 100;
    const taxRate = (storeSettings?.taxPercentage || 0) / 100;
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    // v4.1.5: Checkpoint de crash — gravado em localStorage ANTES de qualquer chamada async.
    // Se o app travar entre pagamento aprovado e persistFailedDispense, reconcileOnStartup
    // detecta via bridging localStorage→IndexedDB e marca o pedido como failed_dispense.
    localStorage.setItem(CHECKOUT_PROGRESS_KEY, JSON.stringify({
      orderNumber,
      ml: selectedSize.ml,
      quantity,
      tapId: selectedTapId,
      sizeLabel: selectedSize.label,
      timestamp: Date.now(),
    }));

    try {
      // STEP 2: Gravar venda no sistema (skip if already recorded for this order)
      if (recordedOrderRef.current === orderNumber) {
        console.log('[DrinkMP] Sale already recorded for this order, skipping to dispense');
      } else {
        updateProcessingStage("recording_sale");

        const drinkCartItem: CartItem = {
          product,
          quantity,
          unitPrice: resolvedUnitPrice,
          sizeKey: selectedSize.key,
          sizeLabel: selectedSize.label,
          mlPerUnit: selectedSize.ml,
          ...(currentPricingSnapshot ? { pricingSnapshot: currentPricingSnapshot } : {}),
        };

        await salesService.recordSaleAndUpdateStock(
          [drinkCartItem],
          totalAmount,
          currentCurrency.code,
          orderNumber,
          selectedPayment,
          getCurrentStoreId()
        );
        recordedOrderRef.current = orderNumber;

        console.log('[DrinkMP] Venda registrada com sucesso, estoque atualizado no Firebase');
      }

      // STEP 3: Dispensar bebida (ESP32)
      updateProcessingStage("dispensing");

      // NOTA v4.1.4: Status 'dispensing' é escrito no Firestore com retry automático
      // dentro de esp32ReleaseDrink() (ESP32Context.releaseDrink → updateDispenseStatusWithRetry).
      // Double-write removido aqui para evitar write contention e desperdício de cota Firestore.

      let dispenseSucceeded = false;

      try {
        // Usar o servico unificado via ESP32Context
        console.log('[DrinkMP] Enviando comando de dispensacao via ESP32Context...');
        console.log('[DrinkMP] Status ESP32:', esp32Status.connected ? 'Conectado' : 'Desconectado');
        console.log('[DrinkMP] Torneira selecionada:', selectedTapId);

        const releaseSuccess = await esp32ReleaseDrink(
          orderNumber,
          selectedSize.ml,
          quantity,
          selectedSize.label,
          selectedTapId // Multi-Tap: passar tapId
        );

        if (!releaseSuccess) {
          // Marcar como falha de dispense no Firestore
          await salesService.updateOrderDispenseStatus(orderNumber, 'failed_dispense', getCurrentStoreId())
            .catch(e => console.warn('[DrinkMP] Falha ao atualizar status failed:', e));
          // Persistir localmente para reconciliação (com progresso zero para resume correto)
          await persistFailedDispense(orderNumber, 'command_failed', {
            mlDispensed: 0,
            targetMl: selectedSize.ml,
            cup: 1,
            totalCups: quantity,
            tapId: selectedTapId,
            sizeLabel: selectedSize.label,
          });
          // v4.1.5: Falha persistida no IndexedDB — remover checkpoint localStorage
          localStorage.removeItem(CHECKOUT_PROGRESS_KEY);
          systemLogService.error('dispense', `Dispense command_failed: ${orderNumber}`, { orderNumber, esp32Connected: esp32Status.connected, tapId: selectedTapId, ml: selectedSize.ml, quantity });

          toast({
            title: t('checkout.dispenserWarning'),
            description: esp32Status.connected
              ? t('checkout.dispenserCommandFailed')
              : t('checkout.dispenserNotConnected'),
            variant: "destructive"
          });
        } else {
          console.log('[DrinkMP] Comando de dispensacao enviado com sucesso');
          dispenseSucceeded = true;
          // NOTA: Status será atualizado para 'dispensed' quando ESP32Context
          // receber stage:'completed' de volta do ESP32
        }
      } catch (esp32Error) {
        console.warn("[DrinkMP] ESP32 release failed (non-blocking):", esp32Error);
        systemLogService.error('dispense', `Dispense exception: ${orderNumber}`, { orderNumber, error: esp32Error instanceof Error ? esp32Error.message : String(esp32Error), tapId: selectedTapId });
        // Marcar como falha de dispense no Firestore
        await salesService.updateOrderDispenseStatus(orderNumber, 'failed_dispense', getCurrentStoreId())
          .catch(e => console.warn('[DrinkMP] Falha ao atualizar status failed:', e));
        await persistFailedDispense(orderNumber, 'exception', {
          mlDispensed: 0,
          targetMl: selectedSize.ml,
          cup: 1,
          totalCups: quantity,
          tapId: selectedTapId,
          sizeLabel: selectedSize.label,
        });
        // v4.1.5: Falha persistida no IndexedDB — remover checkpoint localStorage
        localStorage.removeItem(CHECKOUT_PROGRESS_KEY);

        toast({
          title: t('checkout.dispenserWarning'),
          description: t('checkout.dispenserNotAvailable'),
        });
      }

      // STEP 4: Complete the order — ONLY if dispense succeeded (KIO-02 fix)
      if (dispenseSucceeded) {
        updateProcessingStage("ready_pickup");

        const enrichData = lastEnrichDataRef.current;
        onComplete({
          orderNumber,
          drinkData: {
            product,
            sizeKey: selectedSize.key,
            sizeLabel: selectedSize.label,
            mlPerUnit: selectedSize.ml,
            price: resolvedUnitPrice,
            quantity,
            totalAmount,
          },
          enrichData: enrichData ? {
            customerName: enrichData.customerName,
            customerIdentification: enrichData.customerIdentification,
            payerId: enrichData.payerId,
            cardFirstDigits: enrichData.cardFirstDigits,
            cardLastDigits: enrichData.cardLastDigits,
          } : null,
          storeId: getCurrentStoreId() || undefined,
        });

        // v4.1.5: Pagamento+dispense concluídos com sucesso — removendo checkpoint de crash
        localStorage.removeItem(CHECKOUT_PROGRESS_KEY);

        // Limpar timeout de emergência
        if (emergencyTimeoutRef.current) {
          clearTimeout(emergencyTimeoutRef.current);
          emergencyTimeoutRef.current = null;
        }

        setTimerActive(false);
        setIsProcessing(false);
        updateProcessingStage("complete");
        setTimeout(() => {
          onCancel();
        }, 1500);
      } else {
        // KIO-02: Dispense falhou — NÃO chamar onComplete.
        // Entrar em estado "dispense_failed" para o cliente ver opções.
        console.warn(`[DrinkMP] Dispense failed for order ${orderNumber}. Blocking onComplete.`);
        updateProcessingStage("dispense_failed");
        setTimerActive(false);
        // NÃO chamar setIsProcessing(false) — manter no step 3 com UI de falha
      }
    } catch (error) {
      console.error("Error in finishPaymentFlow:", error);
      systemLogService.error('payment', `Erro pós-pagamento: ${(error as Error)?.message}`, { orderNumber, saleRecorded: saleRecordedRef.current });
      // 🔧 FIX Bug #25: Cancelar emergencyTimeout no catch — sem isso, se processingStage ainda
      // for 'awaiting_payment' quando a exceção ocorrer, o timer dispararia e chamaria
      // handleCancelPayment sobre um fluxo já resetado, causando navegação dupla.
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }
      // If sale was already recorded, persist failure for recovery/compensation
      if (saleRecordedRef.current && orderNumber) {
        await persistFailedDispense(orderNumber, 'flow_exception').catch(() => {});
        // v4.1.5: Falha persistida no IndexedDB — remover checkpoint localStorage
        localStorage.removeItem(CHECKOUT_PROGRESS_KEY);
        // 🔧 FIX Audit-R2: NÃO resetar flags se a venda já foi persistida no Firestore.
        // Resetar causaria dupla gravação de venda no retry (double-decrement de estoque).
        // O guard recordedOrderRef garante que o retry pule direto para dispense.
      } else {
        // Só resetar se a venda NÃO foi gravada com sucesso
        saleRecordedRef.current = false;
        recordedOrderRef.current = null;
      }
      toast({
        title: t('common.error'),
        description: (error as Error)?.message || t('checkout.processOrderError'),
        variant: "destructive",
      });
      updateProcessingStage("idle");
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(2);
      setIsProcessing(false);
    }
  };

  // ── PlugPag: Pagamento card-present via terminal Bluetooth ────────────
  const handleStartPlugPagPayment = async (orderNumber: string, totalAmount: number) => {
    orderNumberRef.current = orderNumber;
    // Salvar referência para retry (o pedido já foi criado — não precisa recriar)
    plugpagLastOrderRef.current = orderNumber;
    plugpagLastAmountRef.current = totalAmount;

    try {
      const paymentType = selectedPayment === 'credit_card' ? 'credit' : 'debit';

      const response = await plugpagPaymentService.startPayment({
        amountCents: Math.round(totalAmount * 100),
        type: paymentType as 'credit' | 'debit',
        installments: 1,
        orderId: orderNumber,
      });

      if (response.success && response.result) {
        // Sucesso — resetar contador de retry
        plugpagRetryCountRef.current = 0;
        updateProcessingStage("payment_approved");

        // Enriquecer order com dados do terminal
        const plugpagEnrichData: OrderCustomerData = {
          gatewayProvider: 'pagbank',
          gatewayPaymentId: response.result.transactionCode || undefined,
          cardBrand: response.result.cardBrand || undefined,
          cardLastDigits: response.result.cardLast4 || undefined,
          customerName: response.result.holderName
            ? response.result.holderName.substring(0, 3) + '***'
            : undefined,
        };
        lastEnrichDataRef.current = plugpagEnrichData;

        const storeId = getCurrentStoreId();
        if (storeId) {
          salesService.enrichOrderWithCustomerData(orderNumber, plugpagEnrichData, storeId)
            .catch(e => console.warn('[DrinkPlugPag] Enrich failed (non-blocking):', e));
        }

        toast({
          title: t('checkout.paymentApprovedToast') || 'Pagamento aprovado!',
          description: `${response.result.cardBrand || ''} ****${response.result.cardLast4 || ''}`,
        });

        try {
          await finishPaymentFlow(orderNumber);
        } catch (error) {
          console.error('[DrinkPlugPag] finishPaymentFlow failed:', error);
          systemLogService.error('payment', `PlugPag pós-pagamento falhou: ${(error as Error)?.message}`, { orderNumber });
          await persistFailedDispense(orderNumber, 'post_payment_flow_error').catch(() => {});
          toast({
            title: t('common.error'),
            description: t('checkout.processOrderError'),
            variant: 'destructive',
          });
        }
      } else {
        // Pagamento negado ou erro
        const errorMsg = response.error || 'Pagamento não aprovado no terminal';
        const errorCode = (response as any).errorCode;

        // AUTH_REQUIRED: não contar como retry — precisa autenticação PagBank
        // Manter processingStage="awaiting_payment" para o bloco de UI com botão
        // "Autenticar PagBank" continuar visível
        if (errorCode === 'AUTH_REQUIRED') {
          systemLogService.warn('payment', `PlugPag AUTH_REQUIRED: ${errorMsg}`, { orderNumber });
          setPagbankError(errorMsg);
          setIsProcessing(false);
          return;
        }

        // Pagamento negado ou erro — NÃO voltar ao step 2, manter na tela de pagamento.
        // O botão "Tentar Novamente" no UI re-invoca handleRetryPlugPagPayment.
        plugpagRetryCountRef.current += 1;
        const retryInfo = plugpagRetryCountRef.current < MAX_PLUGPAG_RETRIES
          ? ` (tentativa ${plugpagRetryCountRef.current}/${MAX_PLUGPAG_RETRIES})`
          : '';
        systemLogService.warn('payment', `PlugPag negado: ${errorMsg}${retryInfo}`, { orderNumber, retry: plugpagRetryCountRef.current });
        setPagbankError(errorMsg);
        setIsProcessing(false);
        updateProcessingStage("idle");

        // Se esgotou retries, voltar ao step 2 (forçar recomeço)
        if (plugpagRetryCountRef.current >= MAX_PLUGPAG_RETRIES) {
          plugpagRetryCountRef.current = 0;
          toast({
            title: 'Pagamento falhou',
            description: `${MAX_PLUGPAG_RETRIES} tentativas esgotadas. Selecione o método de pagamento novamente.`,
            variant: 'destructive',
          });
          moveToStep(2);
        } else {
          toast({
            title: 'Pagamento não aprovado',
            description: errorMsg,
            variant: 'destructive',
          });
          // Ficar no step 3 — UI mostra erro com botão "Tentar Novamente"
        }
      }
    } catch (error: any) {
      console.error('[DrinkPlugPag] Erro no pagamento:', error);
      plugpagRetryCountRef.current += 1;
      systemLogService.error('payment', `PlugPag erro: ${error?.message}`, { orderNumber, retry: plugpagRetryCountRef.current });
      setPagbankError(error?.message || 'Erro no terminal');
      setIsProcessing(false);
      updateProcessingStage("idle");

      if (plugpagRetryCountRef.current >= MAX_PLUGPAG_RETRIES) {
        plugpagRetryCountRef.current = 0;
        toast({
          title: t('checkout.paymentError') || 'Erro no Pagamento',
          description: `${MAX_PLUGPAG_RETRIES} tentativas esgotadas.`,
          variant: 'destructive',
        });
        moveToStep(2);
      } else {
        toast({
          title: t('checkout.paymentError') || 'Erro no Pagamento',
          description: error?.message || 'Erro ao processar no terminal',
          variant: 'destructive',
        });
      }
    }
  };

  const handleAuthenticatePlugPag = async () => {
    setPagbankError(null);
    const result = await plugpagPaymentService.authenticateInteractive();
    if (!result.success) {
      toast({
        title: 'Autenticação PagBank não concluída',
        description: result.error || 'Não foi possível autenticar a conta PagBank.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'PagBank autenticado!', description: 'Pronto para processar pagamentos.' });

    // Se há um pagamento pendente, retomar automaticamente
    const orderNumber = plugpagLastOrderRef.current;
    const totalAmount = plugpagLastAmountRef.current;
    if (orderNumber && totalAmount) {
      setIsProcessing(true);
      updateProcessingStage("awaiting_payment");
      await handleStartPlugPagPayment(orderNumber, totalAmount);
    }
  };

  const handleForceActivatePlugPag = async () => {
    const plugpagConfig = gatewayConfig?.providers?.pagbank?.plugpag;
    const code = plugpagConfig?.activationCode;
    if (!code) {
      toast({
        title: 'Código não configurado',
        description: 'Configure o código de ativação no painel admin.',
        variant: 'destructive',
      });
      return;
    }

    setPagbankError(null);
    const result = await plugpagPaymentService.forceActivate(code);
    if (!result.success) {
      toast({
        title: 'Ativação falhou',
        description: result.error || 'Não foi possível ativar com o código fornecido.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Terminal ativado!', description: 'Pronto para processar pagamentos.' });

    const orderNumber = plugpagLastOrderRef.current;
    const totalAmount = plugpagLastAmountRef.current;
    if (orderNumber && totalAmount) {
      setIsProcessing(true);
      updateProcessingStage("awaiting_payment");
      await handleStartPlugPagPayment(orderNumber, totalAmount);
    }
  };

  /**
   * Retry PlugPag payment — re-invoca startPayment com o mesmo orderNumber/amount.
   * Não cria novo pedido — usa o existente. Terminal já está conectado.
   */
  const handleRetryPlugPagPayment = async () => {
    const orderNumber = plugpagLastOrderRef.current;
    const totalAmount = plugpagLastAmountRef.current;
    if (!orderNumber || !totalAmount) {
      console.error('[DrinkPlugPag] Retry impossível — sem orderNumber/totalAmount');
      moveToStep(2);
      return;
    }
    setPagbankError(null);
    setIsProcessing(true);
    updateProcessingStage("awaiting_payment");
    await handleStartPlugPagPayment(orderNumber, totalAmount);
  };

  const handleStartPagBankPayment = async (orderNumber: string, totalAmount: number) => {
    setPagbankError(null);

    const storeId = getCurrentStoreId();
    const franchiseId = getCurrentFranchiseId();

    if (!storeId || !franchiseId) {
      toast({
        title: t('checkout.paymentError') || 'Erro no Pagamento',
        description: 'storeId/franchiseId ausente para criar pagamento.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      updateProcessingStage("idle");
      moveToStep(2);
      return;
    }

    const customerName = payerName.trim();
    const customerTaxId = payerTaxId.trim();
    const customerEmail = payerEmail.trim();

    // PIX no kiosk: dados do pagador são opcionais — usar anônimo se vazio
    const isPixPayment = selectedPayment === 'pix_qr';

    if (!isPixPayment && (!customerName || !customerTaxId)) {
      toast({
        title: 'Dados obrigatórios',
        description: 'Informe nome e CPF/CNPJ do pagador.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      updateProcessingStage("idle");
      moveToStep(2);
      return;
    }

    // PIX no kiosk: PagBank exige customer mesmo sem identificação do cliente.
    // CPF 529.982.247-25: fictício, matematicamente válido (dígitos verificadores
    // corretos). NÃO é CPF de nenhuma pessoa real — padrão de documentações técnicas BR.
    const customer = isPixPayment
      ? { name: 'Cliente Kiosk', taxId: '52998224725' }
      : {
          name: customerName,
          taxId: customerTaxId,
          email: customerEmail || undefined,
        };

    let card: CreatePaymentInput['card'] | undefined;
    if (selectedPayment !== "pix_qr") {
      const cleanCardNumber = cardNumber.replace(/\D/g, '');
      const cleanExpMonth = cardExpMonth.replace(/\D/g, '');
      const cleanExpYear = cardExpYear.replace(/\D/g, '');
      const cleanCvv = cardCvv.replace(/\D/g, '');

      if (!cleanCardNumber || !cleanExpMonth || !cleanExpYear || !cleanCvv) {
        toast({
          title: 'Dados do cartão',
          description: 'Preencha número, validade e CVV.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        updateProcessingStage("idle");
        moveToStep(2);
        return;
      }

      // Phase 0: Encrypt card data client-side via PagBank.js SDK
      const pagbankPublicKey = gatewayConfig?.providers?.pagbank?.publicKey;
      if (!pagbankPublicKey) {
        toast({
          title: 'Configuração ausente',
          description: 'PagBank publicKey não configurada. Contate o administrador.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        updateProcessingStage("idle");
        moveToStep(2);
        return;
      }

      try {
        const encrypted = encryptCard(pagbankPublicKey, {
          number: cleanCardNumber,
          expMonth: cleanExpMonth,
          expYear: cleanExpYear,
          securityCode: cleanCvv,
          holderName: customerName,
        });

        card = {
          encrypted,
          holderName: customerName,
          holderTaxId: customerTaxId,
        };
      } catch (encErr) {
        toast({
          title: 'Erro de criptografia',
          description: encErr instanceof Error ? encErr.message : 'Falha ao criptografar dados do cartão.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        updateProcessingStage("idle");
        moveToStep(2);
        return;
      }
    }

    try {
      const input: CreatePaymentInput = {
        franchiseId,
        storeId,
        orderId: orderNumber,
        amount: totalAmount,
        currency: currentCurrency.code,
        method: mapGatewayMethod(selectedPayment),
        items: buildGatewayItems(),
        customer,
        card,
      };

      const response = await paymentService.createPayment(input);

      setPagbankPaymentId(response.paymentId);
      setPagbankStatus(response.status);
      setPagbankQrCodeText(response.pix?.qrCodeText || null);

      // PlugPag PIX dual-display: exibir QR na tela do terminal também
      if (response.pix?.qrCodeText && isPlugPagEnabled) {
        plugpagPaymentService.displayPixQR(response.pix.qrCodeText).catch(e =>
          console.warn('[DrinkPagBank] Falha ao exibir QR no terminal PlugPag:', e)
        );
      }

      orderNumberRef.current = orderNumber;

      if (response.status === 'paid') {
        updateProcessingStage("payment_approved");
        // Enriquecer order com dados do cliente PagBank (fire-and-forget)
        const pagbankEnrichData: OrderCustomerData = {
          customerName: payerName || undefined,
          customerEmail: payerEmail || undefined,
          customerIdentification: payerTaxId || undefined,
          gatewayProvider: 'pagbank',
          gatewayOrderId: response.providerOrderId || undefined,
          gatewayPaymentId: response.paymentId || undefined,
          cardLastDigits: response.cardLast4 || undefined,
        };
        lastEnrichDataRef.current = pagbankEnrichData;
        salesService.enrichOrderWithCustomerData(orderNumber, pagbankEnrichData, storeId).catch(e => console.warn('[DrinkPagBank] Enrich failed (non-blocking):', e));
        try {
          await finishPaymentFlow(orderNumber);
        } catch (error) {
          console.error('[DrinkPagBank] finishPaymentFlow failed after payment:', error);
          systemLogService.error('payment', `PagBank pós-pagamento falhou: ${(error as Error)?.message}`, { orderNumber });
          await persistFailedDispense(orderNumber, 'post_payment_flow_error').catch(() => {});
          toast({
            title: t('common.error'),
            description: t('checkout.processOrderError'),
            variant: 'destructive',
          });
        }
        return;
      }

      cleanupPagBankListener();
      pagbankUnsubscribeRef.current = paymentService.watchPaymentStatus(
        response.paymentId,
        async (payment: PaymentRecord) => {
          setPagbankStatus(payment.status);
          if (payment.pix?.qrCodeText) {
            setPagbankQrCodeText(payment.pix.qrCodeText);
            // PlugPag PIX dual-display
            if (isPlugPagEnabled) {
              plugpagPaymentService.displayPixQR(payment.pix.qrCodeText).catch(() => {});
            }
          }

          if (payment.status === 'paid') {
            // Guard contra duplicação (idêntico ao MP)
            if (saleRecordedRef.current) {
              console.log('[DrinkPagBank] Já processado, ignorando duplicação');
              return;
            }
            saleRecordedRef.current = true;

            // KIO-03: Block delivery if cancel was requested before payment arrived
            if ((payment as any).cancelRequested) {
              console.warn('[DrinkPagBank] Payment arrived after cancel_requested — blocking delivery. Needs refund.');
              toast({
                title: 'Pagamento após cancelamento',
                description: 'O pagamento foi recebido após o cancelamento. Um estorno será processado.',
                variant: 'destructive',
              });
              cleanupPagBankListener();
              setIsProcessing(false);
              updateProcessingStage("idle");
              moveToStep(2);
              return;
            }
            toast({
              title: t('checkout.paymentApprovedToast'),
              description: t('checkout.paymentConfirmedSuccess'),
            });
            cleanupPagBankListener();
            updateProcessingStage("payment_approved");
            // Enriquecer order com dados do cliente PagBank (fire-and-forget)
            const pagbankListenerEnrichData: OrderCustomerData = {
              customerName: payerName || undefined,
              customerEmail: payerEmail || undefined,
              customerIdentification: payerTaxId || undefined,
              gatewayProvider: 'pagbank',
              gatewayOrderId: payment.providerOrderId || undefined,
              gatewayPaymentId: payment.id || undefined,
              cardLastDigits: payment.cardLast4 || undefined,
            };
            lastEnrichDataRef.current = pagbankListenerEnrichData;
            salesService.enrichOrderWithCustomerData(orderNumberRef.current, pagbankListenerEnrichData, storeId).catch(e => console.warn('[DrinkPagBank] Enrich failed (non-blocking):', e));
            try {
              // Guard: se modal foi desmontado e dados limpos, persistir para reconciliação
              if (!product || !selectedSizeKey) {
                console.warn('[DrinkPagBank] Modal desmontado durante pagamento — persistindo para reconciliação');
                systemLogService.warn('payment', 'PagBank pago mas modal desmontado', { orderNumber: orderNumberRef.current });
                await persistFailedDispense(orderNumberRef.current, 'modal_unmounted_during_payment').catch(() => {});
                return;
              }
              await finishPaymentFlow(orderNumberRef.current);
            } catch (error) {
              console.error('[DrinkPagBank] finishPaymentFlow failed in listener:', error);
              systemLogService.error('payment', `PagBank listener pós-pagamento falhou: ${(error as Error)?.message}`, { orderNumber: orderNumberRef.current });
              await persistFailedDispense(orderNumberRef.current, 'post_payment_listener_error').catch(() => {});
            }
          }

          if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
            const statusMessage = payment.status === 'failed'
              ? 'Pagamento recusado'
              : payment.status === 'canceled'
                ? 'Pagamento cancelado'
                : 'Pagamento expirado';

            setPagbankError(statusMessage);
            setIsProcessing(false);
            updateProcessingStage("idle");
            moveToStep(2);
            cleanupPagBankListener();
          }
        },
        {
          storeId,
          franchiseId,
          onError: (error) => {
            console.error('[DrinkPagBank] Erro ao escutar PagBank:', error);
            systemLogService.error('payment', `Erro listener PagBank: ${error?.message}`);
            setPagbankError('Erro ao acompanhar pagamento.');
            setIsProcessing(false);
            updateProcessingStage("idle");
            moveToStep(2);
            // Áudio: erro de pagamento com cooldown 10s
            playGuarded('payment_error', modalScopeId.current, 10_000);
          },
        }
      );
    } catch (error: unknown) {
      console.error('[DrinkPagBank] Erro ao criar pagamento PagBank:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro ao criar pagamento.';
      systemLogService.error('payment', `Erro ao criar pagamento PagBank: ${errorMsg}`);
      setPagbankError(errorMsg);
      setIsProcessing(false);
      updateProcessingStage("idle");
      moveToStep(2);
      toast({
        title: t('checkout.paymentError'),
        description: errorMsg,
        variant: 'destructive',
      });
      // Áudio: erro de pagamento com cooldown 10s
      playGuarded('payment_error', modalScopeId.current, 10_000);
    }
  };

  const handlePaymentComplete = async () => {
    setIsProcessing(true);
    setMaxInactivityTime(300);
    resetInactivityTimer();
    moveToStep(3);
    updateProcessingStage("awaiting_payment");
    setCancelBlocked(false);
    setMpError(null);

    // ── Áudio: prompt de pagamento (por tentativa) ────────────────────────
    paymentAttemptRef.current += 1;
    const attemptScope = `${modalScopeId.current}-attempt-${paymentAttemptRef.current}`;
    if (selectedPayment === 'pix_qr') {
      playGuarded('pix_scan', attemptScope);
    } else {
      playGuarded('card_terminal', attemptScope);
    }
    // processing_payment toca em recording_sale (quando o sistema de fato confirma)

    // Timeout de emergência inteligente:
    // - Se at_terminal: NÃO cancelar (409), apenas avisar e deixar expirar naturalmente
    // - Se idle/sending: cancelar normalmente
    if (emergencyTimeoutRef.current) {
      clearTimeout(emergencyTimeoutRef.current);
    }
    const timeoutMs = (flowState.paymentTimeoutSeconds ?? 130) * 1000;
    emergencyTimeoutRef.current = setTimeout(() => {
      if (processingStageRef.current === "awaiting_payment") {
        const isAtTerminal = pointStatus === 'at_terminal' || pointStatus === 'card_processing' || cancelBlocked;
        systemLogService.warn('payment', `Emergency timeout: ${isAtTerminal ? 'at_terminal - aguardando expiração' : 'cancelando'}`, { orderNumber: orderNumberRef.current, pointStatus });
        
        if (isAtTerminal) {
          // Não tentar cancelar — terminal vai expirar sozinho (PT2M)
          // Mostrar aviso mas manter listener ativo
          toast({
            title: 'Tempo quase esgotado',
            description: 'Finalize o pagamento na maquininha ou aguarde expiração automática.',
            variant: "destructive",
          });
        } else {
          handleCancelPayment();
          toast({
            title: t('checkout.timeout'),
            description: t('checkout.paymentNotConfirmedTime'),
            variant: "destructive",
          });
        }
      }
    }, timeoutMs);

    try {
      if (!product || !selectedSize) {
        throw new Error("Invalid product or size");
      }
      if (selectedSize.ml <= 0) {
        throw new Error("Invalid size configuration");
      }
      if (quantity <= 0 || maxQty <= 0) {
        throw new Error("Quantity unavailable for this size");
      }

      const newOrderNumber = await salesService.generateOrderNumber();
      const subtotal = Math.round(resolvedUnitPrice * quantity * 100) / 100;
      const taxRate = (storeSettings?.taxPercentage || 0) / 100;
      const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      // STEP 1: Processar pagamento
      if (isPagBank) {
        // PlugPag: cartão via terminal físico Bluetooth
        if (usePlugPagForCard) {
          await handleStartPlugPagPayment(newOrderNumber, totalAmount);
          return;
        }
        // PagBank online (PIX ou cartão via API REST)
        await handleStartPagBankPayment(newOrderNumber, totalAmount);
        return;
      }

      // Guard: se provider é 'none' sem env vars de MercadoPago, log warning
      if (provider === 'none') {
        console.warn('[DrinkCheckout] ⚠️ provider=none — usando MercadoPago via env vars como fallback');
      }

      if (selectedPayment === "pix_qr") {
        // Usar Mercado Pago QR via Cloud Function (backend)
        try {
          const cfItems = [{
            name: `${product.title} - ${selectedSize.label}`,
            quantity: quantity,
            unitAmount: resolvedUnitPrice,
          }];

          console.log('[DrinkQR] Criando QR Order via CF:', {
            amount: totalAmount,
            items: cfItems.length,
            tapId: selectedTapId,
          });

          const result = await paymentService.processMercadoPagoQRBackend(
            totalAmount,
            cfItems,
            undefined,
            { tapId: selectedTapId != null ? String(selectedTapId) : undefined }
          );

          console.log('[DrinkQR] QR Order criada via CF:', { paymentId: result.transactionId, orderId: result.orderId });

          setMpOrderId(result.orderId || null);
          mpOrderIdRef.current = result.orderId || null;
          setMpQrData(result.qrData || null);
          setCurrentTransactionId(result.transactionId || null);
          currentTransactionIdRef.current = result.transactionId || null;
          
          // Salvar orderNumber para uso no callback do listener
          orderNumberRef.current = newOrderNumber;
          
          // Iniciar listener de status via Firestore onSnapshot
          if (!result.transactionId) {
            throw new Error('Cloud Function did not return paymentId');
          }
          startListening(result.transactionId);

        } catch (error: unknown) {
          console.error('[DrinkQR] Erro ao criar QR:', error);
          const errorMsg = error instanceof Error ? error.message : t('checkout.errorGeneratingQr');
          systemLogService.error('payment', `Erro ao criar QR Code: ${errorMsg}`, { orderNumber: orderNumberRef.current, amount: totalAmount });
          setMpError(errorMsg);
          setIsProcessing(false);
          updateProcessingStage("idle");
          moveToStep(2);
          toast({
            title: t('checkout.paymentError'),
            description: errorMsg,
            variant: "destructive"
          });
        }
      } else if (selectedPayment === "credit_card" || selectedPayment === "debit_card") {
        // Pagamento via Mercado Pago Point (Terminal físico) via Cloud Function
        
        try {
          setPointStatus('sending');

          const cfItems = [{
            name: `${product.title} - ${selectedSize.label}`,
            quantity: quantity,
            unitAmount: resolvedUnitPrice,
          }];

          console.log('[DrinkPoint] Criando Point Order via CF:', {
            amount: totalAmount,
            items: cfItems.length,
            tapId: selectedTapId,
          });

          const pointMethod = selectedPayment === 'credit_card' ? 'credit' : 'debit';
          const result = await paymentService.processMercadoPagoPointBackend(
            totalAmount,
            cfItems,
            undefined,
            { tapId: selectedTapId != null ? String(selectedTapId) : undefined, method: pointMethod as 'credit' | 'debit' }
          );

          console.log('[DrinkPoint] Point Order criada via CF:', { paymentId: result.transactionId, orderId: result.orderId });

          setMpOrderId(result.orderId || null);
          mpOrderIdRef.current = result.orderId || null;
          setCurrentTransactionId(result.transactionId || null);
          currentTransactionIdRef.current = result.transactionId || null;
          setPointStatus('at_terminal');
          setCancelBlocked(true); // Ordem enviada ao terminal — cancel via API não funciona
          
          // Salvar orderNumber para uso no callback do listener
          orderNumberRef.current = newOrderNumber;
          
          // Iniciar listener de status via Firestore onSnapshot
          if (!result.transactionId) {
            throw new Error('Cloud Function did not return paymentId');
          }
          startListening(result.transactionId);

        } catch (error: unknown) {
          console.error('[DrinkPoint] Erro ao criar order Point:', error);
          const errorMsg = error instanceof Error ? error.message : 'Erro ao enviar para terminal';
          systemLogService.error('payment', `Erro Point terminal: ${errorMsg}`, { orderNumber: orderNumberRef.current, terminalId: resolvedConfig.terminalId });
          setMpError(errorMsg);
          setPointStatus('error');
          setIsProcessing(false);
          updateProcessingStage("idle");
          moveToStep(2);
          toast({
            title: t('checkout.terminalErrorMsg'),
            description: errorMsg,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }
      console.error("Payment error:", error);
      systemLogService.error('payment', `Erro genérico payment: ${(error as Error)?.message}`);
      toast({
        title: t('common.error'),
        description: (error as Error)?.message || t('checkout.paymentFailedGeneric'),
        variant: "destructive",
      });
      updateProcessingStage("idle");
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(2);
      setIsProcessing(false);
    }
  };

  // Calcular total para exibição
  const calculateTotal = () => {
    if (!selectedSize) return 0;
    const subtotal = resolvedUnitPrice * quantity;
    const tax = subtotal * (storeSettings?.taxPercentage || 0) / 100;
    return subtotal + tax;
  };

  // Garantir que este modal só opere para produtos de bebida
  if (!product || !product.isDrink) return null;

  // Tela de verificação de idade (antes do fluxo de checkout)
  if (!ageVerified) {
    return (
      <Dialog open={isOpen} onOpenChange={onCancel}>
        <DialogContent className="w-full sm:max-w-md" aria-describedby="age-verification-description">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('ageVerification.title')}</DialogTitle>
            <DialogDescription id="age-verification-description">
              {t('ageVerification.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center text-center space-y-6 py-4">
            {/* Ícone de alerta */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-amber-600" />
            </div>
            
            {/* Título e pergunta */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">
                {t('ageVerification.title')}
              </h2>
              <p className="text-xl font-semibold text-amber-600">
                {t('ageVerification.question')}
              </p>
            </div>
            
            {/* Descrição */}
            <p className="text-gray-600 text-sm px-4">
              {t('ageVerification.description')}
            </p>
            
            {/* Botões */}
            <div className="flex flex-col w-full gap-3 pt-2">
              <Button
                onClick={() => setAgeVerified(true)}
                className="w-full h-14 text-lg font-semibold bg-green-600 hover:bg-green-700"
              >
                <Check className="w-5 h-5 mr-2" />
                {t('ageVerification.confirmYes')}
              </Button>
              <Button
                onClick={onCancel}
                variant="outline"
                className="w-full h-12 text-base font-medium border-gray-300 hover:bg-gray-50"
              >
                {t('ageVerification.confirmNo')}
              </Button>
            </div>
            
            {/* Aviso legal */}
            <p className="text-xs text-gray-400 px-4 pt-2">
              {t('ageVerification.legalNotice')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && flowState.currentStep < 2) onCancel(); }}>
      <DialogContent
        className="w-[95vw] sm:max-w-md md:max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden p-4 sm:p-6"
        onInteractOutside={(e) => { if (flowState.currentStep >= 2) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (flowState.currentStep >= 2) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>
            {flowState.currentStep === 1 && t('checkout.chooseSize')}
            {flowState.currentStep === 2 && t('checkout.finishOrder')}
            {flowState.currentStep === 3 && t('checkout.processingOrder')}
          </DialogTitle>
          <DialogDescription>
            {flowState.currentStep === 1 && t('checkout.selectSizeQuantity')}
            {flowState.currentStep === 2 && t('checkout.reviewOrderPayment')}
            {flowState.currentStep === 3 && t('checkout.waitProcessing')}
          </DialogDescription>
          <StepperIndicator
            currentStep={flowState.currentStep > 2 ? 3 : flowState.currentStep}
            completedSteps={flowState.completedSteps}
            steps={[
              { label: t('checkout.sizeLabel'), description: t('checkout.selectionLabel') },
              { label: t('checkout.paymentLabel'), description: t('checkout.finishLabel') },
              { label: t('checkout.readyLabel'), description: t('checkout.waitLabel') },
            ]}
          />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <InactivityTimer
            secondsLeft={flowState.inactivityTimeLeft}
            maxSeconds={flowState.maxInactivityTime}
            variant={flowState.timerVariant}
          />

          <TimeoutWarning
            isOpen={flowState.isInactivityWarning}
            secondsLeft={flowState.inactivityTimeLeft}
            action={t('checkout.checkoutCancelled')}
            onExtend={() => flowActions.extendInactivityTimeout(60)}
            onProceed={() => flowActions.extendInactivityTimeout(1)}
          />

          {flowState.currentStep === 1 && (
            <>
              {/* Seleção de Tamanho com Cards */}
              <div>
                <Label className="block text-sm font-medium mb-3">
                  {t('checkout.selectCupSize')}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {product.sizes?.map((size) => {
                    const isSelected = selectedSizeKey === size.key;
                    return (
                      <button
                        key={size.key}
                        type="button"
                        onClick={() => { flowActions.resetInactivityTimer(); setSelectedSizeKey(size.key); }}
                        className={`relative p-4 rounded-xl border-2 transition-all touch-manipulation active:scale-95 ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="text-center">
                          <p className={`text-xl font-bold ${isSelected ? 'text-blue-600' : 'text-gray-800'}`}>
                            {size.ml}ml
                          </p>
                          <p className="text-sm text-gray-500 mt-1">{size.label}</p>
                          <p className={`text-lg font-semibold mt-2 ${isSelected ? 'text-blue-600' : 'text-green-600'}`}>
                            {currentCurrency.symbol}{size.price.toFixed(2)}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantidade - Layout Compacto */}
              {selectedSize && (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <span className="text-sm font-medium text-gray-700">{t('common.quantity')}:</span>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { flowActions.resetInactivityTimer(); setQuantity(Math.max(1, quantity - 1)); }}
                      disabled={quantity <= 1}
                      className="w-10 h-10 rounded-full p-0 touch-manipulation"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { flowActions.resetInactivityTimer(); setQuantity(Math.min(Math.max(1, quantity + 1), Math.max(0, maxQty))); }}
                      disabled={quantity >= maxQty}
                      className="w-10 h-10 rounded-full p-0 touch-manipulation"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <span className="text-xs text-gray-400">
                    {t('checkout.inStock', { count: maxQty })}
                  </span>
                </div>
              )}

              {/* Subtotal */}
              {selectedSize && (
                <Card className="bg-green-50 border-green-200 p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">{t('checkout.subtotal')}:</span>
                    <div className="flex items-center gap-2">
                      {currentPricingSnapshot && (
                        <span className="text-sm line-through text-gray-400">
                          {currentCurrency.symbol}{(selectedSize.price * quantity).toFixed(2)}
                        </span>
                      )}
                      <span className="text-2xl font-bold text-green-600">
                        {currentCurrency.symbol}{(resolvedUnitPrice * quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {currentPricingSnapshot && (
                    <div className={`flex items-center gap-1.5 mt-2 text-sm ${currentPricingSnapshot.deltaPercent < 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {currentPricingSnapshot.deltaPercent < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                      <span>{currentPricingSnapshot.reason} ({currentPricingSnapshot.deltaPercent > 0 ? '+' : ''}{currentPricingSnapshot.deltaPercent}%)</span>
                    </div>
                  )}
                </Card>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => handleBack(1)} className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={() => handleNext(1)} 
                  className="flex-1" 
                  disabled={maxQty <= 0 || !selectedSizeKey}
                >
                  {t('checkout.continue')}
                </Button>
              </div>
            </>
          )}

          {flowState.currentStep === 2 && selectedSize && !flowState.isProcessing && (
            <>
              {/* Resumo do Pedido */}
              <Card className="bg-blue-50 border-blue-200 p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t('checkout.product')}:</span>
                    <span className="font-medium">{product.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t('common.size')}:</span>
                    <span className="font-medium">{selectedSize.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t('common.quantity')}:</span>
                    <span className="font-medium">{quantity}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-gray-600">
                    <span>{t('checkout.subtotal')}:</span>
                    <span>{currentCurrency.symbol}{(resolvedUnitPrice * quantity).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>{t('checkout.taxAmount')} ({storeSettings?.taxPercentage || 0}%):</span>
                    <span>{currentCurrency.symbol}{((resolvedUnitPrice * quantity * (storeSettings?.taxPercentage || 0)) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-1">
                    <span>{t('checkout.totalAmount')}:</span>
                    <span className="text-green-600">
                      {currentCurrency.symbol}{calculateTotal().toFixed(2)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Seleção de Método de Pagamento */}
              <div className="space-y-2">
                <Label className="block font-medium text-sm">{t('checkout.selectPaymentMethod')}</Label>
                
                {/* Alerta se nenhum método está habilitado */}
                {!enabledMethods.pix && !enabledMethods.credit && !enabledMethods.debit && (
                  <Alert variant="destructive" className="mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Pagamentos Indisponíveis</AlertTitle>
                    <AlertDescription>
                      {t('admin.noPaymentMethodsEnabled')}
                    </AlertDescription>
                  </Alert>
                )}
                
                {enabledMethods.pix && (
                  <div
                    className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedPayment === "pix_qr" 
                        ? "border-green-500 bg-green-50" 
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => { flowActions.resetInactivityTimer(); setSelectedPayment("pix_qr"); }}
                  >
                    <QrCode className={`w-6 h-6 ${selectedPayment === "pix_qr" ? "text-green-600" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <p className="font-medium">{t('checkout.pixQrCode')}</p>
                      <p className="text-xs text-gray-500">{t('checkout.qrCodeInstant')}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedPayment === "pix_qr" ? "border-green-500 bg-green-500" : "border-gray-300"
                    }`}>
                      {selectedPayment === "pix_qr" && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                )}

                {enabledMethods.credit && (
                  <div
                    className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedPayment === "credit_card" 
                        ? "border-blue-500 bg-blue-50" 
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => { flowActions.resetInactivityTimer(); setSelectedPayment("credit_card"); }}
                  >
                    <CreditCard className={`w-6 h-6 ${selectedPayment === "credit_card" ? "text-blue-600" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <p className="font-medium">{t('checkout.creditCardLabel')}</p>
                      <p className="text-xs text-gray-500">{t('checkout.visaMasterElo')}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedPayment === "credit_card" ? "border-blue-500 bg-blue-500" : "border-gray-300"
                    }`}>
                      {selectedPayment === "credit_card" && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                )}

                {enabledMethods.debit && (
                  <div
                    className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedPayment === "debit_card" 
                        ? "border-orange-500 bg-orange-50" 
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => { flowActions.resetInactivityTimer(); setSelectedPayment("debit_card"); }}
                  >
                    <CreditCard className={`w-6 h-6 ${selectedPayment === "debit_card" ? "text-orange-600" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <p className="font-medium">{t('checkout.debitCardLabel')}</p>
                      <p className="text-xs text-gray-500">{t('checkout.debitCardInstant')}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedPayment === "debit_card" ? "border-orange-500 bg-orange-500" : "border-gray-300"
                    }`}>
                      {selectedPayment === "debit_card" && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                )}
              </div>

              {/* PlugPag hint: pagamento será feito no terminal */}
              {usePlugPagForCard && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Smartphone className="h-8 w-8 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900">Pagamento na maquininha</p>
                    <p className="text-sm text-blue-700">
                      Insira ou aproxime o cartão no terminal ao clicar em pagar.
                    </p>
                  </div>
                </div>
              )}

              {isPagBank && !usePlugPagForCard && selectedPayment !== 'pix_qr' && (
                <Card className="border border-gray-200">
                  <div className="p-4 space-y-4">
                    <h3 className="font-medium">Dados do pagador</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Nome</Label>
                        <Input
                          value={payerName}
                          onChange={(e) => setPayerName(e.target.value)}
                          placeholder="Nome completo"
                        />
                      </div>
                      <div>
                        <Label>CPF/CNPJ</Label>
                        <Input
                          value={payerTaxId}
                          onChange={(e) => setPayerTaxId(e.target.value)}
                          placeholder="Somente números"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Email (opcional)</Label>
                        <Input
                          type="email"
                          value={payerEmail}
                          onChange={(e) => setPayerEmail(e.target.value)}
                          placeholder="email@exemplo.com"
                        />
                      </div>
                    </div>

                    <>
                        <Separator />
                        <h3 className="font-medium">Dados do cartão</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <Label>Número do cartão</Label>
                            <Input
                              value={cardNumber}
                              onChange={(e) => setCardNumber(e.target.value)}
                              placeholder="0000 0000 0000 0000"
                            />
                          </div>
                          <div>
                            <Label>Mês</Label>
                            <Input
                              value={cardExpMonth}
                              onChange={(e) => setCardExpMonth(e.target.value)}
                              placeholder="MM"
                            />
                          </div>
                          <div>
                            <Label>Ano</Label>
                            <Input
                              value={cardExpYear}
                              onChange={(e) => setCardExpYear(e.target.value)}
                              placeholder="AAAA"
                            />
                          </div>
                          <div>
                            <Label>CVV</Label>
                            <Input
                              value={cardCvv}
                              onChange={(e) => setCardCvv(e.target.value)}
                              placeholder="CVV"
                            />
                          </div>
                        </div>
                    </>
                  </div>
                </Card>
              )}

              {/* Botões de Ação */}
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => handleBack(2)} 
                  className="flex-1 h-14 text-base touch-manipulation"
                >
                  {t('checkout.backButton')}
                </Button>
                <Button 
                  onClick={handleStartPayment} 
                  disabled={!enabledMethods.pix && !enabledMethods.credit && !enabledMethods.debit}
                  className="flex-1 h-14 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-lg touch-manipulation transition-colors disabled:opacity-50"
                >
                  {t('checkout.pay')} {currentCurrency.symbol}{calculateTotal().toFixed(2)}
                </Button>
              </div>
            </>
          )}

          {(flowState.currentStep === 3 || flowState.isProcessing) && (
            <div className="flex flex-col items-center justify-center gap-4 py-8 w-full">
              <ProcessingProgress stage={flowState.processingStage} steps={processingSteps} />

              {flowState.processingStage === "awaiting_payment" && (
                <>
                  {selectedPayment === "pix_qr" && (
                    isPagBank ? (
                      <div className="text-center space-y-4">
                        {pagbankError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-red-700 font-medium">{t('checkout.paymentErrorGeneric')}</p>
                            <p className="text-red-600 text-sm mt-1">{pagbankError}</p>
                            <Button
                              variant="outline"
                              onClick={handleCancelPayment}
                              className="mt-4"
                            >
                              {t('checkout.tryAgain')}
                            </Button>
                          </div>
                        )}

                        {pagbankQrCodeText && !pagbankError && (
                          <>
                            <div className="bg-white p-4 rounded-xl border-2 border-green-400 shadow-lg inline-block">
                              <QRCode value={pagbankQrCodeText} size={180} level="M" />
                            </div>
                            <p className="font-semibold text-base text-gray-800">{t('checkout.scanQrCode')}</p>
                            <p className="text-xs text-gray-500">{t('checkout.payWithQrCode')}</p>

                            {pagbankStatus && (
                              <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 rounded-full px-3 py-1.5">
                                <Loader className="w-3 h-3 animate-spin" />
                                <span className="text-xs font-medium">
                                  Status: {pagbankStatus}
                                </span>
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              onClick={handleCancelPayment}
                              className="mt-2 text-gray-500 hover:text-gray-700 text-sm"
                            >
                              {t('checkout.cancelPayment')}
                            </Button>
                          </>
                        )}

                        {!pagbankQrCodeText && !pagbankError && (
                          <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-gray-600">{t('checkout.generatingQr')}</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        {/* Erro do Mercado Pago */}
                        {mpError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-red-700 font-medium">{t('checkout.paymentErrorGeneric')}</p>
                            <p className="text-red-600 text-sm mt-1">{mpError}</p>
                            <Button 
                              variant="outline" 
                              onClick={handleCancelPayment}
                              className="mt-4"
                            >
                              {t('checkout.tryAgain')}
                            </Button>
                          </div>
                        )}

                        {/* QR Code real do Mercado Pago */}
                        {mpQrData && !mpError && (
                          <>
                            <div className="bg-white p-4 rounded-xl border-2 border-green-400 shadow-lg inline-block">
                              <QRCode value={mpQrData} size={180} level="M" />
                            </div>
                            <p className="font-semibold text-base text-gray-800">{t('checkout.scanQrCode')}</p>
                            <p className="text-xs text-gray-500">{t('checkout.payWithQrCode')}</p>
                            
                            {isPolling && (
                              <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 rounded-full px-3 py-1.5">
                                <Loader className="w-3 h-3 animate-spin" />
                                <span className="text-xs font-medium">
                                  {t('checkout.verifyingPayment')}
                                </span>
                              </div>
                            )}

                            <Button 
                              variant="ghost" 
                              onClick={handleCancelPayment}
                              className="mt-2 text-gray-500 hover:text-gray-700 text-sm"
                            >
                              {t('checkout.cancelPayment')}
                            </Button>
                          </>
                        )}

                        {/* Carregando QR Code */}
                        {!mpQrData && !mpError && (
                          <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-gray-600">{t('checkout.generatingQr')}</p>
                          </>
                        )}
                      </div>
                    )
                  )}

                  {(selectedPayment === "credit_card" || selectedPayment === "debit_card") && (
                    usePlugPagForCard ? (
                      /* PlugPag: Terminal físico Bluetooth */
                      <div className="text-center space-y-4">
                        {pagbankError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-red-700 font-medium">Erro no terminal</p>
                            <p className="text-red-600 text-sm mt-1">{pagbankError}</p>
                            <div className="flex gap-2 justify-center mt-4">
                              {pagbankError.includes('Autenticação PagBank') ? (
                                <Button
                                  variant="default"
                                  onClick={handleAuthenticatePlugPag}
                                >
                                  Autenticar PagBank
                                </Button>
                              ) : (
                                plugpagRetryCountRef.current < MAX_PLUGPAG_RETRIES && (
                                  <Button
                                    variant="default"
                                    onClick={handleRetryPlugPagPayment}
                                  >
                                    Tentar novamente ({MAX_PLUGPAG_RETRIES - plugpagRetryCountRef.current} restante{MAX_PLUGPAG_RETRIES - plugpagRetryCountRef.current !== 1 ? 's' : ''})
                                  </Button>
                                )
                              )}
                              <Button
                                variant="outline"
                                onClick={handleCancelPayment}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}

                        {!pagbankError && (
                          <>
                            <PlugPagTerminalStatus />

                            {plugpagTerminalState === 'authenticating' && (
                              <Button
                                variant="outline"
                                onClick={handleCancelPayment}
                              >
                                Cancelar
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    ) : isPagBank ? (
                      <div className="text-center space-y-4">
                        {pagbankError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-red-700 font-medium">{t('checkout.paymentErrorGeneric')}</p>
                            <p className="text-red-600 text-sm mt-1">{pagbankError}</p>
                            <Button
                              variant="outline"
                              onClick={handleCancelPayment}
                              className="mt-4"
                            >
                              {t('checkout.tryAgain')}
                            </Button>
                          </div>
                        )}

                        {!pagbankError && (
                          <>
                            <CreditCard className={`w-20 h-20 mx-auto animate-pulse ${
                              selectedPayment === "credit_card" ? "text-blue-500" : "text-orange-500"
                            }`} />
                            <p className="font-medium text-gray-700">Processando pagamento no PagBank...</p>
                            {pagbankStatus && (
                              <p className="text-sm text-gray-500">Status: {pagbankStatus}</p>
                            )}
                            <Button
                              variant="ghost"
                              onClick={handleCancelPayment}
                              className="mt-4"
                            >
                              {t('common.cancel')}
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        {/* Erro no terminal */}
                        {(pointStatus === 'error' || mpError) && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-red-700 font-medium">{t('checkout.terminalErrorMsg')}</p>
                            <p className="text-red-600 text-sm mt-1">{mpError || t('checkout.terminalCommError')}</p>
                            <Button 
                              variant="outline" 
                              onClick={handleCancelPayment}
                              className="mt-4"
                            >
                              {t('checkout.tryAgain')}
                            </Button>
                          </div>
                        )}

                        {/* Enviando para o terminal */}
                        {pointStatus === 'sending' && !mpError && (
                          <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-gray-600">{t('checkout.sendingToTerminal')}</p>
                            <p className="text-sm text-gray-500">
                              {selectedPayment === "credit_card" ? t('checkout.creditPayment') : t('checkout.debitPayment')}
                            </p>
                          </>
                        )}

                        {/* Aguardando no terminal — cartão ainda não inserido */}
                        {pointStatus === 'at_terminal' && !mpError && (
                          <>
                            <CreditCard className={`w-20 h-20 mx-auto animate-pulse ${
                              selectedPayment === "credit_card" ? "text-blue-500" : "text-orange-500"
                            }`} />
                            <p className="font-medium text-gray-700">
                              {selectedPayment === "credit_card" 
                                ? t('checkout.insertCreditCard') 
                                : t('checkout.insertDebitCard')
                              }
                            </p>
                            <p className="text-sm text-gray-500">{t('checkout.awaitingTerminal')}</p>
                            
                            {isPolling && (
                              <div className={`flex items-center justify-center gap-2 ${
                                selectedPayment === "credit_card" ? "text-blue-600" : "text-orange-600"
                              }`}>
                                <Clock className="w-4 h-4 animate-pulse" />
                                <span className="text-sm">
                                  {t('checkout.verifyingPayment')}
                                </span>
                              </div>
                            )}

                            <div className={`animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mt-4 ${
                              selectedPayment === "credit_card" ? "border-blue-600" : "border-orange-600"
                            }`}></div>

                            {/* Cancelamento bloqueado quando no terminal */}
                            <p className="text-xs text-gray-400 mt-2">
                              Complete o pagamento na maquininha ou aguarde expiração automática.
                            </p>
                          </>
                        )}

                        {/* Cartão inserido, processando no terminal */}
                        {pointStatus === 'card_processing' && !mpError && (
                          <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
                            <CreditCard className="w-12 h-12 mx-auto text-green-600 mt-2" />
                            <p className="text-gray-700 font-medium">Processando pagamento...</p>
                            <p className="text-sm text-green-600 font-medium">Não remova o cartão</p>
                          </>
                        )}

                        {/* Processando pagamento (status genérico) */}
                        {pointStatus === 'processing' && !mpError && (
                          <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
                            <p className="text-gray-600 font-medium">{t('checkout.processing')}</p>
                            <p className="text-sm text-gray-500">{t('checkout.verifyingPayment')}</p>
                          </>
                        )}

                        {/* Estado inicial/idle - fallback */}
                        {pointStatus === 'idle' && !mpError && (
                          <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="text-gray-600">{t('checkout.processing')}</p>
                          </>
                        )}
                      </div>
                    )
                  )}
                </>
              )}

              {flowState.processingStage === "payment_approved" && (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium text-lg">{t('checkout.paymentApproved')}</p>
                  <p className="text-sm text-gray-500">{t('checkout.processing')}</p>
                </>
              )}

              {flowState.processingStage === "recording_sale" && (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 font-medium">{t('checkout.recordingSale')}</p>
                  <p className="text-sm text-gray-500">{t('checkout.updatingStock')}</p>
                  <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 mt-2">
                    <div className="bg-blue-600 h-2 rounded-full w-1/3 animate-pulse"></div>
                  </div>
                </>
              )}

              {flowState.processingStage === "dispensing" && (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
                  <p className="text-gray-600 font-medium">{t('checkout.dispensing')}</p>
                  <p className="text-sm text-gray-500">{t('checkout.awaitCup')}</p>
                  <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 mt-2">
                    <div className="bg-amber-600 h-2 rounded-full w-2/3 animate-pulse"></div>
                  </div>
                </>
              )}

              {/* KIO-02: UI de falha de dispense — sem sair do modal */}
              {flowState.processingStage === "dispense_failed" && (
                <div className="flex flex-col items-center gap-4 py-4 w-full max-w-sm mx-auto">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="text-red-700 font-semibold text-lg text-center">
                    {t('checkout.dispenserWarning') || 'Falha na entrega'}
                  </p>
                  <p className="text-sm text-gray-600 text-center">
                    Seu pagamento foi confirmado. A bebida não foi liberada.
                    {orderNumberRef.current && (
                      <span className="block mt-1 font-mono text-xs text-gray-400">
                        Pedido: {orderNumberRef.current}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-col gap-3 w-full mt-2">
                    {dispenseRetryCountRef.current < MAX_DISPENSE_RETRIES && (
                      <Button
                        onClick={handleRetryDispense}
                        className="w-full h-14 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-base touch-manipulation"
                      >
                        <RefreshCw className="w-5 h-5 mr-2" />
                        Tentar novamente ({MAX_DISPENSE_RETRIES - dispenseRetryCountRef.current} restante{MAX_DISPENSE_RETRIES - dispenseRetryCountRef.current !== 1 ? 's' : ''})
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        toast({
                          title: 'Suporte notificado',
                          description: `Pedido ${orderNumberRef.current || ''} registrado para atendimento.`,
                          variant: 'default',
                        });
                        // Fechar modal — pedido fica como failed_dispense no Firestore para reconciliação admin
                        setIsProcessing(false);
                        onCancel();
                      }}
                      className="w-full h-14 text-base touch-manipulation"
                    >
                      <PhoneCall className="w-5 h-5 mr-2" />
                      Chamar suporte
                    </Button>
                  </div>
                </div>
              )}

              {flowState.processingStage === "ready_pickup" && (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-bounce">
                    <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium text-lg">{t('checkout.drinkReady')}</p>
                  <p className="text-sm text-gray-500">{t('checkout.positionCup')}</p>
                </>
              )}

              {flowState.processingStage === "complete" && (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium">{t('checkout.paymentConfirmed')}</p>
                  <p className="text-sm text-gray-500">{t('checkout.pickUpDrink')}</p>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DrinkQuickCheckoutModal;
