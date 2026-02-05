import { Product } from './product';

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
  // Legado (snake_case)
  created_at?: string;
  updated_at?: string;
  
  // Canonico (camelCase)
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ============================================
// Store Settings (Local + Firebase Config)
// ============================================

// Tipos de conexão ESP32
export type ESP32ConnectionType = 'usb' | 'wifi' | 'bluetooth';

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
  // Configurações do Kiosk
  // ============================================
  
  comPort?: string;
  useThermalPrinter?: boolean;
  // Optional: tempo de inatividade para mostrar tela de atração
  attractTimeoutSeconds?: number;
  // Idioma da interface (salvo no Firebase para sincronizar entre dispositivos)
  language?: 'en' | 'pt-BR';
  
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

/** Provedores de pagamento suportados */
export type PaymentProvider = 'mercadopago' | 'stone' | 'pagseguro' | 'cielo' | 'stripe';

/** Métodos de pagamento habilitados */
export interface EnabledPaymentMethods {
  pix: boolean;
  credit: boolean;
  debit: boolean;
}

/** Configuração do gateway de pagamento */
export interface PaymentGatewayConfig {
  // Identificação do provedor
  provider: PaymentProvider;
  
  // Modo de operação
  mode: 'sandbox' | 'production';
  
  // Métodos de pagamento habilitados (default: todos true)
  enabledMethods?: EnabledPaymentMethods;
  
  // Credenciais (Mercado Pago)
  accessToken: string;
  
  // Identificadores do integrador/loja
  userId?: string;
  storeId?: string;
  externalPosId?: string;
  
  // Terminal Point (cartão físico)
  terminalId?: string;
  
  // Timeouts customizáveis
  pollingIntervalMs?: number;      // default: 3000
  pollingMaxAttempts?: number;     // default: 45
  pointExpirationTime?: string;    // default: 'PT2M' (ISO 8601)
  qrExpirationMinutes?: number;    // default: 2
  
  // Metadados de auditoria
  configuredAt?: string;
  configuredBy?: string;
  lastValidatedAt?: string;
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
