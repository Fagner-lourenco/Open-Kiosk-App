/**
 * Payment Service - Integração com Mercado Pago
 * 
 * Métodos de pagamento suportados:
 * - PIX / QR Code: Via Mercado Pago Orders API com polling
 * - Cartão: Terminal Point integrado com polling
 */

import { createMercadoPagoAPI } from './mercadopagoAPI';
import { MERCADO_PAGO_CONFIG } from '@/config/mercadopago';
import { getPaymentConfig, type ResolvedPaymentConfig } from '@/config/paymentGateway';
import { getFirebaseApp, getFirebaseDb, getCurrentFranchiseId, getCurrentStoreId } from '@/services/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Order, MercadoPagoCustomerData } from '@/types/mercadopago';
import type { OrderCustomerData } from '@/types/sales';
import type { PaymentGatewayConfig } from '@/types/store';
import type { CreatePaymentInput, CreatePaymentResponse, PaymentRecord } from '@/types/payments';

// Chave para armazenar último orderId do terminal (para limpar antes de nova ordem)
const LAST_TERMINAL_ORDER_KEY = 'mp_last_terminal_order';

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  message?: string;
  pixCode?: string; // QR code data para PIX
  qrData?: string; // QR code data do Mercado Pago
  orderId?: string; // ID da order do Mercado Pago
  order?: Order; // Order completa do Mercado Pago
}

/**
 * Custom Error class for payment errors with proper stack trace
 */
export class PaymentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    // Mantém o stack trace correto em V8 (Chrome, Node)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentError);
    }
  }
}

class PaymentService {
  private activeTransactions = new Map<string, AbortController>();

