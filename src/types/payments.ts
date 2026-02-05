export type PaymentMethod = 'pix' | 'credit' | 'debit';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'expired'
  | 'refunded';

export interface PaymentCustomer {
  name: string;
  taxId: string;
  email?: string;
  phone?: string;
}

export interface PaymentCard {
  number: string;
  expMonth: string;
  expYear: string;
  securityCode: string;
  holderName: string;
  holderTaxId: string;
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
  providerOrderId?: string;
  providerPaymentId?: string;
}

export interface PaymentRecord {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: string;
  orderId?: string;
  pix?: PaymentPixPayload;
  providerOrderId?: string;
  providerPaymentId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  error?: string;
}
