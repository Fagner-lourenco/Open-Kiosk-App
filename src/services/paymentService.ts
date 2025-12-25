/**
 * Payment Service - Mock implementation ready for production
 * 
 * Para produção:
 * - PIX: Substituir mock por webhook listener real
 * - Cartão: Integrar SDK da máquina (Stone, Cielo, PagSeguro, etc)
 */

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  message?: string;
  pixCode?: string; // QR code data para PIX
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
}

export const paymentService = new PaymentService();
