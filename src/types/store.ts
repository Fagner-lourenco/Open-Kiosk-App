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
  created_at: string;
  updated_at: string;
}

// ============================================
// Store Settings (Local + Firebase Config)
// ============================================

export interface StoreSettings {
  name: string;
  storeId?: string;        // ID da loja no Firestore
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
  comPort?: string;
  useThermalPrinter?: boolean;
  // Optional: tempo de inatividade para mostrar tela de atração
  attractTimeoutSeconds?: number;
  // Idioma da interface (salvo no Firebase para sincronizar entre dispositivos)
  language?: 'en' | 'pt-BR';
}

export interface InventoryLog {
  id: string;
  productId: string;
  type: 'ADD' | 'REMOVE' | 'ADJUST';
  quantity: number;
  comment: string;
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
