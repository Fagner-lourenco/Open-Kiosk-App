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
 * Provedor de pagamento (canônico)
 *
 * NOTE: Legacy 'mercadopago' format is automatically converted to canonical
 * 'mercado_pago' at runtime via normalizeProvider(). This ensures the type
 * system enforces canonical format while maintaining full backward compatibility
 * with existing Firestore documents containing the legacy format.
 *
 * @see normalizeProvider() - Runtime conversion for legacy data
 * @see PaymentGatewayConfigSchema - Zod schema still validates both formats on input
 */
export type PaymentProvider = 'none' | 'mercado_pago' | 'pagbank';

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
  /** Configuração PlugPag (card-present via Bluetooth terminal) */
  plugpag?: PlugPagConfig;
}

/** Configuração PlugPag para pagamento card-present */
export interface PlugPagConfig {
  /** Feature flag — habilita pagamento via terminal PlugPag */
  enabled: boolean;
  /** Bluetooth MAC address do terminal (e.g. "00:1B:66:XX:YY:ZZ") */
  deviceId: string;
  /** Código de ativação do PagBank para este terminal */
  activationCode?: string;
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
// CONFIGURAÇÃO DE VÍDEO DA TELA DE ATRAÇÃO
// ============================================================================

/**
 * Configuração do vídeo de fundo da tela de atração (attract screen).
 *
 * Gerenciado exclusivamente pelo Admin Web. O Kiosk consome como read-only.
 */
export interface AttractVideoConfig {
  /** Habilitar/desabilitar vídeo de fundo */
  isEnabled: boolean;

  /** URL do vídeo (HTTPS obrigatório, ex: https://cdn.example.com/video.mp4) */
  videoUrl?: string;

  /** Título customizado (substitui translate key 'attract.title') */
  displayTitle?: string;

  /** Subtítulo customizado (substitui translate key 'attract.subtitle') */
  displaySubtitle?: string;

  /** Opacidade do vídeo (0.0-1.0, padrão 0.4 para legibilidade) */
  videoOpacity?: number;

  /** Modo de preenchimento: 'cover' (preenche tela) ou 'contain' (cabe na tela) */
  videoCoverMode?: 'cover' | 'contain';

  /** Timestamp da última validação da URL */
  lastValidatedAt?: string;

  /** Resultado da última validação */
  lastValidationResult?: 'valid' | 'invalid' | 'cors_warning';

  /** Content-Type do vídeo (ex: 'video/mp4') */
  contentType?: string;
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

  // =========================================
  // Configurações do Kiosk (store-level)
  // =========================================

  /** Habilita modo kiosk (restrições de interface) */
  kioskEnabled?: boolean;

  /** Habilita tela de atração quando ocioso */
  attractScreenEnabled?: boolean;

  /** Configuração do vídeo da tela de atração */
  attractVideoConfig?: AttractVideoConfig;

  /** Versão da migração de settings */
  _migrationVersion?: number;

  // =========================================
  // Configurações de Hardware
  // =========================================

  /** Configuração do ESP32 */
  esp32Config?: ESP32Config;

  /** Configuração do gateway de pagamento */
  paymentGatewayConfig?: PaymentGatewayConfig;

  // =========================================
  // Preço Dinâmico
  // =========================================

  /** Configuração de preço dinâmico (feature flag + regras) */
  dynamicPricingConfig?: import('./dynamicPricing').DynamicPricingConfig;

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
// TAP CONFIGURATION (CANONICAL)
// ============================================================================

/**
 * Configuração canônica de torneira (Tap).
 *
 * Este é o formato PREFERENCIAL usado pelo Kiosk para configurar o hardware ESP32.
 * O Admin Web deve escrever configurações neste formato no campo `taps[]`.
 *
 * Backward Compatibility: O campo legado `dispensers[]` ainda é suportado
 * via fallback, mas `taps[]` tem prioridade.
 *
 * Estrutura deve espelhar src/types/store.ts TapConfig (Kiosk).
 */
export interface TapConfig {
  /** ID da torneira (0-3, máximo 4 torneiras) */
  id: number;

  /** Nome da torneira */
  name: string;

  /** Torneira habilitada */
  enabled: boolean;

  /** Pino GPIO da válvula (opcional, configurado pelo Kiosk) */
  valvePin?: number;

  /** Pino GPIO do sensor de fluxo (opcional, configurado pelo Kiosk) */
  sensorPin?: number;

  /** Calibração do sensor de fluxo */
  calibration?: {
    /** Pulsos por litro do sensor (ex: 450 para YF-S201) */
    pulsesPerLiter?: number;
    /** Taxa de fluxo em ml/segundo */
    mlPerSecond?: number;
  };

  /** ID do produto pré-selecionado (opcional) */
  productId?: string;

  /** Nome do produto pré-selecionado (opcional) */
  productName?: string;

  /** MAC Bluetooth do terminal PlugPag vinculado a esta torneira (ex: "90:97:D5:F1:74:B5") */
  plugpagDeviceId?: string;
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
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractVideoConfig?: Partial<AttractVideoConfig>;
  esp32Config?: Partial<ESP32Config>;
  paymentGatewayConfig?: Partial<PaymentGatewayConfig>;
  dynamicPricingConfig?: Partial<import('./dynamicPricing').DynamicPricingConfig>;
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
