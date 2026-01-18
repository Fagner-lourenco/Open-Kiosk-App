import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Receipt, QrCode, Printer, Check, CreditCard, Wifi, AlertCircle, Loader, Clock, AlertTriangle } from "lucide-react";
import { getCartItemKey } from "@/utils/productUtils";
import { CartItem } from "@/types/product";
import { useTranslation } from "@/i18n";
import { useCurrentCurrency } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
// NOTA: esp32Printer usado APENAS para impressão térmica (printReceipt), não para dispensação
import { esp32Printer } from "@/services/esp32PrinterService";
import { useToast } from "@/hooks/use-toast";
import { salesService } from "@/services/salesService";
import { getCurrentStoreId } from "@/services/firebase";
import UartPortSelector from "./UartPortSelector";
import { pdfReceiptService } from "@/services/pdfReceiptService";
import { paymentService } from "@/services/paymentService";
import { MERCADO_PAGO_CONFIG, validateMercadoPagoConfig } from "@/config/mercadopago";
import { usePaymentGateway } from "@/context/PaymentGatewayContext";
import { useMercadoPagoPolling } from "@/hooks/useMercadoPagoPolling";
import type { OrderStatus, PaymentStatus } from "@/types/mercadopago";
import QRCode from "react-qr-code";

interface CheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onClearCart: () => void;
  onComplete: () => void;
}

