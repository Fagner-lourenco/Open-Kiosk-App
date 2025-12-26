import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Receipt, QrCode, Printer, Check, CreditCard, Wifi, AlertCircle, Loader, Clock } from "lucide-react";
import { CartItem } from "@/types/product";
import { useCurrentCurrency } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { esp32Printer } from "@/services/esp32PrinterService";
import { useToast } from "@/hooks/use-toast";
import { salesService } from "@/services/salesService";
import UartPortSelector from "./UartPortSelector";
import { pdfReceiptService } from "@/services/pdfReceiptService";
import { paymentService } from "@/services/paymentService";
import { MERCADO_PAGO_CONFIG, validateMercadoPagoConfig } from "@/config/mercadopago";
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
  const [isCompleted, setIsCompleted] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const currentCurrency = useCurrentCurrency();
  const { settings } = useStoreSettings();
  const { toast } = useToast();

  // Estados para Mercado Pago QR e Point
  const [paymentMethod, setPaymentMethod] = useState<'pix_qr' | 'credit_card' | 'debit_card'>('pix_qr');
  const [pointStatus, setPointStatus] = useState<'idle' | 'sending' | 'at_terminal' | 'processing' | 'error'>('idle');
  const [qrFlowStarted, setQrFlowStarted] = useState(false); // Controla quando o fluxo QR foi iniciado
  const [mpOrderId, setMpOrderId] = useState<string | null>(null);
  const [mpQrData, setMpQrData] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingAttempt, setPollingAttempt] = useState(0);
  const [mpError, setMpError] = useState<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

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
      });
    }
  }, [isOpen, orderNumber]);

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
        MERCADO_PAGO_CONFIG.EXTERNAL_POS_ID
      );

      console.log('[Checkout] QR Order criada:', { orderId: result.orderId });

      setMpOrderId(result.orderId || null);
      setMpQrData(result.qrData || null);
      setIsPolling(true);
      setPollingAttempt(0);
      
      // Iniciar polling
      startMercadoPagoPolling(result.orderId!);

    } catch (error: any) {
      console.error('[Checkout] Erro ao criar QR:', error);
      const errorMsg = error.message || 'Erro ao gerar QR Code';
      setMpError(errorMsg);
      setPaymentProcessed(false);
      toast({
        title: "Erro no Pagamento",
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  // Handler para iniciar pagamento com Mercado Pago Point (Terminal físico)
  const handleStartMercadoPagoPoint = async () => {
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
        terminalId: MERCADO_PAGO_CONFIG.TERMINAL_ID || 'auto-detect'
      });

      const result = await paymentService.processMercadoPagoPoint(
        getFinalTotal(),
        mpItems,
        externalRef,
        MERCADO_PAGO_CONFIG.TERMINAL_ID || undefined,
        {
          defaultPaymentType: paymentType,
          defaultInstallments: paymentType === 'debit_card' ? 1 : undefined,
        }
      );

      console.log('[Checkout] Point Order criada:', { orderId: result.orderId, paymentType });

      setMpOrderId(result.orderId || null);
      setPointStatus('at_terminal');
      setIsPolling(true);
      setPollingAttempt(0);
      startMercadoPagoPolling(result.orderId!, true);
      
    } catch (error: any) {
      console.error('[Checkout] Erro ao criar Point order:', error);
      const errorMsg = error.message || 'Erro ao enviar para terminal';
      setMpError(errorMsg);
      setPointStatus('error');
      setPaymentProcessed(false);
      toast({
        title: "Erro no Terminal",
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  // Polling para verificar status de pagamento
  const startMercadoPagoPolling = (orderId: string, isPointPayment: boolean = false) => {
    const MAX_ATTEMPTS = 60; // 5 minutos
    const POLL_INTERVAL = 5000; // 5 segundos

    // criar AbortController por ciclo de polling
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
    }
    pollAbortRef.current = new AbortController();

    // Usar variável local para evitar problemas de closure com state
    let currentAttempt = 0;

    const poll = async () => {
      currentAttempt++;
      
      if (currentAttempt > MAX_ATTEMPTS) {
        console.log('[Polling] Timeout - pagamento não confirmado em 5 minutos');
        setIsPolling(false);
        setMpError('Timeout: Pagamento não confirmado. Tente novamente.');
        setPaymentProcessed(false);
        if (isPointPayment) setPointStatus('idle');
        return;
      }

      try {
        console.log(`[Polling] Tentativa ${currentAttempt}/${MAX_ATTEMPTS} - verificando order ${orderId}`);
        setPollingAttempt(currentAttempt);

        const order = await paymentService.checkMercadoPagoOrderStatus(orderId, pollAbortRef.current?.signal);
        const paymentStatus = order.transactions?.payments?.[0]?.status;

        console.log(`[Polling] Status: order=${order.status}, payment=${paymentStatus}, type=${order.type}`);

        // Para Point: atualizar status visual quando a order chega no terminal
        if (isPointPayment && order.status === 'at_terminal') {
          setPointStatus('at_terminal');
        }

        // Tratar status de falha
        if (order.status === 'failed' || order.status === 'expired' || order.status === 'canceled') {
          console.log(`[Polling] ❌ Pagamento ${order.status}`);
          setIsPolling(false);
          const errorMessages: Record<string, string> = {
            failed: 'Pagamento recusado. Tente novamente.',
            expired: 'Tempo expirado. Tente novamente.',
            canceled: 'Pagamento cancelado.'
          };
          setMpError(errorMessages[order.status] || 'Erro no pagamento');
          setPaymentProcessed(false);
          if (isPointPayment) setPointStatus('error');
          return;
        }

        // Tratar action_required (precisa de ação no terminal)
        if (order.status === 'action_required') {
          console.log('[Polling] ⚠️ Ação requerida no terminal');
          if (isPointPayment) setPointStatus('at_terminal');
          pollTimeoutRef.current = window.setTimeout(poll, POLL_INTERVAL);
          return;
        }

        // Verificar se pagamento foi processado
        const isOrderProcessed = order.status === 'processed' || order.status === 'closed';
        const isPaymentApproved = paymentStatus === 'approved' || paymentStatus === 'processed';

        if (isOrderProcessed && isPaymentApproved) {
          console.log('[Polling] ✅ Pagamento aprovado!');
          setIsPolling(false);
          setPaymentProcessed(true);
          if (isPointPayment) setPointStatus('idle');
          
          toast({
            title: "Pagamento aprovado",
            description: "Pagamento confirmado com sucesso"
          });
          
          // Registrar venda e continuar
          await handlePaymentComplete();
          return;
        }

        // Continuar polling
        pollTimeoutRef.current = window.setTimeout(poll, POLL_INTERVAL);
      } catch (error: any) {
        // Silenciar aborts (ex.: troca de tela/HMR)
        if (error?.name === 'AbortError') {
          console.log('[Polling] Aborted');
          return;
        }
        console.error('[Polling] Erro ao verificar status:', error);
        setMpError(error.message || 'Erro ao verificar pagamento');
        setIsPolling(false);
        setPaymentProcessed(false);
        if (isPointPayment) setPointStatus('error');
      }
    };

    poll();
  };

  const handlePaymentComplete = async () => {
    setPaymentProcessed(true);
    
    try {
      await salesService.recordSaleAndUpdateStock(
        cartItems,
        getFinalTotal(),
        currentCurrency.code,
        orderNumber
      );
      console.log('Sale recorded and stock updated atomically:', orderNumber);
    } catch (error) {
      console.error('Error processing order:', error);
      setPaymentProcessed(false);
      toast({
        title: "Error",
        description: (error as Error)?.message || "Failed to process order",
        variant: "destructive"
      });
      return;
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
        title: "No COM Port Configured",
        description: "COM port is not set in settings. Configure in Admin > Settings.",
        variant: "destructive"
      });
      return;
    }
    setIsPrinting(true);
    try {
      const result = await esp32Printer.printReceipt(cartItems, settings, orderNumber);
      if (result.success) {
        toast({
          title: "Success",
          description: "Receipt printed successfully!",
        });
      } else {
        toast({
          title: "Print Error",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Print error:', error);
      toast({ title: "Print Error", description: "Failed to print receipt.", variant: "destructive" });
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePDFPrint = async () => {
    setIsPrinting(true);
    try {
      pdfReceiptService.generateReceiptPDF(cartItems, settings!, orderNumber);
      toast({
        title: "Success",
        description: "PDF receipt generated successfully!",
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({ 
        title: "PDF Error", 
        description: "Failed to generate PDF receipt.", 
        variant: "destructive" 
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const resetCheckout = () => {
    setIsCompleted(false);
    setShowPayment(false);
    setPaymentProcessed(false);
    setOrderNumber("");
    setPointStatus('idle');
    setQrFlowStarted(false);
    setMpOrderId(null);
    setMpQrData(null);
    setMpError(null);
    setIsPolling(false);
    setPollingAttempt(0);
  };

  const handleClose = () => {
    onClose();
    resetCheckout();
    // cleanup polling
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetCheckout();
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
        pollAbortRef.current = null;
      }
    }
  }, [isOpen]);

  if (isCompleted) {
    return (
      <Sheet open={isOpen} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Order Completed
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col h-full justify-center items-center text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Thank you for your purchase!</h3>
              <p className="text-gray-600">Order #{orderNumber} has been completed successfully.</p>
            </div>

            <div className="space-y-3 w-full">
              <Button onClick={() => { onComplete(); resetCheckout(); }} className="w-full">
                Start New Order
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="p-0 h-auto">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Receipt className="w-5 h-5" />
            {showPayment ? 'Payment' : 'Checkout'}
          </SheetTitle>
        </SheetHeader>

        {/* Allow this area to scroll if content is long */}
        <div className="flex-1 py-6 space-y-6 overflow-y-auto min-h-0">
          {/* Order Summary */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-4">Order Summary</h3>
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div key={item.product.id} className="flex justify-between text-sm">
                    <span>
                      {item.product.title}{item.sizeLabel ? ` (${item.sizeLabel})` : ''} x{item.quantity}
                    </span>
                    <span>{currentCurrency.symbol}{(item.unitPrice * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal ({getTotalItems()} items)</span>
                    <span>{currentCurrency.symbol}{getTotalPrice().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax ({settings?.taxPercentage || 0}%)</span>
                    <span>{currentCurrency.symbol}{getTaxAmount().toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
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
                    <h3 className="font-medium mb-4">Método de Pagamento</h3>
                    <div className="space-y-3">
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
                            <p className="font-medium text-sm">PIX / QR Code</p>
                            <p className="text-xs text-gray-600">Pagamento instantâneo</p>
                          </div>
                        </div>
                      </button>

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
                            <p className="font-medium text-sm">Cartão de Crédito</p>
                            <p className="text-xs text-gray-600">Visa, Mastercard, Elo, Amex</p>
                          </div>
                        </div>
                      </button>

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
                            <p className="font-medium text-sm">Cartão de Débito</p>
                            <p className="text-xs text-gray-600">Débito à vista</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Seção de QR Code Mercado Pago - só exibe após clicar em Gerar */}
              {paymentMethod === 'pix_qr' && qrFlowStarted && (
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center space-y-4">
                      <h3 className="font-medium">Pagar com QR Code</h3>

                      {/* Exibir QR Code ou estado de carregamento */}
                      {!mpQrData ? (
                        <div className="flex flex-col items-center gap-3">
                          <Loader className="w-8 h-8 animate-spin text-blue-600" />
                          <p className="text-sm text-gray-600">Gerando QR Code...</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="bg-white p-4 rounded-lg border-2 border-gray-200 flex justify-center">
                            <QRCode
                              value={mpQrData}
                              size={256}
                              level="H"
                              fgColor="#000000"
                              bgColor="#FFFFFF"
                            />
                          </div>

                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <p className="text-xs font-medium text-blue-900">Instruções:</p>
                            <ol className="text-xs text-blue-800 mt-2 space-y-1 list-decimal list-inside">
                              <li>Abra o app Mercado Pago</li>
                              <li>Escaneie o código acima</li>
                              <li>Confirme o pagamento</li>
                            </ol>
                          </div>

                          {isPolling && (
                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                              <p className="text-xs font-medium text-yellow-900">
                                Aguardando confirmação... (Tentativa {pollingAttempt}/60)
                              </p>
                              <div className="mt-2 w-full bg-yellow-200 rounded-full h-2">
                                <div
                                  className="bg-yellow-600 h-2 rounded-full transition-all"
                                  style={{ width: `${(pollingAttempt / 60) * 100}%` }}
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
                            Total a pagar: <span className="font-bold">{currentCurrency.symbol}{getFinalTotal().toFixed(2)}</span>
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
                        {paymentMethod === 'credit_card' ? 'Pagamento com Crédito' : 'Pagamento com Débito'}
                      </h3>

                      {/* Erro no terminal */}
                      {(pointStatus === 'error' || mpError) && (
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                          <p className="text-red-700 font-medium">Erro no terminal</p>
                          <p className="text-red-600 text-sm mt-1">{mpError || 'Falha na comunicação com o terminal'}</p>
                        </div>
                      )}

                      {/* Enviando para o terminal */}
                      {pointStatus === 'sending' && !mpError && (
                        <div className="py-6">
                          <Loader className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                          <p className="text-gray-600">Enviando para o terminal...</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {paymentMethod === 'credit_card' ? 'Pagamento em crédito' : 'Pagamento em débito'}
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
                              ? 'Insira ou aproxime seu cartão de CRÉDITO' 
                              : 'Insira ou aproxime seu cartão de DÉBITO'
                            }
                          </p>
                          <p className="text-sm text-gray-500 mt-1">Aguardando leitura no terminal...</p>
                          
                          {isPolling && (
                            <div className={`flex items-center justify-center gap-2 mt-4 ${
                              paymentMethod === 'credit_card' ? 'text-blue-600' : 'text-orange-600'
                            }`}>
                              <Clock className="w-4 h-4 animate-pulse" />
                              <span className="text-sm">
                                Verificando pagamento... ({pollingAttempt}/60)
                              </span>
                            </div>
                          )}

                          <div className={`animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mt-4 ${
                            paymentMethod === 'credit_card' ? 'border-blue-600' : 'border-orange-600'
                          }`}></div>

                          <p className="text-xs text-gray-600 mt-4">
                            Total: <span className="font-bold">{currentCurrency.symbol}{getFinalTotal().toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-2">Order Details</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Order #: {orderNumber}</p>
                    <p>Date: {new Date().toLocaleDateString()}</p>
                    <p>Time: {new Date().toLocaleTimeString()}</p>
                    {settings?.useThermalPrinter && settings?.comPort && (
                      <p>Thermal Printer: {settings.comPort}</p>
                    )}
                    {!settings?.useThermalPrinter && (
                      <p>Print Mode: PDF Receipt</p>
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
                      {isPrinting ? "Printing..." : `Print to ${settings.comPort}`}
                    </Button>
                  ) : (
                    <Button
                      className="w-full mt-4"
                      variant="outline"
                      onClick={handlePDFPrint}
                      disabled={isPrinting}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      {isPrinting ? "Generating..." : "Generate PDF Receipt"}
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
              Ir para Pagamento
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
                  {paymentProcessed ? 'Gerando QR...' : 'Gerar QR Code PIX'}
                </Button>
              )}

              {paymentMethod === 'pix_qr' && (mpQrData || isPolling) && (
                <div className="text-center py-3 text-sm text-gray-600">
                  <p>Aguardando pagamento PIX...</p>
                  <p className="text-xs mt-1">Você será redirecionado automaticamente</p>
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
                  {paymentProcessed ? 'Enviando...' : 'Pagar com Crédito'}
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
                  {paymentProcessed ? 'Enviando...' : 'Pagar com Débito'}
                </Button>
              )}

              {/* Mensagem de aguardando para Point */}
              {(paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && (pointStatus !== 'idle' || isPolling) && (
                <div className="text-center py-3 text-sm text-gray-600">
                  <p>Aguardando pagamento no terminal...</p>
                  <p className="text-xs mt-1">Complete a transação na máquina de cartão</p>
                </div>
              )}

              <Button
                onClick={() => {
                  setShowPayment(false);
                  setPaymentMethod('pix_qr');
                  setQrFlowStarted(false);
                  setMpOrderId(null);
                  setMpQrData(null);
                  setIsPolling(false);
                  setPaymentProcessed(false);
                  setMpError(null);
                  setPointStatus('idle');
                  if (pollTimeoutRef.current) {
                    clearTimeout(pollTimeoutRef.current);
                    pollTimeoutRef.current = null;
                  }
                  if (pollAbortRef.current) {
                    pollAbortRef.current.abort();
                    pollAbortRef.current = null;
                  }
                }}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default Checkout;
