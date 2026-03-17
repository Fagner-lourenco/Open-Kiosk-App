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

/**
 * Card data for PagBank REST payments.
 *
 * Phase 0 Security Hardening: Raw PAN/CVV fields removed.
 * The frontend encrypts card data using PagBank.js SDK (publicKey) and sends
 * only the opaque `encrypted` token. The Cloud Function forwards it to PagBank
 * without ever seeing raw card numbers.
 *
 * For card-present (PlugPag Phase 1+), this interface is NOT used —
 * the terminal handles card data entirely on-device.
 */
export interface PaymentCard {
  /** Opaque encrypted blob from PagBank.js `PagSeguro.encryptCard()` */
  encrypted: string;
  /**
   * PII — persist only if business-critical; never log/analytics.
   * @pii
   */
  holderName?: string;
  /** Holder tax ID (CPF). Used by PagBank for anti-fraud. */
  holderTaxId?: string;
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
}

export interface NormalizedPaymentGatewayConfig {
  /**
   * Payment provider (canonical form)
   *
   * NOTE: Legacy 'mercadopago' is automatically converted to canonical
   * 'mercado_pago' at runtime. This ensures type safety while maintaining
   * backward compatibility with existing Firestore documents.
   *
   * @see normalizePaymentGatewayConfig() - Handles normalization
   */
  provider: 'none' | 'mercado_pago' | 'pagbank';
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
  /** MP channel used: 'qr' or 'point' */
  channel?: 'qr' | 'point';
  orderId?: string;
  referenceId?: string;
  environment?: 'sandbox' | 'production';
  pix?: PaymentPixPayload;
  providerOrderId?: string;
  providerPaymentId?: string;
  customer?: PaymentCustomer;
  cardLast4?: string;
  /** Raw provider-side status (e.g. 'at_terminal', 'processed') for granular UI */
  providerStatus?: string;
  cancelRequested?: boolean;
  cancelRequestedAt?: string;
  requiresRefund?: boolean;
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
  /** MP channel: 'qr' or 'point' */
  channel?: 'qr' | 'point';
  items: PaymentItemInput[];
  customer?: PaymentCustomer;
  card?: PaymentCard;
  expiresAt?: string;
}

/**
 * Allowlisted metadata from the payment provider response.
 * Never store the full raw response — filter to these safe fields only.
 */
export interface ProviderMetadata {
  orderId?: string;
  chargeId?: string;
  status?: string;
  cardBrand?: string;
  cardLast4?: string;
  nsu?: string;
  authorizationCode?: string;
}

export interface ProviderCreatePaymentResult {
  status: PaymentStatus;
  providerOrderId?: string;
  providerPaymentId?: string;
  pix?: PaymentPixPayload;
  /** QR code data string for MP QR dynamic payments */
  qrData?: string;
  /** Allowlisted provider metadata. Never store full raw response. */
  providerMetadata?: ProviderMetadata;
  /** @deprecated Use providerMetadata. Will be removed. */
  raw?: never;
}

export interface ProviderPaymentStatusResult {
  status: PaymentStatus;
  /** Raw provider-side status string (e.g. 'at_terminal', 'processed') */
  providerStatus?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  pix?: PaymentPixPayload;
  /** Allowlisted provider metadata. Never store full raw response. */
  providerMetadata?: ProviderMetadata;
  /** @deprecated Use providerMetadata. Will be removed. */
  raw?: never;
}

export interface PaymentProvider {
  createPayment: (input: ProviderCreatePaymentInput) => Promise<ProviderCreatePaymentResult>;
  getPaymentStatus?: (payment: PaymentRecord) => Promise<ProviderPaymentStatusResult>;
}
