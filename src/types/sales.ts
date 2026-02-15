export type PaymentMethod =
  | 'pix_qr'
  | 'credit_card'
  | 'debit_card'
  | 'mercadopago_qr'
  | 'mercadopago_point'
  | 'cash'
  | 'unknown';

export interface SaleTimingData {
  timestamp: Date;
  date: string; // YYYY-MM-DD
  hourOfDay: number; // 0-23
  dayOfWeek: number; // 0=Sunday
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
  isWeekend: boolean;
  isHoliday?: boolean;
}

export interface SaleItem {
  productId: string;
  title: string;
  quantity: number;
  total: number; // Valor total (quantity * unitPrice) ou apenas total
  total_amount?: number; // Alternativa encontrada em alguns lugares
  unitPrice?: number;
  currency?: string;
  [key: string]: any; // Permite flexibilidade para outros campos legados
}

/**
 * Dados do cliente associados a um pedido.
 * Gravados na coleção `orders/{orderNumber}` para ambos os gateways (MP e PagBank).
 * Utilizados para ranking de clientes e analytics.
 */
export interface OrderCustomerData {
  // Dados do cliente (para ranking / fidelidade)
  customerName?: string;
  customerEmail?: string;
  customerIdentification?: string; // CPF/CNPJ

  // Rastreamento do gateway
  gatewayProvider?: 'mercado_pago' | 'pagbank';
  gatewayOrderId?: string;    // MP orderId ou PagBank orderId
  gatewayPaymentId?: string;  // MP paymentId ou PagBank chargeId

  // Dados do pagamento
  paymentMethodId?: string;   // 'visa', 'master', 'pix', etc.
  paymentTypeId?: string;     // 'credit_card', 'debit_card', 'bank_transfer'
  cardBrand?: string;
  cardLastDigits?: string;
  cardholderName?: string;
  installments?: number;
  dateApproved?: string;
}
