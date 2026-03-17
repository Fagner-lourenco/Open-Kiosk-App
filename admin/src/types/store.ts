/**
 * ============================================================================
 * Store Types
 * ============================================================================
 */

import { Timestamp } from 'firebase/firestore';
import type { AttractVideoConfig, PaymentGatewayConfig, ESP32ConnectionType } from '../../../shared/types/store';

// F-01: Re-exportar tipos de pagamento do shared como fonte canônica
export type {
  PaymentProvider,
  PaymentEnvironment,
  EnabledPaymentMethods,
  PagBankProviderConfig,
  PlugPagConfig,
  MercadoPagoProviderConfig,
  PaymentGatewayConfig,
  ESP32ConnectionType,
} from '../../../shared/types/store';

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
 * Configuração do ESP32
 * Usa ESP32ConnectionType do shared (superset: usb | wifi | ble | bluetooth)
 * lastSeen aceita Timestamp (Firestore Admin) | Date para compat
 */
export interface ESP32Config {
  connectionType: ESP32ConnectionType;
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
  address?: StoreAddress | string;
  phone?: string;
  email?: string;
  timezone: string;
  currency: string;
  language: 'pt-BR' | 'en';
  taxId?: string;
  taxPercentage: number;
  isActive: boolean;
  attractTimeoutSeconds: number;
  esp32Config?: ESP32Config;
  paymentGatewayConfig?: PaymentGatewayConfig;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;

  // Kiosk store-level settings
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractVideoConfig?: AttractVideoConfig;

  /** Versão da migração */
  _migrationVersion?: number;
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
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractVideoConfig?: Partial<AttractVideoConfig>;
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
