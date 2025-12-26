import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus, Plus, CreditCard, QrCode, Clock, Loader, AlertCircle, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { salesService } from "@/services/salesService";
import { esp32Printer } from "@/services/esp32PrinterService";
import { paymentService } from "@/services/paymentService";
import { CartItem, Product } from "@/types/product";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCheckoutFlow } from "@/hooks/useCheckoutFlow";
import { InactivityTimer, ProcessingProgress, StepperIndicator, TimeoutWarning } from "./checkout/index";
import { MERCADO_PAGO_CONFIG, validateMercadoPagoConfig, POINT_ORDER_STATUS } from "@/config/mercadopago";
import QRCode from "react-qr-code";

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

  // Estados para Mercado Pago QR
  const [mpOrderId, setMpOrderId] = useState<string | null>(null);
  const [mpQrData, setMpQrData] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingAttempt, setPollingAttempt] = useState(0);
  const [mpError, setMpError] = useState<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  // Estados específicos para Mercado Pago Point (Terminal)
  const [pointStatus, setPointStatus] = useState<'idle' | 'sending' | 'at_terminal' | 'processing' | 'error'>('idle');

  const { currentCurrency } = useSettings();
  const { toast } = useToast();
  const { settings: storeSettings } = useStoreSettings();

  const { state: flowState, actions: flowActions } = useCheckoutFlow({
    initialTimeoutSeconds: 60,
    paymentTimeoutSeconds: 300,
    warningThresholdSeconds: 10,
    onTimeout: () => {
      toast({ title: "Sessão expirada", description: "Checkout cancelado por inatividade", variant: "destructive" });
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
      { id: "payment", label: "Pagamento", status: statusFor("awaiting_payment") },
      { id: "approved", label: "Aprovado", status: statusFor("payment_approved") },
      { id: "sale", label: "Registrando venda", status: statusFor("recording_sale") },
      { id: "dispense", label: "Dispensando", status: statusFor("dispensing") },
      { id: "ready", label: "Pronto para retirada", status: statusFor("ready_pickup") },
    ];
  }, [flowState.processingStage]);

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
    if (quantity > max) {
      setQuantity(Math.max(1, max));
    }
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
      // Cleanup: Mercado Pago polling
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
        pollAbortRef.current = null;
      }
      setMpOrderId(null);
      setMpQrData(null);
      setIsPolling(false);
      setPollingAttempt(0);
      setMpError(null);
      // Cleanup: cancelar pagamentos pendentes
      if (currentTransactionId) {
        paymentService.cancelPayment(currentTransactionId).catch(console.error);
      }
    }
  }, [isOpen, currentTransactionId, flowCancel, setTimerActive, updateProcessingStage]);

  const handleNext = (fromStep: number) => {
    resetInactivityTimer();
    if (fromStep === 1) {
      if (!product || !selectedSize || !selectedSizeKey || quantity <= 0 || maxQty <= 0) {
        toast({ title: "Erro", description: "Selecione um tamanho e quantidade válidos", variant: "destructive" });
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
      toast({ title: "Erro", description: "Selecione um método de pagamento", variant: "destructive" });
      return;
    }
    if (!selectedSize || selectedSize.ml <= 0) {
      toast({ title: "Erro", description: "Tamanho inválido", variant: "destructive" });
      return;
    }
    if (quantity <= 0 || maxQty <= 0) {
      toast({ title: "Erro", description: "Quantidade indisponível", variant: "destructive" });
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
    // Cancelar polling do Mercado Pago
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
    setIsPolling(false);
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
    setPollingAttempt(0);
    setPointStatus('idle'); // Reset Point status on cancel
    
    if (currentTransactionId) {
      try {
        await paymentService.cancelPayment(currentTransactionId);
        toast({ title: "Pagamento cancelado", description: "Operação cancelada pelo usuário" });
      } catch (error) {
        console.error("Error cancelling payment:", error);
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
        orderNumber
      );

      // STEP 3: Dispensar bebida (ESP32)
      updateProcessingStage("dispensing");

      try {
        const releaseResult = await esp32Printer.releaseDrink(
          {
            orderId: orderNumber,
            sizeLabel: selectedSize.label,
            mlPerUnit: selectedSize.ml,
            quantity,
          },
          storeSettings || undefined
        );

        if (!releaseResult.success) {
          toast({ title: "Warning", description: releaseResult.message, variant: "destructive" });
        }
      } catch (esp32Error) {
        console.warn("ESP32 release failed (non-blocking):", esp32Error);
        toast({
          title: "Warning",
          description: "Drink dispenser may not be available. Please manually remove your drink.",
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
        title: "Error",
        description: (error as Error)?.message || "Failed to complete order",
        variant: "destructive",
      });
      updateProcessingStage("idle");
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(2);
      setIsProcessing(false);
    }
  };

  // Polling para verificar status do pagamento Mercado Pago (QR e Point)
  const startMercadoPagoPolling = (orderId: string, orderNumber: string, isPointPayment: boolean = false) => {
    const MAX_ATTEMPTS = 60; // 5 minutos
    const POLL_INTERVAL = 5000; // 5 segundos

    // Criar AbortController por ciclo de polling
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
    }
    pollAbortRef.current = new AbortController();

    // Usar variável local para evitar problemas de closure com state
    let currentAttempt = 0;

    const poll = async () => {
      currentAttempt++;

      if (currentAttempt > MAX_ATTEMPTS) {
        console.log('[DrinkMP Polling] Timeout - pagamento não confirmado em 5 minutos');
        setIsPolling(false);
        setMpError('Timeout: Pagamento não confirmado. Tente novamente.');
        setIsProcessing(false);
        setPointStatus('idle');
        updateProcessingStage("idle");
        moveToStep(2);
        return;
      }

      try {
        console.log(`[DrinkMP Polling] Tentativa ${currentAttempt}/${MAX_ATTEMPTS} - verificando order ${orderId}`);
        setPollingAttempt(currentAttempt);

        const order = await paymentService.checkMercadoPagoOrderStatus(orderId, pollAbortRef.current?.signal);
        const paymentStatus = order.transactions?.payments?.[0]?.status;

        console.log(`[DrinkMP Polling] Status: order=${order.status}, payment=${paymentStatus}, type=${order.type}`);

        // Para Point: atualizar status visual quando a order chega no terminal
        if (isPointPayment && order.status === 'at_terminal') {
          setPointStatus('at_terminal');
        }

        // Tratar status de falha
        if (order.status === 'failed' || order.status === 'expired' || order.status === 'canceled') {
          console.log(`[DrinkMP Polling] ❌ Pagamento ${order.status}`);
          setIsPolling(false);
          setPointStatus('error');
          const errorMessages: Record<string, string> = {
            failed: 'Pagamento falhou. Tente novamente.',
            expired: 'Tempo expirado. Tente novamente.',
            canceled: 'Pagamento cancelado.'
          };
          setMpError(errorMessages[order.status] || 'Erro no pagamento');
          setIsProcessing(false);
          updateProcessingStage("idle");
          moveToStep(2);
          return;
        }

        // Tratar action_required (precisa de ação no terminal)
        if (order.status === 'action_required') {
          console.log('[DrinkMP Polling] ⚠️ Ação requerida no terminal');
          setPointStatus('at_terminal'); // Manter visual de aguardando
          // Continuar polling - usuário precisa agir no terminal
          pollTimeoutRef.current = window.setTimeout(poll, POLL_INTERVAL);
          return;
        }

        // Verificar se pagamento foi processado
        const isOrderProcessed = order.status === 'processed' || order.status === 'closed';
        const isPaymentApproved = paymentStatus === 'approved' || paymentStatus === 'processed';

        if (isOrderProcessed && isPaymentApproved) {
          console.log('[DrinkMP Polling] ✅ Pagamento aprovado!');
          setIsPolling(false);
          setPointStatus('idle');
          
          toast({
            title: "Pagamento aprovado",
            description: "Pagamento confirmado com sucesso"
          });

          updateProcessingStage("payment_approved");

          // Continuar com o fluxo pós-pagamento
          await finishPaymentFlow(orderNumber);
          return;
        }

        // Continuar polling
        pollTimeoutRef.current = window.setTimeout(poll, POLL_INTERVAL);
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          console.log('[DrinkMP Polling] Aborted');
          return;
        }
        console.error('[DrinkMP Polling] Erro ao verificar status:', error);
        setMpError(error.message || 'Erro ao verificar pagamento');
        setIsPolling(false);
        setPointStatus('error');
        setIsProcessing(false);
        updateProcessingStage("idle");
        moveToStep(2);
      }
    };

    poll();
  };

  const handlePaymentComplete = async () => {
    setIsProcessing(true);
    setMaxInactivityTime(300);
    resetInactivityTimer();
    moveToStep(3);
    updateProcessingStage("awaiting_payment");
    setMpError(null);

    // Timeout de emergência: cancela pagamento após 5 minutos
    if (emergencyTimeoutRef.current) {
      clearTimeout(emergencyTimeoutRef.current);
    }
    emergencyTimeoutRef.current = setTimeout(() => {
      if (processingStageRef.current === "awaiting_payment") {
        handleCancelPayment();
        toast({
          title: "Timeout",
          description: "Pagamento não confirmado a tempo",
          variant: "destructive",
        });
      }
    }, (flowState.paymentTimeoutSeconds ?? 300) * 1000);

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
          setIsPolling(true);
          setPollingAttempt(0);

          // Iniciar polling com orderNumber para usar após aprovação (QR não é Point)
          startMercadoPagoPolling(result.orderId!, newOrderNumber, false);

        } catch (error: any) {
          console.error('[DrinkQR] Erro ao criar QR:', error);
          const errorMsg = error.message || 'Erro ao gerar QR Code';
          setMpError(errorMsg);
          setIsProcessing(false);
          updateProcessingStage("idle");
          moveToStep(2);
          toast({
            title: "Erro no Pagamento",
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
          setIsPolling(true);
          setPollingAttempt(0);

          // Iniciar polling com flag isPointPayment = true
          startMercadoPagoPolling(result.orderId!, newOrderNumber, true);

        } catch (error: any) {
          console.error('[DrinkPoint] Erro ao criar order Point:', error);
          const errorMsg = error.message || 'Erro ao enviar para terminal';
          setMpError(errorMsg);
          setPointStatus('error');
          setIsProcessing(false);
          updateProcessingStage("idle");
          moveToStep(2);
          toast({
            title: "Erro no Terminal",
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
        title: "Error",
        description: (error as Error)?.message || "Payment failed",
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

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {flowState.currentStep === 1 && "Escolha o Tamanho"}
            {flowState.currentStep === 2 && "Finalizar Pedido"}
            {flowState.currentStep === 3 && "Processando..."}
          </DialogTitle>
          <DialogDescription>
            {flowState.currentStep === 1 && "Selecione o tamanho e quantidade da sua bebida"}
            {flowState.currentStep === 2 && "Revise seu pedido e escolha a forma de pagamento"}
            {flowState.currentStep === 3 && "Aguarde enquanto processamos seu pedido"}
          </DialogDescription>
          <StepperIndicator
            currentStep={flowState.currentStep > 2 ? 3 : flowState.currentStep}
            completedSteps={flowState.completedSteps}
            steps={[
              { label: "Tamanho", description: "Seleção" },
              { label: "Pagamento", description: "Finalizar" },
              { label: "Pronto", description: "Aguarde" },
            ]}
          />
        </DialogHeader>

        <div className="space-y-4">
          <InactivityTimer
            secondsLeft={flowState.inactivityTimeLeft}
            maxSeconds={flowState.maxInactivityTime}
            variant={flowState.timerVariant}
          />

          <TimeoutWarning
            isOpen={flowState.isInactivityWarning}
            secondsLeft={flowState.inactivityTimeLeft}
            action="o checkout será cancelado"
            onExtend={() => flowActions.extendInactivityTimeout(60)}
            onProceed={() => flowActions.extendInactivityTimeout(1)}
          />

          {flowState.currentStep === 1 && (
            <>
              <div>
                <Label htmlFor="size-select" className="block text-sm font-medium mb-2">
                  Tamanho
                </Label>
                <Select value={selectedSizeKey} onValueChange={(val) => { flowActions.resetInactivityTimer(); setSelectedSizeKey(val); }}>
                  <SelectTrigger id="size-select" className="h-12">
                    <SelectValue placeholder="Selecione o tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    {product.sizes?.map((size) => (
                      <SelectItem key={size.key} value={size.key}>
                        {size.label} - {currentCurrency.symbol}{size.price.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="qty-input" className="block text-sm font-medium mb-2">
                  Quantidade
                </Label>
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => { flowActions.resetInactivityTimer(); setQuantity(Math.max(1, quantity - 1)); }}
                    disabled={quantity <= 1}
                    className="w-12 h-12"
                  >
                    <Minus className="w-5 h-5" />
                  </Button>
                  <span className="text-3xl font-bold w-16 text-center">{quantity}</span>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => { flowActions.resetInactivityTimer(); setQuantity(Math.min(Math.max(1, quantity + 1), Math.max(0, maxQty))); }}
                    disabled={quantity >= maxQty}
                    className="w-12 h-12"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                {maxQty > 0 && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Máximo disponível: {maxQty}
                  </p>
                )}
              </div>

              {selectedSize && (
                <Card className="bg-green-50 border-green-200 p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Subtotal:</span>
                    <span className="text-2xl font-bold text-green-600">
                      {currentCurrency.symbol}{(selectedSize.price * quantity).toFixed(2)}
                    </span>
                  </div>
                </Card>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => handleBack(1)} className="flex-1">
                  Cancelar
                </Button>
                <Button 
                  onClick={() => handleNext(1)} 
                  className="flex-1" 
                  disabled={maxQty <= 0 || !selectedSizeKey}
                >
                  Continuar
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
                    <span className="text-gray-700">Produto:</span>
                    <span className="font-medium">{product.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Tamanho:</span>
                    <span className="font-medium">{selectedSize.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Quantidade:</span>
                    <span className="font-medium">{quantity}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal:</span>
                    <span>{currentCurrency.symbol}{(selectedSize.price * quantity).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Taxa ({storeSettings?.taxPercentage || 0}%):</span>
                    <span>{currentCurrency.symbol}{((selectedSize.price * quantity * (storeSettings?.taxPercentage || 0)) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-1">
                    <span>Total:</span>
                    <span className="text-green-600">
                      {currentCurrency.symbol}{calculateTotal().toFixed(2)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Seleção de Método de Pagamento */}
              <div className="space-y-2">
                <Label className="block font-medium text-sm">Forma de Pagamento</Label>
                
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
                    <p className="font-medium">PIX / QR Code</p>
                    <p className="text-xs text-gray-500">Pagamento instantâneo</p>
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
                    <p className="font-medium">Cartão de Crédito</p>
                    <p className="text-xs text-gray-500">Visa, Mastercard, Elo, Amex</p>
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
                    <p className="font-medium">Cartão de Débito</p>
                    <p className="text-xs text-gray-500">Débito à vista</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedPayment === "debit_card" ? "border-orange-500 bg-orange-500" : "border-gray-300"
                  }`}>
                    {selectedPayment === "debit_card" && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => handleBack(2)} className="flex-1">
                  Voltar
                </Button>
                <Button 
                  onClick={handleStartPayment} 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                >
                  Pagar {currentCurrency.symbol}{calculateTotal().toFixed(2)}
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
                          <p className="text-red-700 font-medium">Erro no pagamento</p>
                          <p className="text-red-600 text-sm mt-1">{mpError}</p>
                          <Button 
                            variant="outline" 
                            onClick={handleCancelPayment}
                            className="mt-4"
                          >
                            Tentar novamente
                          </Button>
                        </div>
                      )}

                      {/* QR Code real do Mercado Pago */}
                      {mpQrData && !mpError && (
                        <>
                          <div className="bg-white p-6 rounded-lg border-2 border-blue-300 inline-block">
                            <QRCode value={mpQrData} size={192} level="M" />
                          </div>
                          <p className="font-medium text-gray-700">Escaneie o QR code com seu app bancário</p>
                          <p className="text-sm text-gray-500">Use o app do banco para pagar via PIX</p>
                          
                          {isPolling && (
                            <div className="flex items-center justify-center gap-2 text-blue-600">
                              <Loader className="w-4 h-4 animate-spin" />
                              <span className="text-sm">
                                Verificando pagamento... ({pollingAttempt}/60)
                              </span>
                            </div>
                          )}

                          <Button 
                            variant="ghost" 
                            onClick={handleCancelPayment}
                            className="mt-4"
                          >
                            Cancelar pagamento
                          </Button>
                        </>
                      )}

                      {/* Carregando QR Code */}
                      {!mpQrData && !mpError && (
                        <>
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-600">Gerando QR Code...</p>
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
                          <p className="text-red-700 font-medium">Erro no terminal</p>
                          <p className="text-red-600 text-sm mt-1">{mpError || 'Falha na comunicação com o terminal'}</p>
                          <Button 
                            variant="outline" 
                            onClick={handleCancelPayment}
                            className="mt-4"
                          >
                            Tentar novamente
                          </Button>
                        </div>
                      )}

                      {/* Enviando para o terminal */}
                      {pointStatus === 'sending' && !mpError && (
                        <>
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-600">Enviando para o terminal...</p>
                          <p className="text-sm text-gray-500">
                            {selectedPayment === "credit_card" ? "Pagamento em crédito" : "Pagamento em débito"}
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
                              ? "Insira ou aproxime seu cartão de CRÉDITO" 
                              : "Insira ou aproxime seu cartão de DÉBITO"
                            }
                          </p>
                          <p className="text-sm text-gray-500">Aguardando leitura no terminal...</p>
                          
                          {isPolling && (
                            <div className={`flex items-center justify-center gap-2 ${
                              selectedPayment === "credit_card" ? "text-blue-600" : "text-orange-600"
                            }`}>
                              <Clock className="w-4 h-4 animate-pulse" />
                              <span className="text-sm">
                                Verificando pagamento... ({pollingAttempt}/60)
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
                            Cancelar
                          </Button>
                        </>
                      )}

                      {/* Processando pagamento */}
                      {pointStatus === 'processing' && !mpError && (
                        <>
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
                          <p className="text-gray-600 font-medium">Processando pagamento...</p>
                          <p className="text-sm text-gray-500">Aguarde a confirmação</p>
                        </>
                      )}

                      {/* Estado inicial/idle - fallback */}
                      {pointStatus === 'idle' && !mpError && (
                        <>
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-600">Iniciando pagamento...</p>
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
                  <p className="text-gray-600 font-medium text-lg">Pagamento aprovado!</p>
                  <p className="text-sm text-gray-500">Processando pedido...</p>
                </>
              )}

              {flowState.processingStage === "recording_sale" && (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 font-medium">Registrando venda...</p>
                  <p className="text-sm text-gray-500">Atualizando estoque</p>
                  <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 mt-2">
                    <div className="bg-blue-600 h-2 rounded-full w-1/3 animate-pulse"></div>
                  </div>
                </>
              )}

              {flowState.processingStage === "dispensing" && (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
                  <p className="text-gray-600 font-medium">Dispensando sua bebida...</p>
                  <p className="text-sm text-gray-500">Aguarde a saída do copo</p>
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
                  <p className="text-gray-600 font-medium text-lg">Bebida pronta!</p>
                  <p className="text-sm text-gray-500">Posicione seu copo para retirar</p>
                </>
              )}

              {flowState.processingStage === "complete" && (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium">Pagamento confirmado!</p>
                  <p className="text-sm text-gray-500">Retire sua bebida</p>
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
