export type PaymentMethod = 'pix' | 'credit' | 'debit';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'expired'
  | 'refunded'
  | 'paid_pending_dispense'
  | 'dispensed'
  | 'failed_needs_compensation';

export type OrderStatus =
  | 'pending'
  | 'paid_pending_dispense'
  | 'dispensing'
  | 'completed'
  | 'failed_dispense'
  | 'compensation_pending'
  | 'compensated';

export type DispenseStatus =
  | 'pending'
  | 'dispensing'
  | 'dispensed'
  | 'failed'
  | 'failed_dispense';

export interface PaymentCustomer {
  name: string;
  taxId: string;
  email?: string;
  phone?: string;
}

/**
 * Card data for PagBank REST payments (Phase 0 Security Hardening).
 *
 * Raw PAN/CVV fields removed. The frontend encrypts card data using
 * PagBank.js SDK (`PagSeguro.encryptCard()`) and sends only the opaque
 * `encrypted` token to Cloud Functions.
 *
 * For card-present (PlugPag Phase 1+), this interface is NOT used.
 */
export interface PaymentCard {
  /** Opaque encrypted blob from PagBank.js */
  encrypted: string;
  /** @pii — holder name (optional, masked before persist) */
  holderName?: string;
  /** Holder CPF for anti-fraud */
  holderTaxId?: string;
}

export interface PaymentItemInput {
  name: string;
  quantity: number;
  unitAmount: number;
}

export interface CreatePaymentInput {
  franchiseId: string;
  storeId: string;
  orderId?: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  /** MP channel: 'qr' or 'point'. Required when provider is mercado_pago. */
  channel?: 'qr' | 'point';
  /** Tap ID — resolve terminal/POS por torneira quando configurado. */
  tapId?: string;
  items: PaymentItemInput[];
  customer?: PaymentCustomer;
  card?: PaymentCard;
}

export interface PaymentPixPayload {
  qrCodeText?: string;
  qrCodeImage?: string;
  expiresAt?: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  pix?: PaymentPixPayload;
  /** QR code data string for MP QR dynamic payments */
  qrData?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  /** Últimos 4 dígitos do cartão (quando pagamento é card) */
  cardLast4?: string;
  /** Primeiros 6 dígitos do cartão (BIN) */
  cardFirst6?: string;
}

export interface PaymentRecord {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** MP channel used: 'qr' or 'point' */
  channel?: 'qr' | 'point';
  orderId?: string;
  pix?: PaymentPixPayload;
  providerOrderId?: string;
  providerPaymentId?: string;
  /** Raw provider-side status (e.g. 'at_terminal', 'processed') for granular UI */
  providerStatus?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  error?: string;
  /** Últimos 4 dígitos do cartão (quando pagamento é card) */
  cardLast4?: string;
  /** Primeiros 6 dígitos do cartão (BIN) */
  cardFirst6?: string;
}