const Checkout = ({ isOpen, onClose, cartItems, onUpdateQuantity, onClearCart, onComplete }: CheckoutProps) => {
  const { t } = useTranslation();
  const [isCompleted, setIsCompleted] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const currentCurrency = useCurrentCurrency();
  const { settings } = useStoreSettings();
  const { toast } = useToast();
  
  // Configuração do gateway de pagamento (Firestore > env vars)
  const { gatewayConfig, resolvedConfig, isConfigured, enabledMethods } = usePaymentGateway();

  // Estados para Mercado Pago QR e Point
  // Determinar método de pagamento inicial baseado nos métodos habilitados
  const getDefaultPaymentMethod = (): 'pix_qr' | 'credit_card' | 'debit_card' => {
    if (enabledMethods.pix) return 'pix_qr';
    if (enabledMethods.credit) return 'credit_card';
    if (enabledMethods.debit) return 'debit_card';
    return 'pix_qr'; // fallback (será tratado pelo alerta)
  };
  
  const [paymentMethod, setPaymentMethod] = useState<'pix_qr' | 'credit_card' | 'debit_card'>(getDefaultPaymentMethod());
  const [pointStatus, setPointStatus] = useState<'idle' | 'sending' | 'at_terminal' | 'processing' | 'error'>('idle');
  const [qrFlowStarted, setQrFlowStarted] = useState(false); // Controla quando o fluxo QR foi iniciado
  const [mpOrderId, setMpOrderId] = useState<string | null>(null);
  const [mpQrData, setMpQrData] = useState<string | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  
  // Guard contra duplicação de vendas - usando mutex pattern
  const [saleRecorded, setSaleRecorded] = useState(false);
  const saleRecordedRef = useRef(false);
  const paymentInProgressRef = useRef<Promise<void> | null>(null);

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
      console.log('[Checkout] Pagamento aprovado via polling hook', { orderId: order.id });
      
      // Liberar terminal para próxima ordem (self-service)
      paymentService.markTerminalOrderComplete();
      
      toast({
        title: t('checkout.paymentApprovedToast'),
        description: t('checkout.paymentConfirmedSuccess')
      });
      await handlePaymentComplete();
    },
    onError: (errorMsg) => {
      console.error('[Checkout] Erro no polling:', errorMsg);
      
      // Mapear mensagens de erro para português amigável
      const errorMessages: Record<string, { title: string; description: string }> = {
        'Pagamento recusado': {
          title: t('checkout.paymentDeclined') || 'Pagamento Recusado',
          description: t('checkout.paymentDeclinedDescription') || 'O pagamento foi recusado. Verifique o limite do cartão ou tente outro método de pagamento.'
        },
        'Pagamento expirado': {
          title: t('checkout.paymentExpired') || 'Tempo Expirado',
          description: t('checkout.paymentExpiredDescription') || 'O tempo para pagamento expirou. Por favor, tente novamente.'
        },
        'Pagamento cancelado': {
          title: t('checkout.paymentCanceled') || 'Pagamento Cancelado',
          description: t('checkout.paymentCanceledDescription') || 'O pagamento foi cancelado.'
        },
      };
      
      const errorInfo = errorMessages[errorMsg] || {
        title: t('checkout.paymentError') || 'Erro no Pagamento',
        description: errorMsg || t('checkout.paymentErrorDescription') || 'Ocorreu um erro ao processar o pagamento. Tente novamente.'
      };
      
      // Mostrar toast de erro com mensagem clara
      toast({
        title: errorInfo.title,
        description: errorInfo.description,
        variant: 'destructive',
      });
      
      setMpError(errorInfo.description);
      setPaymentProcessed(false);
      if (paymentMethod !== 'pix_qr') setPointStatus('error');
    },
    onStatusChange: (status: OrderStatus, paymentStatus?: PaymentStatus) => {
      console.log('[Checkout] Status changed:', { status, paymentStatus });
      // Para Point: atualizar status visual quando a order chega no terminal
      if (paymentMethod !== 'pix_qr' && status === 'at_terminal') {
        setPointStatus('at_terminal');
      }
    },
    onAttempt: (attempt, maxAttempts) => {
      console.log(`[Checkout] Polling tentativa ${attempt}/${maxAttempts}`);
    },
  });

  // Generate order number when component mounts and keep it consistent
  useEffect(() => {
    if (isOpen && !orderNumber) {
      const fetchOrderNumber = async () => {
        try {
          const newOrderNumber = await salesService.generateOrderNumber();
          setOrderNumber(newOrderNumber);
        } catch (error) {
          console.error('Error generating order number:', error);
          // Fallback to timestamp-based order number
          const now = new Date();
          const year = now.getFullYear().toString().slice(-2);
          const month = (now.getMonth() + 1).toString().padStart(2, '0');
          const day = now.getDate().toString().padStart(2, '0');
          const hour = now.getHours().toString().padStart(2, '0');
          const minute = now.getMinutes().toString().padStart(2, '0');
          const second = now.getSeconds().toString().padStart(2, '0');
          setOrderNumber(`${year}${month}${day}${hour}${minute}${second}`);
        }
      };
      
      fetchOrderNumber().catch((err) => {
        console.error('Error generating order number (unhandled):', err);
        // Garantir que sempre tenhamos um orderNumber válido
        if (!orderNumber) {
          const fallback = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          setOrderNumber(fallback);
          toast({
            title: t('checkout.orderNumberWarning') || 'Aviso',
            description: t('checkout.orderNumberFallback') || 'Número de pedido gerado localmente',
            variant: 'default'
          });
        }
      });
    }
  }, [isOpen, orderNumber, t, toast]);

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.unitPrice * item.quantity), 0);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const getTaxAmount = () => {
    return getTotalPrice() * (settings?.taxPercentage || 0) / 100;
  };

  const getFinalTotal = () => {
    return getTotalPrice() + getTaxAmount();
  };

  const handleProceedToPayment = () => {
    setShowPayment(true);
  };

  // Handler para iniciar pagamento com QR Mercado Pago
  const handleStartMercadoPagoQR = async () => {
    // Proteção imediata contra múltiplos cliques
    if (paymentProcessed || qrFlowStarted) {
      console.log('[Checkout] Pagamento QR já em andamento, ignorando clique duplicado');
      return;
    }
    
    console.log('[Checkout] Iniciando pagamento QR Mercado Pago...');
    setQrFlowStarted(true);
    setMpError(null);
    setPaymentProcessed(true);
    
    try {
      // Validar configuração
      validateMercadoPagoConfig();

      // Preparar items
      const mpItems = cartItems.map(item => ({
        title: item.product.title,
        unit_price: item.unitPrice.toFixed(2),
        quantity: item.quantity,
        unit_measure: 'unit',
        total_amount: (item.unitPrice * item.quantity).toFixed(2),
      }));

      const totalAmount = getFinalTotal();
      const externalRef = `KIOSK-${orderNumber}-${Date.now()}`;

      console.log('[Checkout] Criando QR Order:', {
        amount: totalAmount,
        items: mpItems.length,
        externalRef,
      });

      // Chamar API do Mercado Pago
      const result = await paymentService.processMercadoPagoQR(
        totalAmount,
        mpItems,
        externalRef,
        resolvedConfig.externalPosId,
        gatewayConfig
      );

      console.log('[Checkout] QR Order criada:', { orderId: result.orderId });

      setMpOrderId(result.orderId || null);
      setMpQrData(result.qrData || null);
      
      // Iniciar polling via hook
      startPolling(result.orderId!);

    } catch (error: unknown) {
      console.error('[Checkout] Erro ao criar QR:', error);
      const errorMsg = error instanceof Error ? error.message : t('checkout.paymentErrorGeneric');
      setMpError(errorMsg);
      setPaymentProcessed(false);
      toast({
        title: t('checkout.paymentError'),
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  // Handler para iniciar pagamento com Mercado Pago Point (Terminal físico)
  const handleStartMercadoPagoPoint = async () => {
    // Proteção imediata contra múltiplos cliques
    if (paymentProcessed || pointStatus !== 'idle') {
      console.log('[Checkout] Pagamento Point já em andamento, ignorando clique duplicado');
      return;
    }
    
    const paymentType = paymentMethod === 'credit_card' ? 'credit_card' : 'debit_card';
    console.log('[Checkout] Iniciando pagamento Point:', paymentType);
    
    setPointStatus('sending');
    setMpError(null);
    setPaymentProcessed(true);
    
    try {
      const mpItems = cartItems.map(item => ({
        title: item.product.title,
        unit_price: item.unitPrice.toFixed(2),
        quantity: item.quantity,
        unit_measure: 'unit',
        total_amount: (item.unitPrice * item.quantity).toFixed(2),
      }));

      const externalRef = `KIOSK-${orderNumber}-${Date.now()}`;
      
      console.log('[Checkout] Criando Point Order:', {
        amount: getFinalTotal(),
        items: mpItems.length,
        externalRef,
        paymentType,
        terminalId: resolvedConfig.terminalId || 'auto-detect',
        configSource: resolvedConfig.source,
      });

      const result = await paymentService.processMercadoPagoPoint(
        getFinalTotal(),
        mpItems,
        externalRef,
        resolvedConfig.terminalId || undefined,
        {
          defaultPaymentType: paymentType,
          defaultInstallments: paymentType === 'debit_card' ? 1 : undefined,
        },
        gatewayConfig
      );

      console.log('[Checkout] Point Order criada:', { orderId: result.orderId, paymentType });

      setMpOrderId(result.orderId || null);
      setPointStatus('at_terminal');
      startPolling(result.orderId!, true);
      
    } catch (error: unknown) {
      console.error('[Checkout] Erro ao criar Point order:', error);
      const errorMsg = error instanceof Error ? error.message : t('checkout.terminalSendError');
      setMpError(errorMsg);
      setPointStatus('error');
      setPaymentProcessed(false);
      toast({
        title: t('checkout.terminalError'),
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  const handlePaymentComplete = async () => {
    // Guard contra duplicação de vendas - mutex pattern
    // Verificar se já está em progresso ou já foi concluído
    if (saleRecordedRef.current) {
      console.log('[Checkout] Venda já registrada, ignorando duplicação');
      return;
    }
    
    // Verificar se há uma operação em andamento (mutex)
    if (paymentInProgressRef.current) {
      console.log('[Checkout] Pagamento em andamento, aguardando...');
      await paymentInProgressRef.current;
      return; // Outra chamada já processou
    }
    
    // Marcar imediatamente ANTES de qualquer operação async
    saleRecordedRef.current = true;
    setSaleRecorded(true);
    setPaymentProcessed(true);
    
    // Criar Promise para mutex - inicializar resolve com no-op para evitar race condition
    let resolvePayment: () => void = () => {};
    paymentInProgressRef.current = new Promise<void>((resolve) => {
      resolvePayment = resolve;
    });
    
    try {
      await salesService.recordSaleAndUpdateStock(
        cartItems,
        getFinalTotal(),
        currentCurrency.code,
        orderNumber,
        paymentMethod,
        getCurrentStoreId()
      );
      console.log('Sale recorded and stock updated atomically:', orderNumber);
    } catch (error) {
      console.error('Error processing order:', error);
      // Reverter guards em caso de erro
      saleRecordedRef.current = false;
      setSaleRecorded(false);
      setPaymentProcessed(false);
      paymentInProgressRef.current = null;
      toast({
        title: t('common.error'),
        description: (error as Error)?.message || t('checkout.processOrderError'),
        variant: "destructive"
      });
      return;
    } finally {
      // Liberar mutex
      resolvePayment!();
      paymentInProgressRef.current = null;
    }

    // Print receipt before clearing the cart so data remains available
    if (settings?.useThermalPrinter && settings?.comPort) {
      await handleESP32Print();
    } else if (!settings?.useThermalPrinter) {
      await handlePDFPrint();
    }

    // Clear the cart after payment and printing attempts
    onClearCart();
    
    // Show completion screen
    setTimeout(() => {
      setIsCompleted(true);
    }, 1000);
  };

  const handleESP32Print = async () => {
    if (!settings?.comPort) {
      toast({
        title: t('checkout.noComPortConfigured'),
        description: t('checkout.comPortNotSet'),
        variant: "destructive"
      });
      return;
    }
    setIsPrinting(true);
    try {
      const result = await esp32Printer.printReceipt(cartItems, settings, orderNumber);
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('checkout.printSuccess'),
        });
      } else {
        toast({
          title: t('checkout.printError'),
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Print error:', error);
      toast({ title: t('checkout.printError'), description: t('checkout.printFailed'), variant: "destructive" });
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePDFPrint = async () => {
    setIsPrinting(true);
    try {
      pdfReceiptService.generateReceiptPDF(cartItems, settings!, orderNumber);
      toast({
        title: t('common.success'),
        description: t('checkout.pdfSuccess'),
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({ 
        title: t('checkout.pdfError'), 
        description: t('checkout.pdfFailed'), 
        variant: "destructive" 
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const resetCheckout = useCallback(() => {
    setIsCompleted(false);
    setShowPayment(false);
    setPaymentProcessed(false);
    setOrderNumber("");
    setPointStatus('idle');
    setQrFlowStarted(false);
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
    // Reset sale guard
    setSaleRecorded(false);
    saleRecordedRef.current = false;
    paymentInProgressRef.current = null;
  }, []);

  const handleClose = () => {
    onClose();
    resetCheckout();
    // cleanup polling via hook
    stopPolling();
    clearPersistedState();
  };

  // Bug #13: Cleanup ao desmontar componente (independente de isOpen)
  useEffect(() => {
    return () => {
      // Cleanup garantido ao desmontar
      stopPolling();
      clearPersistedState();
    };
  }, [stopPolling, clearPersistedState]);

  useEffect(() => {
    if (!isOpen) {
      resetCheckout();
      stopPolling();
      clearPersistedState();
    }
  }, [isOpen, stopPolling, clearPersistedState, resetCheckout]);

  const handleCancelPayment = async () => {
    // Capturar orderId ANTES de qualquer operação (evita race condition)
    const orderIdToCancel = mpOrderId;
    
    // Parar polling e limpar persistência
    stopPolling();
    clearPersistedState();
    
    // Cancelar ordem remotamente no Mercado Pago, se houver
    if (orderIdToCancel) {
      try {
        const result = await paymentService.cancelMercadoPagoOrder(orderIdToCancel);
        
        if (result.canceled) {
          toast({ title: t('checkout.paymentCanceled'), description: t('checkout.operationCancelledByUser') });
        } else if (result.reason === 'at_terminal') {
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
        console.warn('[Checkout] Falha ao cancelar ordem no Mercado Pago', error);
        toast({ title: t('checkout.paymentCanceled'), description: t('checkout.operationCancelledByUser') });
      }
    }

    // Limpar estados locais
    setPaymentProcessed(false);
    setPointStatus('idle');
    setQrFlowStarted(false);
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
  };

  if (isCompleted) {
    return (
      <Sheet open={isOpen} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-lg md:max-w-xl flex flex-col max-h-screen">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              {t('checkout.orderCompleted')}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col h-full justify-center items-center text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('checkout.thankYou')}</h3>
              <p className="text-gray-600">{t('checkout.orderNumber')}{orderNumber} {t('checkout.orderCompleted').toLowerCase()}</p>
            </div>

            <div className="space-y-3 w-full">
              <Button onClick={() => { onComplete(); resetCheckout(); }} className="w-full">
                {t('checkout.startNewOrder')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg md:max-w-xl flex flex-col max-h-[100dvh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="p-0 h-auto touch-manipulation">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Receipt className="w-5 h-5" />
            {showPayment ? t('checkout.paymentStep') : t('checkout.title')}
          </SheetTitle>
        </SheetHeader>

        {/* Allow this area to scroll if content is long */}
        <div className="flex-1 py-6 space-y-6 overflow-y-auto min-h-0">
          {/* Order Summary */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-4">{t('checkout.orderSummary')}</h3>
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div key={getCartItemKey(item.product.id, item.sizeKey)} className="flex justify-between text-sm">
                    <span>
                      {item.product.title}{item.sizeLabel ? ` (${item.sizeLabel})` : ''} x{item.quantity}
                    </span>
                    <span>{currentCurrency.symbol}{(item.unitPrice * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('checkout.subtotal')} ({getTotalItems()} {t('common.items')})</span>
                    <span>{currentCurrency.symbol}{getTotalPrice().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t('checkout.taxAmount')} ({settings?.taxPercentage || 0}%)</span>
                    <span>{currentCurrency.symbol}{getTaxAmount().toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>{t('checkout.totalAmount')}</span>
                    <span>{currentCurrency.symbol}{getFinalTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Section - Only show when payment is initiated */}
          {showPayment && (
            <>
              {/* Seleção de método de pagamento (se QR ainda não foi iniciado) */}
              {!mpQrData && !mpOrderId && pointStatus === 'idle' && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-4">{t('checkout.paymentMethod')}</h3>
                    
                    {/* Alerta se nenhum método está habilitado */}
                    {!enabledMethods.pix && !enabledMethods.credit && !enabledMethods.debit && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Pagamentos Indisponíveis</AlertTitle>
                        <AlertDescription>
                          {t('admin.noPaymentMethodsEnabled')}
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="space-y-3">
                      {enabledMethods.pix && (
                        <button
                          onClick={() => setPaymentMethod('pix_qr')}
                          className={`w-full p-4 border-2 rounded-lg text-left transition ${
                            paymentMethod === 'pix_qr'
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          disabled={paymentProcessed}
                        >
                          <div className="flex items-center gap-3">
                            <QrCode className="w-5 h-5 text-green-600" />
                            <div>
                              <p className="font-medium text-sm">{t('checkout.pixQrCode')}</p>
                              <p className="text-xs text-gray-600">{t('checkout.instantPayment')}</p>
                            </div>
                          </div>
                        </button>
                      )}

                      {enabledMethods.credit && (
                        <button
                          onClick={() => setPaymentMethod('credit_card')}
                          className={`w-full p-4 border-2 rounded-lg text-left transition ${
                            paymentMethod === 'credit_card'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          disabled={paymentProcessed}
                        >
                          <div className="flex items-center gap-3">
                            <CreditCard className="w-5 h-5 text-blue-600" />
                            <div>
                              <p className="font-medium text-sm">{t('checkout.creditCard')}</p>
                              <p className="text-xs text-gray-600">{t('checkout.visaMasterElo')}</p>
                            </div>
                          </div>
                        </button>
                      )}

                      {enabledMethods.debit && (
                        <button
                          onClick={() => setPaymentMethod('debit_card')}
                          className={`w-full p-4 border-2 rounded-lg text-left transition ${
                            paymentMethod === 'debit_card'
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          disabled={paymentProcessed}
                        >
                          <div className="flex items-center gap-3">
                            <CreditCard className="w-5 h-5 text-orange-600" />
                            <div>
                              <p className="font-medium text-sm">{t('checkout.debitCard')}</p>
                              <p className="text-xs text-gray-600">{t('checkout.debitInstant')}</p>
                            </div>
                          </div>
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Seção de QR Code Mercado Pago - só exibe após clicar em Gerar */}
              {paymentMethod === 'pix_qr' && qrFlowStarted && (
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center space-y-4">
                      <h3 className="font-medium">{t('checkout.payWithQrCode')}</h3>

                      {/* Exibir QR Code ou estado de carregamento */}
                      {!mpQrData ? (
                        <div className="flex flex-col items-center gap-3">
                          <Loader className="w-8 h-8 animate-spin text-blue-600" />
                          <p className="text-sm text-gray-600">{t('checkout.generatingQr')}</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="bg-white p-3 rounded-lg border-2 border-gray-200 flex justify-center">
                            <QRCode
                              value={mpQrData}
                              size={180}
                              level="H"
                              fgColor="#000000"
                              bgColor="#FFFFFF"
                            />
                          </div>

                          <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                            <p className="text-xs font-medium text-blue-900">{t('checkout.instructions')}:</p>
                            <ol className="text-xs text-blue-800 mt-1 space-y-0.5 list-decimal list-inside">
                              <li>{t('checkout.instruction1')}</li>
                              <li>{t('checkout.instruction2')}</li>
                              <li>{t('checkout.instruction3')}</li>
                            </ol>
                          </div>

                          {isPolling && (
                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                              <p className="text-xs font-medium text-yellow-900">
                                {t('checkout.awaitingPayment')} ({t('checkout.attempt')} {pollingAttempt}/{pollingMaxAttempts})
                              </p>
                              <div className="mt-2 w-full bg-yellow-200 rounded-full h-2">
                                <div
                                  className="bg-yellow-600 h-2 rounded-full transition-all"
                                  style={{ width: `${(pollingAttempt / pollingMaxAttempts) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {mpError && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                              <div className="flex gap-2 items-start">
                                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-700">{mpError}</p>
                              </div>
                            </div>
                          )}

                          <p className="text-xs text-gray-600 mt-4">
                            {t('checkout.totalToPay')}: <span className="font-bold">{currentCurrency.symbol}{getFinalTotal().toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Seção de Cartão (Crédito/Débito) via Point */}
              {(paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && (mpOrderId || pointStatus !== 'idle') && (
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center space-y-4">
                      <h3 className="font-medium">
                        {paymentMethod === 'credit_card' ? t('checkout.paymentWithCredit') : t('checkout.paymentWithDebit')}
                      </h3>

                      {/* Erro no terminal */}
                      {(pointStatus === 'error' || mpError) && (
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                          <p className="text-red-700 font-medium">{t('checkout.terminalError')}</p>
                          <p className="text-red-600 text-sm mt-1">{mpError || t('checkout.terminalCommError')}</p>
                        </div>
                      )}

                      {/* Enviando para o terminal */}
                      {pointStatus === 'sending' && !mpError && (
                        <div className="py-6">
                          <Loader className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                          <p className="text-gray-600">{t('checkout.sendingToTerminal')}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {paymentMethod === 'credit_card' ? t('checkout.creditPayment') : t('checkout.debitPayment')}
                          </p>
                        </div>
                      )}

                      {/* Aguardando no terminal */}
                      {pointStatus === 'at_terminal' && !mpError && (
                        <div className="py-4">
                          <CreditCard className={`w-20 h-20 mx-auto animate-pulse mb-4 ${
                            paymentMethod === 'credit_card' ? 'text-blue-500' : 'text-orange-500'
                          }`} />
                          <p className="font-medium text-gray-700">
                            {paymentMethod === 'credit_card' 
                              ? t('checkout.insertCreditCard') 
                              : t('checkout.insertDebitCard')
                            }
                          </p>
                          <p className="text-sm text-gray-500 mt-1">{t('checkout.awaitingTerminal')}</p>
                          
                          {isPolling && (
                            <div className={`flex items-center justify-center gap-2 mt-4 ${
                              paymentMethod === 'credit_card' ? 'text-blue-600' : 'text-orange-600'
                            }`}>
                              <Clock className="w-4 h-4 animate-pulse" />
                              <span className="text-sm">
                                {t('checkout.verifyingPayment')} ({pollingAttempt}/{pollingMaxAttempts})
                              </span>
                            </div>
                          )}

                          <div className={`animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mt-4 ${
                            paymentMethod === 'credit_card' ? 'border-blue-600' : 'border-orange-600'
                          }`}></div>

                          <p className="text-xs text-gray-600 mt-4">
                            {t('common.total')}: <span className="font-bold">{currentCurrency.symbol}{getFinalTotal().toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-2">{t('checkout.orderDetails')}</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>{t('checkout.orderNumberLabel')}: {orderNumber}</p>
                    <p>{t('common.date')}: {new Date().toLocaleDateString()}</p>
                    <p>{t('common.time')}: {new Date().toLocaleTimeString()}</p>
                    {settings?.useThermalPrinter && settings?.comPort && (
                      <p>{t('checkout.thermalPrinter')}: {settings.comPort}</p>
                    )}
                    {!settings?.useThermalPrinter && (
                      <p>{t('checkout.printMode')}: {t('checkout.pdfReceipt')}</p>
                    )}
                  </div>
                  
                  {/* Print button based on printer type */}
                  {settings?.useThermalPrinter && settings?.comPort ? (
                    <Button
                      className="w-full mt-4"
                      variant="outline"
                      onClick={handleESP32Print}
                      disabled={isPrinting}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      {isPrinting ? t('checkout.printing') : `${t('checkout.printTo')} ${settings.comPort}`}
                    </Button>
                  ) : (
                    <Button
                      className="w-full mt-4"
                      variant="outline"
                      onClick={handlePDFPrint}
                      disabled={isPrinting}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      {isPrinting ? t('checkout.generating') : t('checkout.generatePdfReceipt')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Action Buttons always pinned to bottom */}
        <div className="border-t pt-4 space-y-3">
          {!showPayment ? (
            <Button onClick={handleProceedToPayment} className="w-full" size="lg">
              <CreditCard className="w-4 h-4 mr-2" />
              {t('checkout.goToPayment')}
            </Button>
          ) : (
            <>
              {/* Botão para PIX/QR */}
              {paymentMethod === 'pix_qr' && !mpQrData && !isPolling && (
                <Button
                  onClick={handleStartMercadoPagoQR}
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="lg"
                  disabled={paymentProcessed}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  {paymentProcessed ? t('checkout.generatingQr') : t('checkout.generateQr')}
                </Button>
              )}

              {paymentMethod === 'pix_qr' && (mpQrData || isPolling) && (
                <div className="text-center py-3 text-sm text-gray-600">
                  <p>{t('checkout.awaitingPix')}</p>
                  <p className="text-xs mt-1">{t('checkout.willRedirect')}</p>
                </div>
              )}

              {/* Botão para Crédito */}
              {paymentMethod === 'credit_card' && pointStatus === 'idle' && !isPolling && (
                <Button
                  onClick={handleStartMercadoPagoPoint}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                  disabled={paymentProcessed}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {paymentProcessed ? t('checkout.sending') : t('checkout.payWithCredit')}
                </Button>
              )}

              {/* Botão para Débito */}
              {paymentMethod === 'debit_card' && pointStatus === 'idle' && !isPolling && (
                <Button
                  onClick={handleStartMercadoPagoPoint}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  size="lg"
                  disabled={paymentProcessed}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {paymentProcessed ? t('checkout.sending') : t('checkout.payWithDebit')}
                </Button>
              )}

              {/* Mensagem de aguardando para Point */}
              {(paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && (pointStatus !== 'idle' || isPolling) && (
                <div className="text-center py-3 text-sm text-gray-600">
                  <p>{t('checkout.awaitingTerminalPayment')}</p>
                  <p className="text-xs mt-1">{t('checkout.completeOnCardMachine')}</p>
                  <div className="mt-3">
                    <Button variant="destructive" onClick={handleCancelPayment} className="w-full">
                      {t('checkout.cancelPayment')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Cancelar pagamento via QR */}
              {paymentMethod === 'pix_qr' && (mpOrderId || mpQrData || isPolling) && (
                <div className="mt-3">
                  <Button variant="destructive" onClick={handleCancelPayment} className="w-full">
                    {t('checkout.cancelPayment')}
                  </Button>
                </div>
              )}

              <Button
                onClick={() => {
                  setShowPayment(false);
                  setPaymentMethod('pix_qr');
                  setQrFlowStarted(false);
                  setMpOrderId(null);
                  setMpQrData(null);
                  // Reset polling state via hook controls
                  stopPolling();
                  clearPersistedState();
                  setPaymentProcessed(false);
                  setMpError(null);
                  setPointStatus('idle');
                }}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('checkout.backButton')}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default Checkout;