  private generateTransactionId(prefix: string): string {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}-${crypto.randomUUID()}`;
      }
    } catch (error) {
      // fallback below
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
  }

  /**
   * Salvar último orderId do terminal para poder cancelar antes de nova ordem
   */
  private saveLastTerminalOrder(orderId: string, terminalId: string): void {
    try {
      localStorage.setItem(LAST_TERMINAL_ORDER_KEY, JSON.stringify({
        orderId,
        terminalId,
        createdAt: Date.now()
      }));
    } catch (e) {
      console.warn('[PaymentService] Erro ao salvar último orderId:', e);
    }
  }

  /**
   * Obter último orderId do terminal
   */
  private getLastTerminalOrder(): { orderId: string; terminalId: string; createdAt: number } | null {
    try {
      const data = localStorage.getItem(LAST_TERMINAL_ORDER_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('[PaymentService] Erro ao ler último orderId:', e);
    }
    return null;
  }

  /**
   * Limpar último orderId do terminal
   */
  private clearLastTerminalOrder(): void {
    try {
      localStorage.removeItem(LAST_TERMINAL_ORDER_KEY);
    } catch (e) {
      console.warn('[PaymentService] Erro ao limpar último orderId:', e);
    }
  }

  /**
   * Cancelar ordem anterior do terminal (se existir) para liberar para nova ordem
   * Isso é importante para self-service onde o cliente pode desistir e voltar
   */
  async clearTerminalForNewOrder(terminalId: string): Promise<void> {
    const lastOrder = this.getLastTerminalOrder();
    
    if (!lastOrder || lastOrder.terminalId !== terminalId) {
      return; // Nenhuma ordem anterior para este terminal
    }

    // Se a ordem foi criada há mais de 5 minutos, provavelmente já expirou
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (lastOrder.createdAt < fiveMinutesAgo) {
      console.log('[PaymentService] Ordem anterior expirada, limpando cache');
      this.clearLastTerminalOrder();
      return;
    }

    const mpAPI = createMercadoPagoAPI();
    if (!mpAPI) {
      this.clearLastTerminalOrder();
      return;
    }

    try {
      console.log('[PaymentService] Verificando ordem anterior:', lastOrder.orderId);
      
      // Verificar status da ordem
      const order = await mpAPI.getOrder(lastOrder.orderId);
      
      // Se já está processada, finalizada ou cancelada, apenas limpar cache
      const finalStatuses = ['processed', 'closed', 'canceled', 'expired', 'rejected'];
      if (finalStatuses.includes(order.status)) {
        console.log('[PaymentService] Ordem anterior já finalizada:', order.status);
        this.clearLastTerminalOrder();
        return;
      }

      // Tentar cancelar ordem pendente
      console.log('[PaymentService] Cancelando ordem anterior pendente:', lastOrder.orderId);
      try {
        await mpAPI.cancelOrder(lastOrder.orderId);
        console.log('[PaymentService] Ordem anterior cancelada com sucesso');
      } catch (cancelError: unknown) {
        // Se erro ao cancelar, pode ser que já está no terminal
        // Nesse caso o cliente precisa cancelar manualmente no terminal
        const message = cancelError instanceof Error ? cancelError.message : String(cancelError);
        console.warn('[PaymentService] Erro ao cancelar ordem anterior (pode estar no terminal):', message);
      }
      
      this.clearLastTerminalOrder();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[PaymentService] Erro ao verificar ordem anterior:', message);
      this.clearLastTerminalOrder();
    }
  }

  /**
   * PIX Payment — MOCK REMOVIDO (Phase 0 Security Hardening)
   *
   * Para PIX real, use processMercadoPagoQR() ou createPayment() via Cloud Functions.
   * @throws PaymentError sempre — mocks não são permitidos em produção.
   */
  async processPixPayment(_amount: number, _orderId: string): Promise<PaymentResult> {
    throw new PaymentError(
      'MOCK_DISABLED',
      'processPixPayment mock foi removido. Use processMercadoPagoQR() ou createPayment() para PIX real.'
    );
  }

  /**
   * Card Payment — MOCK REMOVIDO (Phase 0 Security Hardening)
   *
   * Para cartão card-present, será integrado via PlugPag (Phase 1).
   * Para cartão REST (PagBank), use createPayment() via Cloud Functions com card.encrypted.
   * @throws PaymentError sempre — mocks não são permitidos em produção.
   */
  async processCardPayment(
    _amount: number,
    _cardType: 'credit' | 'debit',
    _orderId: string
  ): Promise<PaymentResult> {
    throw new PaymentError(
      'MOCK_DISABLED',
      'processCardPayment mock foi removido. Use createPayment() com card.encrypted ou PlugPag (Phase 1).'
    );
  }

  /**
   * Cancel active payment transaction
   */
  async cancelPayment(transactionId: string, orderId?: string): Promise<{ canceled: boolean; reason?: string }> {
    // Abortar qualquer requisição ativa localmente
    const controller = this.activeTransactions.get(transactionId);
    if (controller) {
      controller.abort();
      this.activeTransactions.delete(transactionId);
    }

    // Cancelar a ordem remotamente no Mercado Pago (se disponível)
    if (orderId) {
      try {
        const result = await this.cancelMercadoPagoOrder(orderId);
        console.log('[PaymentService] Resultado do cancelamento:', { orderId, ...result });
        return result;
      } catch (err) {
        console.warn('[PaymentService] Falha ao cancelar ordem remotamente. Prosseguindo com cleanup local.', err);
        return { canceled: false, reason: 'error' };
      }
    }
    
    return { canceled: true, reason: 'local_only' };
  }

  /**
   * Cancel all active payments (cleanup)
   */
  async cancelAllPayments(): Promise<void> {
    this.activeTransactions.forEach((controller) => {
      controller.abort();
    });
    this.activeTransactions.clear();
  }

  // ===== MERCADO PAGO INTEGRATION =====

  /**
   * QR Code Payment (Mercado Pago)
   * 
   * Fluxo:
   * 1. Criar order tipo 'qr' via API com config.qr.external_pos_id
   * 2. Exibir QR code para cliente (type_response.qr_data)
   * 3. Aguardar polling do status até 'processed'
   * 4. Retornar sucesso/erro
   * 
   * @param gatewayConfig - Configuração opcional do Firestore (prioridade sobre env vars)
   */
  async processMercadoPagoQR(
    amount: number,
    items: Array<{ title: string; unit_price: string; quantity: number; unit_measure: string; total_amount: string }>,
    externalReference: string,
    externalPosId?: string,
    gatewayConfig?: PaymentGatewayConfig | null
  ): Promise<PaymentResult> {
    // Resolver configuração: Firestore > env vars
    const config = getPaymentConfig(gatewayConfig);
    const finalExternalPosId = externalPosId || config.externalPosId;
    
    const mpAPI = createMercadoPagoAPI({
      accessToken: config.accessToken,
      mode: config.mode,
    });
    
    if (!mpAPI) {
      throw new PaymentError(
        'MP_NOT_CONFIGURED', 
        'Mercado Pago não configurado. Verifique as credenciais no painel Admin ou variáveis de ambiente.'
      );
    }

    try {
      // Validar valor mínimo (Mercado Pago exige >= R$1,00)
      if (amount < MERCADO_PAGO_CONFIG.MIN_AMOUNT) {
        throw new PaymentError(
          'MP_MIN_AMOUNT',
          `Valor mínimo para pagamento é R$ ${MERCADO_PAGO_CONFIG.MIN_AMOUNT.toFixed(2)}. Valor informado: R$ ${amount.toFixed(2)}`
        );
      }

      // Validar POS externo configurado
      if (!finalExternalPosId || finalExternalPosId.length === 0) {
        throw new PaymentError('MP_QR_ERROR', 'EXTERNAL_POS_ID não configurado. Configure no painel Admin > Pagamentos ou defina VITE_MP_EXTERNAL_POS_ID.');
      }

      // Payload 100% aderente à documentação Mercado Pago QR dinâmico
      // CRÍTICO: Todos os valores monetários como STRING com 2 decimais
      // Payload mínimo para reduzir chances de 400 em sandbox
      const orderPayload = {
        type: 'qr' as const,
        external_reference: externalReference,
        description: `Pedido Kiosk #${externalReference}`,
        total_amount: amount.toFixed(2), // STRING com 2 decimais
        config: {
          qr: {
            external_pos_id: finalExternalPosId, // Deve ser igual ao external_id do POS criado
            mode: 'dynamic' as const // QR único por transação
          }
        },
        transactions: {
          payments: [
            {
              amount: amount.toFixed(2) // STRING com 2 decimais
            }
          ]
        },
        // Itens opcionais: omitir para evitar validações de soma em sandbox
      };

      const order = await mpAPI.createOrder(orderPayload);

      // Extrair qr_data da resposta corretamente
      const qrData = order.type_response?.qr_data || '';

      if (!qrData) {
        throw new Error('QR data não retornado pela API Mercado Pago');
      }

      // Order criada com sucesso, aguardar pagamento via polling
      return {
        success: false, // Ainda não pago
        transactionId: order.id,
        orderId: order.id,
        qrData,
        order,
        message: 'QR Code gerado. Aguardando pagamento...'
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      console.error('[PaymentService] Erro ao criar QR Code Mercado Pago:', error);
      throw new PaymentError(
        'MP_QR_ERROR',
        error instanceof Error ? error.message : 'Erro ao gerar QR Code'
      );
    }
  }

  /**
   * Point Payment (Terminal Integrado Mercado Pago)
   * 
   * Fluxo:
   * 1. Verificar terminal disponível (modo PDV)
   * 2. Criar order tipo 'point' com terminal_id e config.point
   * 3. Order enviada automaticamente para o terminal
   * 4. Cliente paga no terminal físico
   * 5. Aguardar confirmação via polling
   * 
   * @param gatewayConfig - Configuração opcional do Firestore (prioridade sobre env vars)
   */
  async processMercadoPagoPoint(
    amount: number,
    items: Array<{ title: string; unit_price: string; quantity: number; unit_measure: string; total_amount: string }>,
    externalReference: string,
    terminalId?: string,
    options?: {
      defaultPaymentType?: 'credit_card' | 'debit_card';
      defaultInstallments?: number;
      installmentsCost?: 'seller' | 'buyer';
      printOnTerminal?: 'receipt' | 'no_ticket';
    },
    gatewayConfig?: PaymentGatewayConfig | null
  ): Promise<PaymentResult> {
    // Resolver configuração: Firestore > env vars
    const config = getPaymentConfig(gatewayConfig);
    
    const mpAPI = createMercadoPagoAPI({
      accessToken: config.accessToken,
      mode: config.mode,
    });
    
    if (!mpAPI) {
      throw new PaymentError(
        'MP_NOT_CONFIGURED', 
        'Mercado Pago não configurado. Verifique as credenciais no painel Admin ou variáveis de ambiente.'
      );
    }

    try {
      // Validar valor mínimo (Mercado Pago exige >= R$1,00)
      if (amount < MERCADO_PAGO_CONFIG.MIN_AMOUNT) {
        throw new PaymentError(
          'MP_MIN_AMOUNT',
          `Valor mínimo para pagamento é R$ ${MERCADO_PAGO_CONFIG.MIN_AMOUNT.toFixed(2)}. Valor informado: R$ ${amount.toFixed(2)}`
        );
      }

      // Se não tiver terminal_id, usar do config ou buscar primeiro disponível em modo PDV
      let finalTerminalId = terminalId || config.terminalId;
      
      if (!finalTerminalId) {
        console.log('[PaymentService Point] Terminal não configurado, buscando automaticamente...');
        const terminalsResponse = await mpAPI.listTerminals({ limit: 10 });
        const pdvTerminal = terminalsResponse.data.terminals.find(
          t => t.operating_mode === 'PDV'
        );
        
        if (!pdvTerminal) {
          throw new Error('Nenhum terminal Point em modo PDV disponível. Configure um terminal no painel do Mercado Pago ou defina VITE_MP_TERMINAL_ID.');
        }
        
        finalTerminalId = pdvTerminal.id;
        console.log('[PaymentService Point] Terminal auto-detectado:', finalTerminalId);
      } else {
        // Validar que o terminal fornecido existe e está em modo PDV
        console.log('[PaymentService Point] Verificando terminal configurado:', finalTerminalId);
        const terminalsResponse = await mpAPI.listTerminals({ limit: 50 });
        const providedTerminal = terminalsResponse.data.terminals.find(
          t => t.id === finalTerminalId
        );
        
        if (!providedTerminal) {
          throw new Error(`Terminal ${finalTerminalId} não encontrado. Verifique o ID do terminal no painel do Mercado Pago.`);
        }
        
        if (providedTerminal.operating_mode !== 'PDV') {
          throw new Error(`Terminal ${finalTerminalId} não está em modo PDV (modo atual: ${providedTerminal.operating_mode}). Configure o terminal para modo PDV no painel do Mercado Pago.`);
        }
        
        console.log('[PaymentService Point] Terminal validado em modo PDV');
      }

      // SELF-SERVICE: Limpar terminal de ordens anteriores pendentes ANTES de criar nova
      console.log('[PaymentService Point] Limpando terminal de ordens anteriores...');
      await this.clearTerminalForNewOrder(finalTerminalId);

      // Payload conforme documentação oficial Mercado Pago Point
      // CRÍTICO: amount como STRING com 2 decimais, expiration_time no formato ISO 8601 duration
      // Montar config.payment_method conforme tipo de pagamento
      // Só incluir payment_method se um tipo for especificado
      let paymentMethodConfig: Record<string, any> | undefined = undefined;
      if (options?.defaultPaymentType) {
        paymentMethodConfig = {
          default_type: options.defaultPaymentType
        };
        if (options.defaultPaymentType === 'credit_card') {
          paymentMethodConfig.default_installments = options?.defaultInstallments || 1;
          paymentMethodConfig.installments_cost = options?.installmentsCost || 'seller';
        }
      }

      // Montar config base
      const configPayload: Record<string, any> = {
        point: {
          terminal_id: finalTerminalId,
          print_on_terminal: options?.printOnTerminal || 'no_ticket' as const
        }
      };
      
      // Só incluir payment_method se configurado
      if (paymentMethodConfig) {
        configPayload.payment_method = paymentMethodConfig;
      }

      // Payload conforme documentação oficial Mercado Pago Point
      // IMPORTANTE: Point NÃO aceita total_amount na raiz - apenas transactions.payments[].amount
      const orderPayload = {
        type: 'point' as const,
        external_reference: externalReference,
        description: `Pedido Kiosk #${externalReference}`,
        expiration_time: config.pointExpirationTime,
        transactions: {
          payments: [
            {
              amount: amount.toFixed(2) // STRING com 2 decimais
            }
          ]
        },
        config: configPayload
      };

      console.log('[PaymentService Point] Criando order:', {
        terminalId: finalTerminalId,
        amount: amount.toFixed(2),
        externalReference,
        paymentType: options?.defaultPaymentType || 'any',
        expirationTime: config.pointExpirationTime,
        configSource: config.source,
      });
      
      // Log do payload completo para debug (apenas em desenvolvimento)
      if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
        console.log('[PaymentService Point] Full payload:', JSON.stringify(orderPayload, null, 2));
      }

      // Tentar criar order com retry automático para erro 409
      let order;
      let lastError;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          order = await mpAPI.createOrder(orderPayload);
          break; // Sucesso, sair do loop
        } catch (createError: unknown) {
          lastError = createError;
          
          // Se for erro 409, esperar e tentar novamente
          const errorMessage = createError instanceof Error ? createError.message : String(createError);
          if (errorMessage.includes('409') && attempt < maxRetries) {
            console.log(`[PaymentService Point] Terminal ocupado, aguardando... (tentativa ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2 segundos
            
            // Tentar limpar novamente antes do retry
            await this.clearTerminalForNewOrder(finalTerminalId);
            continue;
          }
          
          throw createError;
        }
      }
      
      if (!order) {
        throw lastError || new Error('Falha ao criar order após múltiplas tentativas');
      }

      console.log('[PaymentService Point] Order criada com sucesso:', {
        orderId: order.id,
        status: order.status,
        terminalId: finalTerminalId,
      });

      // Salvar orderId para poder limpar o terminal em caso de nova ordem
      this.saveLastTerminalOrder(order.id, finalTerminalId);

      // Order criada e enviada automaticamente ao terminal
      return {
        success: false, // Ainda não pago - status será 'created' ou 'at_terminal'
        transactionId: order.id,
        orderId: order.id,
        order,
        message: 'Pedido enviado ao terminal. Aguardando pagamento...'
      };
    } catch (error) {
      console.error('[PaymentService Point] Erro ao processar pagamento:', error);
      
      // Tratar erro 409 (terminal ocupado com outra transação)
      if (error instanceof Error && error.message.includes('409')) {
        throw new PaymentError(
          'MP_TERMINAL_BUSY',
          'Terminal ocupado. Cancele a operação atual no terminal físico e tente novamente.'
        );
      }
      
      throw new PaymentError(
        'MP_POINT_ERROR',
        error instanceof Error ? error.message : 'Erro ao processar no terminal'
      );
    }
  }

  /**
   * Consultar status de uma order do Mercado Pago
   */
  async checkMercadoPagoOrderStatus(orderId: string, signal?: AbortSignal): Promise<Order> {
    const mpAPI = createMercadoPagoAPI();
    
    if (!mpAPI) {
      throw new PaymentError(
        'MP_NOT_CONFIGURED', 
        'Mercado Pago não configurado.'
      );
    }

    return mpAPI.getOrder(orderId, signal);
  }

  /**
   * Buscar dados do cliente a partir de uma order aprovada do Mercado Pago.
   * 
   * A API de Orders (v1/orders) NÃO retorna dados do pagador.
   * Para isso, usamos a API de Payments (v1/payments/{id}) que retorna:
   * - payer.first_name, payer.last_name, payer.email
   * - card.cardholder.name, card.last_four_digits
   * - payment_method_id (visa, master, pix), installments
   * 
   * @param order - Order aprovada retornada pelo polling
   * @param gatewayConfig - Config opcional do Firestore
   * @returns Dados do cliente para gravar no Firestore, ou null em erro
   */
  async fetchPayerDataFromOrder(
    order: Order,
    gatewayConfig?: PaymentGatewayConfig | null
  ): Promise<OrderCustomerData | null> {
    try {
      const config = getPaymentConfig(gatewayConfig);
      const mpAPI = createMercadoPagoAPI({
        accessToken: config.accessToken,
        mode: config.mode,
      });

      if (!mpAPI) {
        console.warn('[PaymentService] MP não configurado para fetch de payer data');
        return null;
      }

      // Extrair payment ID da order — é o ID da transação de pagamento
      const paymentId = order.transactions?.payments?.[0]?.id;
      if (!paymentId) {
        console.warn('[PaymentService] Order sem payment ID, não é possível buscar dados do pagador');
        // Retornar ao menos os dados disponíveis na order
        return {
          gatewayProvider: 'mercado_pago',
          gatewayOrderId: order.id,
          cardLastDigits: order.transactions?.payments?.[0]?.card?.last_digits,
        };
      }

      console.log('[PaymentService] Buscando dados do pagador via /v1/payments/', paymentId);

      const payment = await mpAPI.getPayment(paymentId);

      // Montar nome do cliente com prioridade:
      // 1. cardholder.name (nome impresso no cartão — mais confiável para cartão)
      // 2. payer.first_name + payer.last_name (dados do conta MP — melhor para PIX)
      const cardholderName = payment.card?.cardholder?.name;
      const payerFullName = [payment.payer?.first_name, payment.payer?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      
      const customerName = cardholderName || payerFullName || undefined;

      const result: OrderCustomerData = {
        customerName,
        customerEmail: payment.payer?.email || undefined,
        customerIdentification: payment.payer?.identification?.number || undefined,
        gatewayProvider: 'mercado_pago',
        gatewayOrderId: order.id,
        gatewayPaymentId: paymentId,
        paymentMethodId: payment.payment_method_id || undefined,
        paymentTypeId: payment.payment_type_id || undefined,
        cardBrand: payment.payment_method_id || undefined,
        cardLastDigits: payment.card?.last_four_digits || order.transactions?.payments?.[0]?.card?.last_digits || undefined,
        cardholderName: cardholderName || undefined,
        installments: payment.installments || undefined,
        dateApproved: payment.date_approved || undefined,
      };

      console.log('[PaymentService] Dados do pagador obtidos:', {
        customerName: result.customerName ? '***' : 'N/A',
        hasEmail: !!result.customerEmail,
        cardBrand: result.cardBrand,
        cardLastDigits: result.cardLastDigits,
        installments: result.installments,
      });

      return result;
    } catch (error) {
      // Não bloquear o fluxo principal — dados do pagador são opcionais
      console.warn('[PaymentService] Erro ao buscar dados do pagador (não-bloqueante):', error);
      return {
        gatewayProvider: 'mercado_pago',
        gatewayOrderId: order.id,
        gatewayPaymentId: order.transactions?.payments?.[0]?.id,
        cardLastDigits: order.transactions?.payments?.[0]?.card?.last_digits,
      };
    }
  }

  /**
   * Cancelar order do Mercado Pago
   * 
   * IMPORTANTE: Só é possível cancelar ordens com status 'created'.
   * Se a ordem já está 'at_terminal', 'processed', etc., a API retorna erro.
   * Nesses casos, apenas logamos warning e não lançamos exceção.
   */
  async cancelMercadoPagoOrder(orderId: string): Promise<{ canceled: boolean; reason?: string }> {
    const mpAPI = createMercadoPagoAPI();
    
    if (!mpAPI) {
      throw new PaymentError(
        'MP_NOT_CONFIGURED', 
        'Mercado Pago não configurado.'
      );
    }

    try {
      // Primeiro verificar status atual da ordem
      const order = await mpAPI.getOrder(orderId);
      
      // Ordens já finalizadas não precisam ser canceladas
      if (order.status === 'canceled') {
        console.log('[PaymentService] Ordem já está cancelada:', orderId);
        return { canceled: true, reason: 'already_canceled' };
      }
      
      if (order.status === 'processed' || order.status === 'closed') {
        console.log('[PaymentService] Ordem já foi processada, não pode cancelar:', orderId);
        return { canceled: false, reason: 'already_processed' };
      }
      
      if (order.status === 'at_terminal') {
        // Ordem está no terminal físico - cliente pode cancelar no próprio terminal
        console.log('[PaymentService] Ordem está no terminal, cancelamento via API não permitido:', orderId);
        return { canceled: false, reason: 'at_terminal' };
      }
      
      // Só tenta cancelar se status for 'created'
      if (order.status === 'created') {
        await mpAPI.cancelOrder(orderId);
        console.log('[PaymentService] Ordem cancelada com sucesso:', orderId);
        return { canceled: true };
      }
      
      // Status desconhecido - tenta cancelar mesmo assim
      console.warn('[PaymentService] Status inesperado, tentando cancelar:', order.status);
      await mpAPI.cancelOrder(orderId);
      return { canceled: true };
      
    } catch (error: unknown) {
      // Erros esperados da API
      const errorCode = error instanceof Error ? error.message : String(error);
      
      if (errorCode.includes('already_canceled') || errorCode.includes('order_already_canceled')) {
        return { canceled: true, reason: 'already_canceled' };
      }
      
      if (errorCode.includes('cannot_cancel') || errorCode.includes('at_terminal')) {
        return { canceled: false, reason: 'at_terminal' };
      }
      
      // Erro inesperado - propagar
      console.error('[PaymentService] Erro ao cancelar ordem:', error);
      throw error;
    }
  }

  // ===== GENERIC PAYMENT (Cloud Functions) =====

  /**
   * Criar pagamento via Cloud Function (gateway selecionado no backend)
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResponse> {
    const app = getFirebaseApp();
    const functions = getFunctions(app, 'southamerica-east1');
    const createPaymentFn = httpsCallable<CreatePaymentInput, CreatePaymentResponse>(functions, 'createPayment');

    const response = await createPaymentFn(input);
    return response.data;
  }

  /**
   * Escuta atualizações de status de pagamento no Firestore
   */
  watchPaymentStatus(
    paymentId: string,
    onUpdate: (payment: PaymentRecord) => void,
    options?: {
      storeId?: string;
      franchiseId?: string;
      onError?: (error: Error) => void;
    }
  ): () => void {
    const storeId = options?.storeId || getCurrentStoreId();
    const franchiseId = options?.franchiseId || getCurrentFranchiseId();

    if (!storeId || !franchiseId) {
      throw new PaymentError('PAYMENT_CONTEXT', 'storeId/franchiseId ausente para acompanhar pagamento');
    }

    const db = getFirebaseDb();
    const paymentRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'payments', paymentId);

    return onSnapshot(
      paymentRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as Omit<PaymentRecord, 'id'>;
        onUpdate({ id: snapshot.id, ...data });
      },
      (error) => {
        console.error('[PaymentService] Erro ao escutar pagamento:', error);
        options?.onError?.(error as Error);
      }
    );
  }

  /**
   * Marcar ordem do terminal como concluída (limpa cache para próxima ordem)
   * Chamar após pagamento aprovado ou cancelamento bem-sucedido
   */
  markTerminalOrderComplete(): void {
    this.clearLastTerminalOrder();
    console.log('[PaymentService] Terminal liberado para nova ordem');
  }

  // ===== PAGBANK CANCELLATION (KIO-03/KIO-04 fix) =====

  /**
   * Cancelar pagamento PagBank via Cloud Function.
   * Se cancelamento real não for suportado pelo provider, marca como
   * `cancel_requested` no Firestore para reconciliação via webhook/polling.
   *
   * @param paymentId - ID do documento em franchises/{fid}/stores/{sid}/payments/{pid}
   * @param options - storeId/franchiseId (opcionais, usa contexto atual se ausentes)
   */
  async cancelPagBankPayment(
    paymentId: string,
    options?: { storeId?: string; franchiseId?: string }
  ): Promise<{ canceled: boolean; reason?: string }> {
    const storeId = options?.storeId || getCurrentStoreId();
    const franchiseId = options?.franchiseId || getCurrentFranchiseId();

    if (!storeId || !franchiseId || !paymentId) {
      console.warn('[PaymentService] cancelPagBankPayment: missing ids', { paymentId, storeId, franchiseId });
      return { canceled: false, reason: 'missing_ids' };
    }

    try {
      const app = getFirebaseApp();
      const functions = getFunctions(app, 'southamerica-east1');
      const cancelFn = httpsCallable<
        { franchiseId: string; storeId: string; paymentId: string },
        { canceled: boolean; reason?: string }
      >(functions, 'cancelPagBankPayment');

      const result = await cancelFn({ franchiseId, storeId, paymentId });
      console.log('[PaymentService] PagBank cancel result:', result.data);
      return result.data;
    } catch (error) {
      // Fallback: marcar localmente como cancel_requested
      // O webhook/polling deverá detectar e reconciliar
      console.warn('[PaymentService] cancelPagBankPayment Cloud Function failed:', error);
      return { canceled: false, reason: 'cancel_function_unavailable' };
    }
  }
}

export const paymentService = new PaymentService();



