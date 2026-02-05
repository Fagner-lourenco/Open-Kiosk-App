/**
 * ============================================================================
 * Store Types
 * ============================================================================
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Endereço da loja
 */
export interface StoreAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode?: string;
  country: string;
}

/**
 * Configuração de gateway de pagamento (canônico + legado)
 */
export type PaymentProvider = 'none' | 'mercado_pago' | 'mercadopago' | 'pagbank';
export type PaymentEnvironment = 'sandbox' | 'production';

export interface EnabledPaymentMethods {
  cash: boolean;
  pix: boolean;
  credit: boolean;
  debit: boolean;
}

export interface PagBankProviderConfig {
  clientId?: string;
  merchantId?: string;
  publicKey?: string;
}

export interface MercadoPagoProviderConfig {
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  terminalId?: string;
}

export interface PaymentGatewayConfig {
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  enabledMethods: EnabledPaymentMethods;
  pixKey?: string;
  providers?: {
    pagbank?: PagBankProviderConfig;
    mercadopago?: MercadoPagoProviderConfig;
  };

  // Legacy fields (read-compat only)
  accessToken?: string;
  mode?: PaymentEnvironment;
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  terminalId?: string;
  pollingIntervalMs?: number;
  pollingMaxAttempts?: number;
  pointExpirationTime?: string;
  qrExpirationMinutes?: number;
  configuredAt?: string;
  configuredBy?: string;
  lastValidatedAt?: string;
  lastValidationResult?: 'success' | 'error';
}

/**
 * Configuração do ESP32
 */
export interface ESP32Config {
  connectionType: 'usb' | 'ble' | 'wifi';
  connectionId?: string;
  lastSeen?: Timestamp | Date;
  firmwareVersion?: string;
}

/**
 * Loja
 */
export interface Store {
  id: string;
  franchiseId: string;
  name: string;
  slug: string;
  address?: StoreAddress;
  phone?: string;
  email?: string;
  timezone: string;
  currency: string;
  language: 'pt-BR' | 'en';
  taxId?: string;
  taxPercentage: number;
  isActive: boolean;
  attractTimeoutSeconds: number;
  useThermalPrinter: boolean;
  esp32Config?: ESP32Config;
  paymentGatewayConfig?: PaymentGatewayConfig;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/**
 * Dados para criar uma loja
 */
export interface CreateStoreData {
  name: string;
  slug?: string;
  address?: Partial<StoreAddress>;
  phone?: string;
  email?: string;
  timezone?: string;
  currency?: string;
  language?: 'pt-BR' | 'en';
  taxId?: string;
  taxPercentage?: number;
}

/**
 * Dados para atualizar uma loja
 */
export interface UpdateStoreData extends Partial<CreateStoreData> {
  isActive?: boolean;
  attractTimeoutSeconds?: number;
  useThermalPrinter?: boolean;
  esp32Config?: Partial<ESP32Config>;
  paymentGatewayConfig?: Partial<PaymentGatewayConfig>;
}

/**
 * Dispenser/Torneira
 */
export interface StoreDispenser {
  id: string;
  storeId: string;
  name: string;
  icon?: string;
  connectionType: 'usb' | 'ble' | 'wifi';
  connectionId?: string;
  productIds: string[];
  isActive: boolean;
  lastSeen?: Timestamp | Date;
}

/**
 * Estatísticas da loja
 */
export interface StoreStats {
  totalSales: number;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  salesByDay: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
}

/**
 * Status de conexão da loja
 */
export type StoreConnectionStatus = 'online' | 'offline' | 'unknown';
