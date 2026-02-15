import { Product } from './product';
import type { AttractVideoConfig as SharedAttractVideoConfig } from '../../shared/types/store';

// ============================================
// Multi-Store Support Types
// ============================================

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

export interface StoreContact {
  phone: string;
  email: string;
  website?: string;
}

export interface Store {
  id: string;
  storeId: string;        // Slug único (ex: "loja-centro")
  name: string;           // Nome de exibição
  slug: string;           // URL-friendly
  isActive: boolean;

  // Dados fiscais
  taxId: string;
  currency: string;
  taxPercentage: number;

  // Endereço e contato
  address?: StoreAddress;
  contact?: StoreContact;

  // Configurações do kiosk
  comPort?: string;
  useThermalPrinter?: boolean;
  attractTimeoutSeconds?: number;
  language?: 'en' | 'pt-BR';

  // Metadados
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ============================================
// Store Settings (Local + Firebase Config)
// ============================================

// Tipos de conexão ESP32
export type ESP32ConnectionType = 'usb' | 'wifi' | 'bluetooth';

export interface TapConfig {
  id: number;                   // 0-3 (máx 4 torneiras)
  name: string;                 // Nome da torneira
  enabled: boolean;             // Se está ativa

  // Hardware ESP32
  valvePin?: number;            // GPIO da válvula
  sensorPin?: number;           // GPIO do sensor fluxo

  // Calibração
  calibration?: {
    pulsesPerLiter?: number;    // Ex: 450
    mlPerSecond?: number;       // Fluxo: ml/s
  };

  // Produto (opcional)
  productId?: string;
  productName?: string;
}

export interface StoreSettings {
  name: string;
  storeId?: string;        // ID da loja no Firestore
  franchiseId?: string;    // ID da franquia (para modo multi-tenant)
  currency: string;
  taxId: string;
  taxPercentage: number;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };

  // ============================================
  // Campos gerenciados pelo Admin Web
  // ============================================

  /** E-mail da loja */
  email?: string;

  /** Telefone da loja */
  phone?: string;

  /** Endereço da loja */
  address?: string;

  /** Descrição da loja */
  description?: string;

  /** Fuso horário da loja (ex: 'America/Sao_Paulo') */
  timezone?: string;

  // ============================================
  // Configuração de Torneiras (Taps)
  // ============================================

  /** Array de torneiras configuradas (máx 4) */
  taps?: TapConfig[];

  /** Versão da configuração de torneiras (incrementa a cada mudança) */
  tapsVersion?: number;

  /** Timestamp da última atualização de taps */
  tapsUpdatedAt?: Date | string;

  /** UID do admin que fez última atualização */
  tapsUpdatedBy?: string;

  // ============================================
  // Configurações do Kiosk
  // ============================================

  comPort?: string;
  useThermalPrinter?: boolean;
  // Optional: tempo de inatividade para mostrar tela de atração
  attractTimeoutSeconds?: number;
  // Idioma da interface (salvo no Firebase para sincronizar entre dispositivos)
  language?: 'en' | 'pt-BR';
  // Modo Kiosk (Software) - Habilita restrições de interface do quiosque
  kioskEnabled?: boolean;
  // Habilita/Desabilita tela de atração (video/logo quando ocioso)
  attractScreenEnabled?: boolean;

  /** Configuração do vídeo da tela de atração (gerenciado pelo Admin Web) */
  attractVideoConfig?: SharedAttractVideoConfig;

  // ============================================
  // Configurações ESP32 Auto-Connect
  // ============================================

  /** Habilita autoconexão ao iniciar (padrão: true) */
  esp32AutoConnect?: boolean;

  /** Ordem de preferência para conexão (padrão: ['usb', 'wifi', 'bluetooth']) */
  esp32ConnectionOrder?: ESP32ConnectionType[];

  /** Intervalo de heartbeat em ms (padrão: 15000) */
  esp32HeartbeatIntervalMs?: number;

  /** Último IP WiFi do ESP32 (para reconexão) */
  esp32LastWifiIp?: string;

  // ============================================
  // Configurações de Retirada de Bebida
  // ============================================

  /** Timeout para iniciar retirada em segundos (padrão: 90) */
  drinkPickupTimeoutSeconds?: number;

