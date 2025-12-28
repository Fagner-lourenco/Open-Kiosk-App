/**
 * Mercado Pago Point Integration Types
 * Baseado na documentação oficial: https://www.mercadopago.com.br/developers/pt/reference
 */

export type OrderStatus = 'created' | 'at_terminal' | 'opened' | 'processed' | 'closed' | 'canceled' | 'expired' | 'failed' | 'action_required';
export type PaymentStatus = 'created' | 'pending' | 'approved' | 'declined' | 'refunded' | 'processed';
export type OrderType = 'point' | 'qr';
export type OperatingMode = 'PDV' | 'STANDALONE' | 'UNDEFINED';

export interface MercadoPagoConfig {
  accessToken: string;
  userId?: string;
  baseUrl: string;
  mode: 'sandbox' | 'production';
  externalReference?: string;
  notificationUrl?: string;
}

export interface Terminal {
  id: string;
  pos_id?: number;
  store_id?: string;
  external_pos_id?: string;
  operating_mode: OperatingMode;
}

export interface TerminalsListResponse {
  data: {
    terminals: Terminal[];
  };
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
}

export interface PaymentTransaction {
  id: string;
  amount: string;
  paid_amount?: string;
  refunded_amount?: string;
  tip_amount?: string;
  status: PaymentStatus;
  status_detail?: string;
  reference_id?: string;
  payment_method?: {
    type: string;
    id: string;
    installments?: number;
  };
  card?: {
    first_digits?: string;
    last_digits?: string;
  };
}

export interface RefundTransaction {
  id: string;
  transaction_id: string;
  reference_id?: string;
  amount: string;
  status: 'pending' | 'processed' | 'rejected';
  created_date?: string;
}

export interface Order {
  id: string;
  type: OrderType;
  user_id?: string;
  external_reference: string;
  description?: string;
  expiration_time?: string;
  processing_mode?: string;
  country_code?: string;
  total_amount?: string;
  status: OrderStatus;
  status_detail: string;
  created_date: string;
  last_updated_date: string;
  config?: {
    point?: {
      terminal_id: string;
      print_on_terminal?: 'receipt' | 'no_ticket';
      ticket_number?: string;
    };
    qr?: {
      external_pos_id: string;
      mode?: 'static' | 'dynamic';
    };
    payment_method?: {
      default_type?: 'credit_card' | 'debit_card' | 'qr_code';
      default_installments?: number;
    };
  };
  transactions: {
    payments: PaymentTransaction[];
    refunds?: RefundTransaction[];
  };
  type_response?: {
    qr_data?: string;
  };
  integration_data?: {
    platform_id?: string;
    integrator_id?: string;
    sponsor?: {
      id?: string;
    };
  };
  taxes?: Array<{
    type?: string;
    value?: string;
    payer_condition?: string;
  }>;
  items?: Array<{
    title: string;
    unit_price: string;
    quantity: number;
    unit_measure?: string;
    external_code?: string;
  }>;
}

export interface CreateOrderRequest {
  type: OrderType;
  external_reference: string;
  description?: string;
  expiration_time?: string; // Formato ISO 8601 duration: PT30S, PT10M, PT1H15M (max PT3H)
  total_amount?: string;
  config?: {
    point?: {
      terminal_id: string;
      print_on_terminal?: 'receipt' | 'no_ticket';
      ticket_number?: string;
    };
    qr?: {
      external_pos_id: string;
      mode?: 'static' | 'dynamic';
    };
    payment_method?: {
      default_type?: 'credit_card' | 'debit_card' | 'qr_code';
      default_installments?: number;
      installments_cost?: 'seller' | 'buyer';
    };
  };
  transactions: {
    payments: Array<{
      amount: string;
    }>;
  };
  integration_data?: Order['integration_data'];
  taxes?: Order['taxes'];
  items?: Order['items'];
}

export interface MercadoPagoError {
  status: number;
  error: string;
  message: string;
  cause?: Array<{
    code: string;
    description: string;
  }>;
}
