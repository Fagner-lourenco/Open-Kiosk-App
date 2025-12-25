import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Minus, Plus, CreditCard, QrCode, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { salesService } from "@/services/salesService";
import { esp32Printer } from "@/services/esp32PrinterService";
import { paymentService } from "@/services/paymentService";
import { CartItem, Product } from "@/types/product";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useCheckoutFlow } from "@/hooks/useCheckoutFlow";
import { InactivityTimer, ProcessingProgress, StepperIndicator, TimeoutWarning } from "./checkout/index";

const PAYMENT_METHODS = {
  pix_qr: {
    icon: QrCode,
    title: "PIX / QR Code",
    instruction: "Abra seu app bancário e confirme o pagamento",
    steps: [
      "Aproxime seu celular do QR code",
      "Abra o app do seu banco",
      "Procure pela opção PIX",
      "Confirme o pagamento"
    ]
  },
  card: {
    icon: CreditCard,
    title: "Cartão de Crédito",
    instruction: "Insira ou aproxime seu cartão",
    steps: [
      "Insira o cartão no leitor",
      "Ou aproxime se for contactless",
      "Aguarde a leitura",
      "Confirme a transação no terminal"
    ]
  },
  debit: {
    icon: CreditCard,
    title: "Cartão de Débito",
    instruction: "Insira seu cartão e digite a senha",
    steps: [
      "Insira o cartão no leitor",
      "Digite sua senha no terminal",
      "Aguarde a leitura",
      "Confirme a transação"
    ]
  }
};

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
  const [selectedPayment, setSelectedPayment] = useState<"pix_qr" | "card" | "debit">("pix_qr");
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [currentTransactionId, setCurrentTransactionId] = useState<string | null>(null);
  const [pixQRCode, setPixQRCode] = useState<string | null>(null);

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
      setShowConfirmation(false);
      setCurrentTransactionId(null);
      setPixQRCode(null);
      flowCancel();
      setTimerActive(false);
      updateProcessingStage("idle");
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
        toast({ title: "Error", description: "Select a valid size and quantity", variant: "destructive" });
        return;
      }
      moveToStep(2);
      return;
    }
    if (fromStep === 2) {
      moveToStep(3);
      return;
    }
    if (fromStep === 3) {
      if (!selectedPayment) {
        toast({ title: "Erro", description: "Selecione um método de pagamento", variant: "destructive" });
        return;
      }
      setShowConfirmation(true);
      return;
    }
  };

  const handleBack = (fromStep: number) => {
    if (fromStep > 1) {
      moveToStep((fromStep - 1) as 1 | 2 | 3 | 4);
    } else {
      onCancel();
    }
  };

  const confirmPaymentMethod = async () => {
    if (!selectedSize || selectedSize.ml <= 0) {
      toast({ title: "Erro", description: "Tamanho inválido", variant: "destructive" });
      return;
    }
    if (quantity <= 0 || maxQty <= 0) {
      toast({ title: "Erro", description: "Quantidade indisponível", variant: "destructive" });
      return;
    }
    setShowConfirmation(false);
    await handlePaymentComplete();
  };

  const handleCancelPayment = async () => {
    if (emergencyTimeoutRef.current) {
      clearTimeout(emergencyTimeoutRef.current);
      emergencyTimeoutRef.current = null;
    }
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
    setPixQRCode(null);
    setMaxInactivityTime(60);
    resetInactivityTimer();
    moveToStep(3);
    setShowConfirmation(false);
  };

  const handlePaymentComplete = async () => {
    setIsProcessing(true);
    setMaxInactivityTime(300);
    resetInactivityTimer();
    moveToStep(4);
    updateProcessingStage("awaiting_payment");

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
    }, (flowState.paymentTimeoutSeconds ?? 300) * 1000); // usa valor do hook (fallback 5 min)

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

      // STEP 1: Processar pagamento (aguarda confirmação real)
      let paymentResult;
      
      try {
        if (selectedPayment === "pix_qr") {
          paymentResult = await paymentService.processPixPayment(totalAmount, newOrderNumber);
          setPixQRCode(paymentResult.pixCode || null);
          setCurrentTransactionId(paymentResult.transactionId);
        } else {
          const cardType = selectedPayment === "card" ? "credit" : "debit";
          paymentResult = await paymentService.processCardPayment(totalAmount, cardType, newOrderNumber);
          setCurrentTransactionId(paymentResult.transactionId);
        }

        if (!paymentResult.success) {
          throw new Error(paymentResult.message || "Pagamento rejeitado");
        }

        toast({ 
          title: "Pagamento aprovado", 
          description: paymentResult.message || "Pagamento confirmado com sucesso" 
        });

        updateProcessingStage("payment_approved");
      } catch (paymentError: any) {
        if (paymentError.code === 'PAYMENT_CANCELLED') {
          // Usuário cancelou - não é erro
          return;
        }
        throw new Error(paymentError.message || "Erro ao processar pagamento");
      }

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
        newOrderNumber
      );

      // STEP 3: Dispensar bebida (ESP32)
      updateProcessingStage("dispensing");

      try {
        const releaseResult = await esp32Printer.releaseDrink(
          {
            orderId: newOrderNumber,
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

      // STEP 4: Pronto para retirada (com timer)
      updateProcessingStage("ready_pickup");

      onComplete({
        orderNumber: newOrderNumber,
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

      // Limpar timeout de emergência (pagamento foi aprovado)
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }

      // Mostrar sucesso e finalizar fluxo antes de fechar
      updateProcessingStage("complete");
      setTimerActive(false);
      setIsProcessing(false);
      setTimeout(() => {
        onCancel();
      }, 1500);
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
      setShowConfirmation(false);
      setMaxInactivityTime(60);
      resetInactivityTimer();
      moveToStep(3);
    } finally {
      setIsProcessing(false);
    }
  };

  // Garantir que este modal só opere para produtos de bebida
  if (!product || !product.isDrink) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {flowState.currentStep === 1 && "Select Size"}
            {flowState.currentStep === 2 && "Checkout"}
            {flowState.currentStep === 3 && "Payment"}
            {flowState.currentStep === 4 && "Processing..."}
          </DialogTitle>
          <DialogDescription>
            {flowState.currentStep === 1 && "Choose your drink size and quantity"}
            {flowState.currentStep === 2 && "Review your order details"}
            {flowState.currentStep === 3 && "Complete your payment"}
            {flowState.currentStep === 4 && "Please wait while we process your drink"}
          </DialogDescription>
          <StepperIndicator
            currentStep={flowState.currentStep}
            completedSteps={flowState.completedSteps}
            steps={[
              { label: "Tamanho", description: "Seleção" },
              { label: "Revisão", description: "Confirmação" },
              { label: "Pagamento", description: "Método" },
              { label: "Processando", description: "Aguarde" },
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
                  Size
                </Label>
                <Select value={selectedSizeKey} onValueChange={(val) => { flowActions.resetInactivityTimer(); setSelectedSizeKey(val); }}>
                  <SelectTrigger id="size-select">
                    <SelectValue placeholder="Select a size" />
                  </SelectTrigger>
                  <SelectContent>
                    {product.sizes?.map((size) => (
                      <SelectItem key={size.key} value={size.key}>
                        {size.label} - {currentCurrency.symbol}
                        {size.price.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="qty-input" className="block text-sm font-medium mb-2">
                  Quantity
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { flowActions.resetInactivityTimer(); setQuantity(Math.max(1, quantity - 1)); }}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="qty-input"
                    type="number"
                    min={1}
                    max={maxQty}
                    value={quantity}
                    onChange={(e) => {
                      flowActions.resetInactivityTimer();
                      const value = parseInt(e.target.value, 10);
                      if (Number.isNaN(value)) return;
                      setQuantity(Math.min(Math.max(1, value), Math.max(0, maxQty)));
                    }}
                    className="w-16 text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { flowActions.resetInactivityTimer(); setQuantity(Math.min(Math.max(1, quantity + 1), Math.max(0, maxQty))); }}
                    disabled={quantity >= maxQty}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                      {currentCurrency.symbol}
                </p>
              </div>

              {selectedSize && (
                <Card className="bg-gray-50 p-3">
                  <p className="text-sm text-gray-700">
                      {currentCurrency.symbol}
                    {(selectedSize.price * quantity).toFixed(2)}
                  </p>
                </Card>
              )}

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => handleBack(1)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={() => handleNext(1)} className="flex-1" disabled={maxQty <= 0}>
                  Next
                </Button>
              </div>
            </>
          )}

          {flowState.currentStep === 2 && selectedSize && (
            <>
              <Card className="bg-blue-50 border-blue-200 p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Product:</span>
                    <span className="font-medium">{product.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Size:</span>
                    <span className="font-medium">{selectedSize.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Unit Price:</span>
                    <span className="font-medium">
                      {currentCurrency.symbol}
                      {selectedSize.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Quantity:</span>
                    <span className="font-medium">{quantity}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>Subtotal:</span>
                    <span>
                      {currentCurrency.symbol}
                      {(selectedSize.price * quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tax ({storeSettings?.taxPercentage || 0}%):</span>
                    <span>
                      {currentCurrency.symbol}
                      {((selectedSize.price * quantity * (storeSettings?.taxPercentage || 0)) / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total:</span>
                    <span className="text-green-600">
                      {currentCurrency.symbol}
                      {(
                        selectedSize.price * quantity +
                        (selectedSize.price * quantity * (storeSettings?.taxPercentage || 0)) / 100
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </Card>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => handleBack(2)} className="flex-1">
                  Back
                </Button>
                <Button onClick={() => handleNext(2)} className="flex-1">
                  Proceed to Payment
                </Button>
              </div>
            </>
          )}

          {flowState.currentStep === 3 && !showConfirmation && !flowState.isProcessing && (
            <>
              <div className="space-y-3">
                <Label className="block font-medium">Método de Pagamento</Label>

                <div
                  className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                  onClick={() => { flowActions.resetInactivityTimer(); setSelectedPayment("pix_qr"); }}
                >
                  <input type="radio" name="payment" checked={selectedPayment === "pix_qr"} readOnly />
                  <label className="cursor-pointer flex-1">PIX / QR Code</label>
                </div>

                <div
                  className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                  onClick={() => { flowActions.resetInactivityTimer(); setSelectedPayment("card"); }}
                >
                  <input type="radio" name="payment" checked={selectedPayment === "card"} readOnly />
                  <label className="cursor-pointer flex-1">Credit Card</label>
                </div>

                <div
                  className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                  onClick={() => { flowActions.resetInactivityTimer(); setSelectedPayment("debit"); }}
                >
                  <input type="radio" name="payment" checked={selectedPayment === "debit"} readOnly />
                  <label className="cursor-pointer flex-1">Debit Card</label>
                </div>
              </div>

              {selectedPayment === "pix_qr" && (
                <Card className="bg-gray-50 p-4 text-center">
                  <p className="text-sm text-gray-600 mb-3">Scan the QR code:</p>
                  <div className="bg-white p-4 rounded border">
                    <QrCode className="w-32 h-32 mx-auto text-gray-400" />
                  </div>
                </Card>
              )}

              {selectedPayment !== "pix_qr" && (
                <Card className="bg-gray-50 p-4 text-center">
                  <p className="text-sm text-gray-600 mb-2">Insert or tap your card:</p>
                  <CreditCard className="w-16 h-16 mx-auto text-gray-400" />
                </Card>
              )}

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => handleBack(3)} className="flex-1">
                  Voltar
                </Button>
                <Button onClick={() => handleNext(3)} className="flex-1">
                  Próximo
                </Button>
              </div>
            </>
          )}

          {flowState.currentStep === 3 && showConfirmation && !flowState.isProcessing && (
            <>
              <Card className="bg-green-50 border-2 border-green-300 p-4">
                <div className="flex items-start gap-3 mb-4">
                  {(() => {
                    const method = PAYMENT_METHODS[selectedPayment];
                    const Icon = method.icon;
                    return (
                      <>
                        <Icon className="w-6 h-6 text-green-600 mt-1" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-green-900">
                            {method.title}
                          </h3>
                          <p className="text-sm text-green-700 mt-1">
                            {method.instruction}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="space-y-2 mb-4 pl-9">
                  <p className="text-xs font-medium text-green-800">Passo a passo:</p>
                  {PAYMENT_METHODS[selectedPayment].steps.map((step, idx) => (
                    <p key={idx} className="text-xs text-green-700">
                      {idx + 1}. {step}
                    </p>
                  ))}
                </div>

                <Separator className="bg-green-200 my-3" />

                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-medium text-gray-700">Total a pagar:</span>
                  <span className="text-lg font-semibold text-green-600">
                    {currentCurrency.symbol}
                    {selectedSize && (
                      selectedSize.price * quantity +
                      (selectedSize.price * quantity * (storeSettings?.taxPercentage || 0)) / 100
                    ).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowConfirmation(false)} 
                    className="flex-1"
                  >
                    Voltar
                  </Button>
                  <Button 
                    onClick={confirmPaymentMethod} 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    ✓ Confirmar e Pagar
                  </Button>
                </div>
              </Card>
            </>
          )}

          {(flowState.currentStep === 4 || (flowState.currentStep === 3 && flowState.isProcessing)) && (
            <div className="flex flex-col items-center justify-center gap-4 py-8 w-full">
              <ProcessingProgress stage={flowState.processingStage} steps={processingSteps} />

              {flowState.processingStage === "awaiting_payment" && (
                <>
                  {selectedPayment === "pix_qr" && pixQRCode && (
                    <div className="text-center space-y-4">
                      <div className="bg-white p-6 rounded-lg border-2 border-blue-300 inline-block">
                        <QrCode className="w-48 h-48 text-gray-800" />
                        <p className="text-xs text-gray-500 mt-2">QR Code simulado</p>
                      </div>
                      <p className="font-medium text-gray-700">Escaneie o QR code</p>
                      <p className="text-sm text-gray-500">Confirme o pagamento no app do banco</p>
                      
                      <div className="flex items-center justify-center gap-2 text-blue-600">
                        <Clock className="w-4 h-4 animate-pulse" />
                        <span className="text-sm">Aguardando confirmação...</span>
                      </div>

                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>

                      <Button 
                        variant="ghost" 
                        onClick={handleCancelPayment}
                        className="mt-4"
                      >
                        Cancelar pagamento
                      </Button>
                    </div>
                  )}

                  {selectedPayment !== "pix_qr" && (
                    <div className="text-center space-y-4">
                      <CreditCard className="w-20 h-20 mx-auto text-blue-500 animate-pulse" />
                      <p className="font-medium text-gray-700">
                        {selectedPayment === "card" ? "Insira ou aproxime seu cartão de crédito" : "Insira seu cartão de débito"}
                      </p>
                      <p className="text-sm text-gray-500">Aguardando leitura da máquina...</p>
                      
                      <div className="flex items-center justify-center gap-2 text-blue-600">
                        <Clock className="w-4 h-4 animate-pulse" />
                        <span className="text-sm">Processando...</span>
                      </div>

                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mt-4"></div>

                      <Button 
                        variant="ghost" 
                        onClick={handleCancelPayment}
                        className="mt-4"
                      >
                        Cancelar
                      </Button>
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