  /** Habilita som de confirmação ao completar dispensação (padrão: true) */
  drinkPickupSoundEnabled?: boolean;

  // ============================================
  // Configurações do Gateway de Pagamento
  // ============================================

  /** Configuração do gateway de pagamento (opcional - fallback para env vars) */
  paymentGatewayConfig?: PaymentGatewayConfig;

  /** Timestamp de atualizacao (Firestore) */
  updatedAt?: Date | string;
}

// ============================================
// Payment Gateway Configuration
// ============================================

/** Provedores de pagamento suportados (canônico)
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

/** Ambiente de pagamento */
export type PaymentEnvironment = 'sandbox' | 'production';

/** Métodos de pagamento habilitados */
export interface EnabledPaymentMethods {
  cash: boolean;
  pix: boolean;
  credit: boolean;
  debit: boolean;
}

/** Configuração específica do PagBank (sem segredos) */
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

/** Configuração específica do Mercado Pago (sem segredos) */
export interface MercadoPagoProviderConfig {
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  terminalId?: string;
}

/** Configuração do gateway de pagamento */
export interface PaymentGatewayConfig {
  // Identificação do provedor (canônico)
  provider: PaymentProvider;

  // Ambiente (canônico)
  environment: PaymentEnvironment;

  // Métodos de pagamento habilitados
  enabledMethods: EnabledPaymentMethods;

  // Chave PIX (quando habilitado)
  pixKey?: string;

  // Configurações por provedor (sem segredos)
  providers?: {
    pagbank?: PagBankProviderConfig;
    mercadopago?: MercadoPagoProviderConfig;
  };

  // -------------------------------
  // Legacy fields (read-compat only)
  // -------------------------------
  /** @deprecated Evitar persistir tokens no Firestore */
  accessToken?: string;
  /** @deprecated Usar environment */
  mode?: PaymentEnvironment;
  /** @deprecated Mover para providers.mercadopago */
  userId?: string;
  /** @deprecated Mover para providers.mercadopago */
  storeId?: string;
  /** @deprecated Mover para providers.mercadopago */
  externalPosId?: string;
  /** @deprecated Mover para providers.mercadopago */
  terminalId?: string;
  /** @deprecated */
  pollingIntervalMs?: number;
  /** @deprecated */
  pollingMaxAttempts?: number;
  /** @deprecated */
  pointExpirationTime?: string;
  /** @deprecated */
  qrExpirationMinutes?: number;
  /** @deprecated */
  configuredAt?: string;
  /** @deprecated */
  configuredBy?: string;
  /** @deprecated */
  lastValidatedAt?: string;
  /** @deprecated */
  lastValidationResult?: 'success' | 'error';
}

export interface InventoryLog {
  id: string;
  productId: string;
  productTitle?: string;
  type: 'ADD' | 'REMOVE' | 'ADJUST';
  quantity: number;
  previousStock?: number;
  newStock?: number;
  userEmail?: string;
  comment?: string;
  timestamp: Date;
  userId?: string;
}

export interface ProductWithInventory extends Product {
  stock: number;
  minStock?: number;
}

// ============================================
// Attract Screen Video Settings
// ============================================

/**
 * @deprecated Use AttractVideoConfig from shared/types/store
 * Mantido para backward compatibility com código existente.
 */
export interface AttractVideoSettings {
  // URL do vídeo (HTTPS obrigatório, ex: https://example.com/chopp.mp4)
  videoUrl?: string;

  // Título customizado (substitui translate key 'attract.title')
  displayTitle?: string;

  // Subtítulo customizado (substitui translate key 'attract.subtitle')
  displaySubtitle?: string;

  // Habilitar/desabilitar vídeo de fundo
  isEnabled: boolean;

  // Opacidade do vídeo (0.0-1.0, padrão 0.4 para legibilidade)
  videoOpacity?: number;

  // Modo de preenchimento: 'cover' (preenche tela) ou 'contain' (cabe na tela)
  videoCoverMode?: 'cover' | 'contain';
}

/**
 * Configuração do vídeo da tela de atração (canônico).
 * Re-exportado de shared/types/store para uso no Kiosk.
 */
export type { AttractVideoConfig } from '../../shared/types/store';
