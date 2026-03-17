import { Product } from './product';
import type { AttractVideoConfig as SharedAttractVideoConfig } from '../../shared/types/store';
import type { ESP32ConnectionType, PaymentGatewayConfig } from '../../shared/types/store';

// F-01: Re-exportar tipos de pagamento do shared como fonte canônica
// Isso garante que KIOSK e shared usem a mesma definição
export type {
  PaymentProvider,
  PaymentEnvironment,
  EnabledPaymentMethods,
  PagBankProviderConfig,
  PlugPagConfig,
  MercadoPagoProviderConfig,
  PaymentGatewayConfig,
} from '../../shared/types/store';

// F-01: Importar ESP32ConnectionType canônico do shared (superset inclui 'ble')
export type { ESP32ConnectionType } from '../../shared/types/store';

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
  attractTimeoutSeconds?: number;
  language?: 'en' | 'pt-BR';

  // Metadados
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ============================================
// Store Settings (Local + Firebase Config)
// ============================================

// Tipos de conexão ESP32 — re-exportados do shared acima (inclui 'ble')

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

  // Terminal PlugPag vinculado (identificador generico aceito pelo SDK, ex: PRO-1733203195)
  plugpagDeviceId?: string;

  // Terminal MP Point vinculado a esta torneira (ex: GERTEC_MP35P__12345)
  mpTerminalId?: string;

  // External POS ID do MP QR vinculado a esta torneira (ex: KIOSK-TAP-1)
  mpExternalPosId?: string;
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

  // Tempo de inatividade para mostrar tela de atração
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

  /** Período de graça para manter sessão de dispense ativo durante reconexão em ms (padrão: 120000).
   * Deve cobrir o tempo de reboot completo do ESP32: boot + stack WiFi/BLE + handshake.
   * Configurável via Firestore sem necessidade de novo deploy. */
  esp32DisconnectGraceMs?: number;

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

  /** Configuração de preço dinâmico (feature flag + regras) */
  dynamicPricingConfig?: import('../../shared/types/dynamicPricing').DynamicPricingConfig;

  /** Estado do modo evento (lido de eventStats/current via onSnapshot) */
  eventMode?: {
    enabled: boolean;
    label?: string;
    endsAt?: Date | null;
    activateDynamicPricing?: boolean;
  };

  /** Timestamp de atualizacao (Firestore) */
  updatedAt?: Date | string;
}

// ============================================
// Payment Gateway Configuration
// ============================================
// F-01: Todos os tipos de pagamento agora são re-exportados do shared
// (PaymentProvider, PaymentEnvironment, EnabledPaymentMethods,
//  PagBankProviderConfig, PlugPagConfig, MercadoPagoProviderConfig,
//  PaymentGatewayConfig)
// Ver imports no topo do arquivo.

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
