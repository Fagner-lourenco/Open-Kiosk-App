export type PaymentMethod = 'pix' | 'credit' | 'debit';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'expired'
  | 'refunded';

export interface PaymentItemInput {
  name: string;
  quantity: number;
  unitAmount: number;
}

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

export interface NormalizedPaymentGatewayConfig {
  provider: 'none' | 'mercado_pago' | 'mercadopago' | 'pagbank';
  environment: 'sandbox' | 'production';
  enabledMethods: {
    cash: boolean;
    pix: boolean;
    credit: boolean;
    debit: boolean;
  };
  pixKey?: string;
  providers?: {
    pagbank?: {
      clientId?: string;
      merchantId?: string;
      publicKey?: string;
    };
    mercadopago?: {
      userId?: string;
      storeId?: string;
      externalPosId?: string;
      terminalId?: string;
    };
  };
  qrExpirationMinutes?: number;
}

export interface PaymentRecord {
  id?: string;
  franchiseId: string;
  storeId: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: string;
  orderId?: string;
  referenceId?: string;
  environment?: 'sandbox' | 'production';
  pix?: PaymentPixPayload;
  providerOrderId?: string;
  providerPaymentId?: string;
  customer?: PaymentCustomer;
  cardLast4?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  error?: string;
}

export interface ProviderCreatePaymentInput {
  paymentId: string;
  referenceId: string;
  orderId?: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  items: PaymentItemInput[];
  customer?: PaymentCustomer;
  card?: PaymentCard;
  expiresAt?: string;
}

export interface ProviderCreatePaymentResult {
  status: PaymentStatus;
  providerOrderId?: string;
  providerPaymentId?: string;
  pix?: PaymentPixPayload;
  raw?: unknown;
}

export interface ProviderPaymentStatusResult {
  status: PaymentStatus;
  providerPaymentId?: string;
  providerOrderId?: string;
  pix?: PaymentPixPayload;
  raw?: unknown;
}

export interface PaymentProvider {
  createPayment: (input: ProviderCreatePaymentInput) => Promise<ProviderCreatePaymentResult>;
  getPaymentStatus?: (payment: PaymentRecord) => Promise<ProviderPaymentStatusResult>;
}
