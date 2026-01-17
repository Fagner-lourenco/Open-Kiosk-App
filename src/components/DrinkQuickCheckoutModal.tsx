import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Minus, Plus, CreditCard, QrCode, Clock, Loader, AlertCircle, Smartphone, Check, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { salesService } from "@/services/salesService";
import { useESP32 } from "@/context/ESP32Context";
import { paymentService } from "@/services/paymentService";
import { CartItem, Product } from "@/types/product";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCheckoutFlow } from "@/hooks/useCheckoutFlow";
import { InactivityTimer, ProcessingProgress, StepperIndicator, TimeoutWarning } from "./checkout/index";
import { MERCADO_PAGO_CONFIG, validateMercadoPagoConfig, POINT_ORDER_STATUS } from "@/config/mercadopago";
import { useMercadoPagoPolling } from "@/hooks/useMercadoPagoPolling";
import type { OrderStatus, PaymentStatus } from "@/types/mercadopago";
import QRCode from "react-qr-code";
import { useTranslation } from "@/i18n";
import { getCurrentStoreId } from "@/services/firebase";

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
  onComplete: (data: { orderNumber: string; drinkData: DrinkCheckoutSelection }) => void;
  onCancel: () => void;
}

const DrinkQuickCheckoutModal = ({ isOpen, product, currentCartItems, onComplete, onCancel }: DrinkQuickCheckoutModalProps) => {
  const [selectedSizeKey, setSelectedSizeKey] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(0);
  const [maxQty, setMaxQty] = useState<number>(0);
  const [selectedPayment, setSelectedPayment] = useState<"pix_qr" | "credit_card" | "debit_card">("pix_qr");
  const [currentTransactionId, setCurrentTransactionId] = useState<string | null>(null);
  
  // Estado de verificação de idade (antes do fluxo de checkout)
  const [ageVerified, setAgeVerified] = useState<boolean>(false);

  // Estados para Mercado Pago QR
  const [mpOrderId, setMpOrderId] = useState<string | null>(null);
  const [mpQrData, setMpQrData] = useState<string | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  
  // Guardar orderNumber para uso no callback do polling
  const orderNumberRef = useRef<string>("");
  
  // Guard contra duplicação de processamento
  const saleRecordedRef = useRef(false);

  // Estados específicos para Mercado Pago Point (Terminal)
  const [pointStatus, setPointStatus] = useState<'idle' | 'sending' | 'at_terminal' | 'processing' | 'error'>('idle');

  const { currentCurrency } = useSettings();
  const { toast } = useToast();
  const { settings: storeSettings } = useStoreSettings();
  const { t } = useTranslation();
  
  // Hook unificado para comunicação ESP32
  const { releaseDrink: esp32ReleaseDrink, status: esp32Status } = useESP32();

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

  // Hook de polling otimizado com persistência e retry
  const {
    isPolling,
    attempts: pollingAttempt,
    maxAttempts: pollingMaxAttempts,
    startPolling,
    stopPolling,
    clearPersistedState,
  } = useMercadoPagoPolling({
    onSuccess: async (order) => {
      console.log('[DrinkMP] Pagamento aprovado via polling hook', { orderId: order.id });
      
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
      
      // Continuar com o fluxo pós-pagamento usando o orderNumber salvo
      await finishPaymentFlow(orderNumberRef.current);
    },
    onError: (errorMsg) => {
      console.error('[DrinkMP] Erro no polling:', errorMsg);
      
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
    },
    onStatusChange: (status: OrderStatus, paymentStatus?: PaymentStatus) => {
      console.log('[DrinkMP] Status changed:', { status, paymentStatus });
      // Para Point: atualizar status visual quando a order chega no terminal
      if (selectedPayment !== 'pix_qr' && status === 'at_terminal') {
        setPointStatus('at_terminal');
      }
    },
    onAttempt: (attempt, maxAttempts) => {
      console.log(`[DrinkMP] Polling tentativa ${attempt}/${maxAttempts}`);
    },
  });
  const emergencyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    processingStageRef.current = flowState.processingStage;
  }, [flowState.processingStage]);

  useEffect(() => {
    return () => {
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }
    };
  }, []);

  const selectedSize = useMemo(() => {
    return product?.sizes?.find((s) => s.key === selectedSizeKey);
  }, [product, selectedSizeKey]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCartItems, product, selectedSizeKey]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedSizeKey("");
      setQuantity(0);
      setMaxQty(0);
      setSelectedPayment("pix_qr");
      setCurrentTransactionId(null);
      flowCancel();
      setTimerActive(false);
      updateProcessingStage("idle");
      // Reset Point status
      setPointStatus('idle');
      // Cleanup: Mercado Pago polling via hook
      stopPolling();
      clearPersistedState();
      setMpOrderId(null);
      setMpQrData(null);
      setMpError(null);
      // Reset sale guard
      saleRecordedRef.current = false;
      // Reset verificação de idade
      setAgeVerified(false);
      // Cleanup: cancelar pagamentos pendentes
      if (currentTransactionId) {
        paymentService.cancelPayment(currentTransactionId).catch(console.error);
      }
    }
  }, [isOpen, currentTransactionId, flowCancel, setTimerActive, updateProcessingStage, stopPolling, clearPersistedState]);

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
    
    // Capturar orderId ANTES de limpar estado (evita race condition)
    const orderIdToCancel = mpOrderId;
    const transactionIdToCancel = currentTransactionId;
    
    // Cancelar polling do Mercado Pago via hook
    stopPolling();
    clearPersistedState();
    
    // Reset estados locais
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
    setPointStatus('idle');
    saleRecordedRef.current = false;
    
    // Cancelar ordem remotamente no Mercado Pago (usando valor capturado)
    if (transactionIdToCancel || orderIdToCancel) {
      try {
        const result = await paymentService.cancelPayment(transactionIdToCancel || '', orderIdToCancel ?? undefined);
        
        if (result.canceled) {
          toast({ title: t('checkout.paymentCanceled'), description: t('checkout.operationCancelledByUser') });
        } else if (result.reason === 'at_terminal') {
          // Ordem está no terminal - usuário deve cancelar lá
          toast({ 
            title: t('checkout.paymentCanceled'), 
            description: 'Cancele diretamente no terminal de pagamento.',
            variant: 'default'
          });
        } else if (result.reason === 'already_processed') {
          toast({ 
            title: 'Pagamento já processado', 
            description: 'Este pagamento já foi concluído.',
            variant: 'default'
          });
        }
      } catch (error) {
        console.warn("[DrinkQR] Falha ao cancelar ordem remotamente:", error);
        toast({ title: t('checkout.paymentCanceled'), description: t('checkout.operationCancelledByUser') });
      }
    }
    
    setIsProcessing(false);
    updateProcessingStage("idle");
    setCurrentTransactionId(null);
    setMaxInactivityTime(60);
    resetInactivityTimer();
    moveToStep(2);
  };

  // Função para processar etapas pós-pagamento (venda, dispensing, etc)
  const finishPaymentFlow = async (orderNumber: string) => {
    if (!product || !selectedSize) return;

    const subtotal = selectedSize.price * quantity;
    const taxRate = (storeSettings?.taxPercentage || 0) / 100;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    try {
      // STEP 2: Gravar venda no sistema
      updateProcessingStage("recording_sale");

      const drinkCartItem: CartItem = {
        product,
        quantity,
        unitPrice: selectedSize.price,
        sizeKey: selectedSize.key,
        sizeLabel: selectedSize.label,
        mlPerUnit: selectedSize.ml,
      };

      await salesService.recordSaleAndUpdateStock(
        [drinkCartItem],
        totalAmount,
        currentCurrency.code,
        orderNumber,
        selectedPayment,
        getCurrentStoreId()
      );
      
      console.log('[DrinkMP] ✅ Venda registrada com sucesso, estoque atualizado no Firebase');

      // STEP 3: Dispensar bebida (ESP32)
      updateProcessingStage("dispensing");

      try {
        // Usar o serviço unificado via ESP32Context
        console.log('[DrinkMP] 🍺 Enviando comando de dispensação via ESP32Context...');
        console.log('[DrinkMP] Status ESP32:', esp32Status.connected ? 'Conectado' : 'Desconectado');
        
        const releaseSuccess = await esp32ReleaseDrink(
          orderNumber,
          selectedSize.ml,
          quantity,
          selectedSize.label
        );

        if (!releaseSuccess) {
          toast({ 
            title: t('checkout.dispenserWarning'), 
            description: esp32Status.connected 
              ? t('checkout.dispenserCommandFailed') 
              : t('checkout.dispenserNotConnected'), 
            variant: "destructive" 
          });
        } else {
          console.log('[DrinkMP] ✅ Comando de dispensação enviado com sucesso');
        }
      } catch (esp32Error) {
        console.warn("[DrinkMP] ESP32 release failed (non-blocking):", esp32Error);
        toast({
          title: t('checkout.dispenserWarning'),
          description: t('checkout.dispenserNotAvailable'),
        });
      }

      // STEP 4: Pronto para retirada
      updateProcessingStage("ready_pickup");

      onComplete({
        orderNumber,
        drinkData: {
          product,
          sizeKey: selectedSize.key,
          sizeLabel: selectedSize.label,
          mlPerUnit: selectedSize.ml,
          price: selectedSize.price,
          quantity,
          totalAmount,
        },
      });

      // Limpar timeout de emergência
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }

      // Mostrar sucesso e finalizar
      updateProcessingStage("complete");
      setTimerActive(false);
      setIsProcessing(false);
      setTimeout(() => {
        onCancel();
      }, 1500);
    } catch (error) {
      console.error("Error in finishPaymentFlow:", error);
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

  const handlePaymentComplete = async () => {
    setIsProcessing(true);
    setMaxInactivityTime(300);
    resetInactivityTimer();
    moveToStep(3);
    updateProcessingStage("awaiting_payment");
    setMpError(null);

    // Timeout de emergência: cancela pagamento após ~2 minutos (alinhado com PT2M + margem)
    if (emergencyTimeoutRef.current) {
      clearTimeout(emergencyTimeoutRef.current);
    }
    emergencyTimeoutRef.current = setTimeout(() => {
      if (processingStageRef.current === "awaiting_payment") {
        handleCancelPayment();
        toast({
          title: t('checkout.timeout'),
          description: t('checkout.paymentNotConfirmedTime'),
          variant: "destructive",
        });
      }
    }, (flowState.paymentTimeoutSeconds ?? 130) * 1000);

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
      const subtotal = selectedSize.price * quantity;
      const taxRate = (storeSettings?.taxPercentage || 0) / 100;
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;

      // STEP 1: Processar pagamento
      if (selectedPayment === "pix_qr") {
        // Usar Mercado Pago QR real
        try {
          validateMercadoPagoConfig();

          const mpItems = [{
            title: `${product.title} - ${selectedSize.label}`,
            unit_price: selectedSize.price.toFixed(2),
            quantity: quantity,
            unit_measure: 'unit',
            total_amount: (selectedSize.price * quantity).toFixed(2),
          }];

          const externalRef = `KIOSK-${newOrderNumber}-${Date.now()}`;

          console.log('[DrinkQR] Criando QR Order:', {
            amount: totalAmount,
            items: mpItems.length,
            externalRef,
          });

          const result = await paymentService.processMercadoPagoQR(
            totalAmount,
            mpItems,
            externalRef,
            MERCADO_PAGO_CONFIG.EXTERNAL_POS_ID
          );

          console.log('[DrinkQR] QR Order criada:', { orderId: result.orderId });

          setMpOrderId(result.orderId || null);
          setMpQrData(result.qrData || null);
          setCurrentTransactionId(result.orderId || null);
          
          // Salvar orderNumber para uso no callback do polling
          orderNumberRef.current = newOrderNumber;
          
          // Iniciar polling via hook (QR não é Point)
          startPolling(result.orderId!, false);

        } catch (error: unknown) {
          console.error('[DrinkQR] Erro ao criar QR:', error);
          const errorMsg = error instanceof Error ? error.message : t('checkout.errorGeneratingQr');
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
        // Pagamento via Mercado Pago Point (Terminal físico)
        const paymentType = selectedPayment === "credit_card" ? "credit_card" : "debit_card";
        
        try {
          setPointStatus('sending');

          const mpItems = [{
            title: `${product.title} - ${selectedSize.label}`,
            unit_price: selectedSize.price.toFixed(2),
            quantity: quantity,
            unit_measure: 'unit',
            total_amount: (selectedSize.price * quantity).toFixed(2),
          }];

          const externalRef = `KIOSK-${newOrderNumber}-${Date.now()}`;

          console.log('[DrinkPoint] Criando Point Order:', {
            amount: totalAmount,
            items: mpItems.length,
            externalRef,
            paymentType,
            terminalId: MERCADO_PAGO_CONFIG.TERMINAL_ID || 'auto-detect'
          });

          const result = await paymentService.processMercadoPagoPoint(
            totalAmount,
            mpItems,
            externalRef,
            MERCADO_PAGO_CONFIG.TERMINAL_ID || undefined, // Se não configurado, busca automaticamente
            {
              defaultPaymentType: paymentType, // Pré-seleciona crédito ou débito no terminal
              defaultInstallments: paymentType === "debit_card" ? 1 : undefined, // Débito sempre 1x
            }
          );

          console.log('[DrinkPoint] Point Order criada:', { orderId: result.orderId, paymentType });

          setMpOrderId(result.orderId || null);
          setCurrentTransactionId(result.orderId || null);
          setPointStatus('at_terminal');
          
          // Salvar orderNumber para uso no callback do polling
          orderNumberRef.current = newOrderNumber;
          
          // Iniciar polling via hook (Point = true)
          startPolling(result.orderId!, true);

        } catch (error: unknown) {
          console.error('[DrinkPoint] Erro ao criar order Point:', error);
          const errorMsg = error instanceof Error ? error.message : 'Erro ao enviar para terminal';
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
    const subtotal = selectedSize.price * quantity;
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
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="w-[95vw] sm:max-w-md md:max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden p-4 sm:p-6">
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
                    <span className="text-2xl font-bold text-green-600">
                      {currentCurrency.symbol}{(selectedSize.price * quantity).toFixed(2)}
                    </span>
                  </div>
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
                    <span>{currentCurrency.symbol}{(selectedSize.price * quantity).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>{t('checkout.taxAmount')} ({storeSettings?.taxPercentage || 0}%):</span>
                    <span>{currentCurrency.symbol}{((selectedSize.price * quantity * (storeSettings?.taxPercentage || 0)) / 100).toFixed(2)}</span>
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
              </div>

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
                  className="flex-1 h-14 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-lg touch-manipulation transition-colors"
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
                                {t('checkout.verifyingPayment')} ({pollingAttempt}/{pollingMaxAttempts})
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
                  )}

                  {(selectedPayment === "credit_card" || selectedPayment === "debit_card") && (
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

                      {/* Aguardando no terminal */}
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
                                {t('checkout.verifyingPayment')} ({pollingAttempt}/{pollingMaxAttempts})
                              </span>
                            </div>
                          )}

                          <div className={`animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mt-4 ${
                            selectedPayment === "credit_card" ? "border-blue-600" : "border-orange-600"
                          }`}></div>

                          <Button 
                            variant="ghost" 
                            onClick={handleCancelPayment}
                            className="mt-4"
                          >
                            {t('common.cancel')}
                          </Button>
                        </>
                      )}

                      {/* Processando pagamento */}
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
