/**
 * ============================================================================
 * Tipos Compartilhados - Store (Loja)
 * ============================================================================
 * 
 * Interface unificada para Store usada em ambos os apps (Kiosk e Admin).
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

// ============================================================================
// ENDEREÇO
// ============================================================================

/**
 * Endereço da loja
 */
export interface StoreAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

// ============================================================================
// CONTATO
// ============================================================================

/**
 * Informações de contato da loja
 */
export interface StoreContact {
  phone: string;
  email: string;
  website?: string;
}

// ============================================================================
// CONFIGURAÇÃO ESP32
// ============================================================================

/**
 * Tipo de conexão ESP32
 */
export type ESP32ConnectionType = 'usb' | 'wifi' | 'ble' | 'bluetooth';

/**
 * Configuração do ESP32
 */
export interface ESP32Config {
  connectionType: ESP32ConnectionType;
  connectionId?: string;
  lastSeen?: Date;
  firmwareVersion?: string;
  /** Para conexão WiFi */
  ipAddress?: string;
  /** Para conexão serial */
  comPort?: string;
}

// ============================================================================
// GATEWAY DE PAGAMENTO
// ============================================================================

/**
 * Provedor de pagamento (canônico + legado)
 */
export type PaymentProvider = 'none' | 'mercado_pago' | 'mercadopago' | 'pagbank';

/**
 * Ambiente de pagamento
 */
export type PaymentEnvironment = 'sandbox' | 'production';

/**
 * Métodos de pagamento habilitados
 */
export interface EnabledPaymentMethods {
  cash: boolean;
  pix: boolean;
  credit: boolean;
  debit: boolean;
}

/**
 * Configuração específica do PagBank (sem segredos)
 */
export interface PagBankProviderConfig {
  clientId?: string;
  merchantId?: string;
  publicKey?: string;
}

/**
 * Configuração específica do Mercado Pago (sem segredos)
 */
export interface MercadoPagoProviderConfig {
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  terminalId?: string;
}

/**
 * Configuração de gateway de pagamento (canônico)
 */
export interface PaymentGatewayConfig {
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  enabledMethods: EnabledPaymentMethods;
  pixKey?: string;
  providers?: {
    pagbank?: PagBankProviderConfig;
    mercadopago?: MercadoPagoProviderConfig;
  };

  // -------------------------------
  // Legacy fields (read-compat only)
  // -------------------------------
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

// ============================================================================
// LOJA
// ============================================================================

/**
 * Interface unificada da Loja
 * 
 * Esta interface é a fonte da verdade para ambos os apps.
 */
export interface Store {
  /** ID único do documento no Firestore */
  id: string;
  
  /** ID da franquia (obrigatório em modo multi-tenant) */
  franchiseId: string;
  
  /** Slug único para URL (ex: "loja-centro") */
  slug: string;
  
  /** Nome de exibição */
  name: string;
  
  /** Indica se a loja está ativa */
  isActive: boolean;
  
  // =========================================
  // Localização e Contato
  // =========================================
  
  /** Endereço da loja */
  address?: StoreAddress;
  
  /** Contato da loja */
  contact?: StoreContact;
  
  /** Telefone (atalho) */
  phone?: string;
  
  /** Email (atalho) */
  email?: string;
  
  /** Fuso horário (ex: "America/Sao_Paulo") */
  timezone: string;
  
  // =========================================
  // Configurações Fiscais
  // =========================================
  
  /** CNPJ ou identificador fiscal */
  taxId?: string;
  
  /** Moeda (ex: "BRL", "USD") */
  currency: string;
  
  /** Percentual de imposto padrão */
  taxPercentage: number;
  
  // =========================================
  // Configurações de Interface
  // =========================================
  
  /** Idioma da interface */
  language: 'pt-BR' | 'en';
  
  /** Tempo de inatividade para tela de atração (segundos) */
  attractTimeoutSeconds: number;
  
  /** Usar impressora térmica */
  useThermalPrinter: boolean;
  
  // =========================================
  // Configurações de Hardware
  // =========================================
  
  /** Configuração do ESP32 */
  esp32Config?: ESP32Config;
  
  /** Porta COM para comunicação serial (legado) */
  comPort?: string;
  
  /** Configuração do gateway de pagamento */
  paymentGatewayConfig?: PaymentGatewayConfig;
  
  // =========================================
  // Metadados
  // =========================================
  
  /** Data de criação */
  createdAt: Date;
  
  /** Data da última atualização */
  updatedAt: Date;
  
  /** ID do usuário que criou */
  createdBy?: string;
}

// ============================================================================
// TIPOS AUXILIARES
// ============================================================================

/**
 * Dados para criar uma loja
 */
export interface CreateStoreData {
  name: string;
  slug?: string;
  franchiseId?: string;
  address?: Partial<StoreAddress>;
  contact?: Partial<StoreContact>;
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
 * Status de conexão da loja
 */
export type StoreConnectionStatus = 'online' | 'offline' | 'unknown';

/**
 * Dispenser/Torneira da loja
 */
export interface StoreDispenser {
  id: string;
  storeId: string;
  name: string;
  icon?: string;
  connectionType: ESP32ConnectionType;
  connectionId?: string;
  productIds: string[];
  isActive: boolean;
  lastSeen?: Date;
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
