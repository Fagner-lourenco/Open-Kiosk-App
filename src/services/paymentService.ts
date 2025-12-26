/**
 * Payment Service - Mock implementation ready for production
 * 
 * Para produção:
 * - PIX: Substituir mock por webhook listener real
 * - Cartão: Integrar SDK da máquina (Stone, Cielo, PagSeguro, etc)
 * - Mercado Pago: Integração via Point API (QR Code e PDV integrado)
 */

import { createMercadoPagoAPI } from './mercadopagoAPI';
import type { Order } from '@/types/mercadopago';

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  message?: string;
  pixCode?: string; // QR code data para PIX
  qrData?: string; // QR code data do Mercado Pago
  orderId?: string; // ID da order do Mercado Pago
  order?: Order; // Order completa do Mercado Pago
}

export interface PaymentError {
  code: string;
  message: string;
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
   * PIX Payment - Mock implementation
   * 
   * Produção: 
   * 1. Gerar QR code via API do banco
   * 2. Registrar webhook listener
   * 3. Aguardar confirmação via webhook (timeout 5min)
   */
  async processPixPayment(amount: number, orderId: string): Promise<PaymentResult> {
    const controller = new AbortController();
    const transactionId = this.generateTransactionId('PIX');
    
    this.activeTransactions.set(transactionId, controller);

    try {
      // Mock: Gerar QR code (em produção: chamar API do banco)
      const pixCode = this.generateMockPixQRCode(amount, orderId);

      // Mock: Simular tempo de confirmação (em produção: webhook listener)
      await this.simulatePaymentConfirmation(3000, controller.signal);

      this.activeTransactions.delete(transactionId);

      return {
        success: true,
        transactionId,
        pixCode,
        message: "Pagamento PIX confirmado"
      };
    } catch (error) {
      this.activeTransactions.delete(transactionId);
      
      if ((error as Error).name === 'AbortError') {
        throw { code: 'PAYMENT_CANCELLED', message: 'Pagamento cancelado pelo usuário' };
      }
      
      throw { code: 'PIX_ERROR', message: 'Erro ao processar PIX' };
    }
  }

  /**
   * Card Payment (Credit/Debit) - Mock implementation
   * 
   * Produção:
   * 1. Integrar SDK da máquina de cartão
   * 2. Enviar request para SDK
   * 3. Aguardar aprovação (timeout 30s)
   */
  async processCardPayment(
    amount: number, 
    cardType: 'credit' | 'debit',
    orderId: string
  ): Promise<PaymentResult> {
    const controller = new AbortController();
    const transactionId = this.generateTransactionId(`CARD-${cardType.toUpperCase()}`);
    
    this.activeTransactions.set(transactionId, controller);

    try {
      // Mock: Simular comunicação com SDK (em produção: SDK real)
      // Ex: await cardSDK.processPayment({ amount, type: cardType })
      await this.simulatePaymentConfirmation(4000, controller.signal);

      this.activeTransactions.delete(transactionId);

      return {
        success: true,
        transactionId,
        message: `Pagamento ${cardType === 'credit' ? 'crédito' : 'débito'} aprovado`
      };
    } catch (error) {
      this.activeTransactions.delete(transactionId);
      
      if ((error as Error).name === 'AbortError') {
        throw { code: 'PAYMENT_CANCELLED', message: 'Pagamento cancelado pelo usuário' };
      }
      
      throw { code: 'CARD_ERROR', message: 'Erro ao processar cartão' };
    }
  }

  /**
   * Cancel active payment transaction
   */
  async cancelPayment(transactionId: string): Promise<void> {
    const controller = this.activeTransactions.get(transactionId);
    
    if (controller) {
      controller.abort();
      this.activeTransactions.delete(transactionId);
    }
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

  // ===== MOCK HELPERS (remover em produção) =====

  private generateMockPixQRCode(amount: number, orderId: string): string {
    // Mock: Em produção, retornar QR code real da API do banco
    return `00020126580014br.gov.bcb.pix0136${orderId}5204000053039865802BR5925KIOSK STORE6009SAO PAULO62070503***6304${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }

  private async simulatePaymentConfirmation(delayMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve();
      }, delayMs);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException('Payment cancelled', 'AbortError'));
      });
    });
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
   */
  async processMercadoPagoQR(
    amount: number,
    items: Array<{ title: string; unit_price: string; quantity: number; unit_measure: string; total_amount: string }>,
    externalReference: string,
    externalPosId: string = 'LOJ001POS001' // POS padrão
  ): Promise<PaymentResult> {
    const mpAPI = createMercadoPagoAPI();
    
    if (!mpAPI) {
      throw { 
        code: 'MP_NOT_CONFIGURED', 
        message: 'Mercado Pago não configurado. Verifique as variáveis de ambiente.' 
      };
    }

    try {
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
            external_pos_id: externalPosId, // Deve ser igual ao external_id do POS criado
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

      console.log('[PaymentService] Criando order com payload:', JSON.stringify(orderPayload, null, 2));

      const order = await mpAPI.createOrder(orderPayload);

      // Extrair qr_data da resposta corretamente
      const qrData = order.type_response?.qr_data || '';

      if (!qrData) {
        throw new Error('QR data não retornado pela API Mercado Pago');
      }

      console.log('[PaymentService] Order criada com sucesso:', {
        orderId: order.id,
        status: order.status,
        amount: order.total_amount
      });

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
      console.error('[PaymentService] Erro ao criar QR Code Mercado Pago:', error);
      throw {
        code: 'MP_QR_ERROR',
        message: error instanceof Error ? error.message : 'Erro ao gerar QR Code'
      };
    }
  }

  /**
   * Point Payment (Terminal Integrado Mercado Pago)
   * 
   * Fluxo conforme documentação oficial:
   * 1. Verificar terminal disponível (modo PDV)
   * 2. Criar order tipo 'point' com terminal_id e config.point
   * 3. Order enviada automaticamente para o terminal
   * 4. Cliente paga no terminal físico
   * 5. Aguardar via polling (preferencial) ou webhook
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
    }
  ): Promise<PaymentResult> {
    const mpAPI = createMercadoPagoAPI();
    
    if (!mpAPI) {
      throw { 
        code: 'MP_NOT_CONFIGURED', 
        message: 'Mercado Pago não configurado. Verifique as variáveis de ambiente.' 
      };
    }

    try {
      // Se não tiver terminal_id, buscar primeiro disponível em modo PDV
      let finalTerminalId = terminalId;
      
      if (!finalTerminalId) {
        console.log('[PaymentService Point] Buscando terminal em modo PDV...');
        const terminalsResponse = await mpAPI.listTerminals({ limit: 10 });
        const pdvTerminal = terminalsResponse.data.terminals.find(
          t => t.operating_mode === 'PDV'
        );
        
        if (!pdvTerminal) {
          throw new Error('Nenhum terminal Point em modo PDV disponível. Configure um terminal no painel do Mercado Pago.');
        }
        
        finalTerminalId = pdvTerminal.id;
        console.log('[PaymentService Point] Terminal encontrado:', finalTerminalId);
      }

      // Payload conforme documentação oficial Mercado Pago Point
      // CRÍTICO: amount como STRING com 2 decimais, expiration_time no formato ISO 8601 duration
      const orderPayload = {
        type: 'point' as const,
        external_reference: externalReference,
        description: `Pedido Kiosk #${externalReference}`,
        expiration_time: 'PT5M', // 5 minutos para o cliente pagar
        transactions: {
          payments: [
            {
              amount: amount.toFixed(2) // STRING com 2 decimais
            }
          ]
        },
        config: {
          point: {
            terminal_id: finalTerminalId,
            print_on_terminal: options?.printOnTerminal || 'no_ticket' as const
          },
          payment_method: {
            default_type: options?.defaultPaymentType,
            default_installments: options?.defaultInstallments || 1,
            installments_cost: options?.installmentsCost || 'seller'
          }
        }
      };

      console.log('[PaymentService Point] Criando order:', JSON.stringify(orderPayload, null, 2));

      const order = await mpAPI.createOrder(orderPayload);

      console.log('[PaymentService Point] Order criada com sucesso:', {
        orderId: order.id,
        status: order.status,
        terminalId: finalTerminalId
      });

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
      throw {
        code: 'MP_POINT_ERROR',
        message: error instanceof Error ? error.message : 'Erro ao processar no terminal'
      };
    }
  }

  /**
   * Consultar status de uma order do Mercado Pago
   */
  async checkMercadoPagoOrderStatus(orderId: string, signal?: AbortSignal): Promise<Order> {
    const mpAPI = createMercadoPagoAPI();
    
    if (!mpAPI) {
      throw { 
        code: 'MP_NOT_CONFIGURED', 
        message: 'Mercado Pago não configurado.' 
      };
    }

    return mpAPI.getOrder(orderId, signal);
  }

  /**
   * Cancelar order do Mercado Pago
   */
  async cancelMercadoPagoOrder(orderId: string): Promise<void> {
    const mpAPI = createMercadoPagoAPI();
    
    if (!mpAPI) {
      throw { 
        code: 'MP_NOT_CONFIGURED', 
        message: 'Mercado Pago não configurado.' 
      };
    }

    await mpAPI.cancelOrder(orderId);
  }
}

export const paymentService = new PaymentService();

