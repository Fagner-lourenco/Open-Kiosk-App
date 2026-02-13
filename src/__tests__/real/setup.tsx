/**
 * ============================================================================
 * SETUP GLOBAL PARA TESTES REAIS
 * ============================================================================
 * 
 * Este arquivo configura mocks mínimos globais para todos os testes reais.
 * Apenas APIs externas são mockadas - todo o código da aplicação é REAL.
 */

import React from 'react';
import { vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK: Firebase/Firestore (API Externa)
// ============================================================================
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(() => Promise.resolve({
      exists: () => false,
      data: () => ({}),
    })),
    getDocs: vi.fn(() => Promise.resolve({
      docs: [],
      empty: true,
    })),
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
    deleteDoc: vi.fn(() => Promise.resolve()),
    query: vi.fn((coll) => coll),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    orderBy: vi.fn((field, dir) => ({ field, dir })),
    limit: vi.fn((n) => ({ limit: n })),
    onSnapshot: vi.fn(() => () => {}),
    serverTimestamp: vi.fn(() => new Date()),
    Timestamp: {
      now: () => ({ toDate: () => new Date() }),
      fromDate: (date: Date) => ({ toDate: () => date }),
    },
    // Adicionar exports que o Firebase precisa
    CACHE_SIZE_UNLIMITED: -1,
    enableIndexedDbPersistence: vi.fn(() => Promise.resolve()),
    initializeFirestore: vi.fn(() => ({})),
  };
});

// ============================================================================
// MOCK: Firebase Auth (API Externa)
// ============================================================================
vi.mock('firebase/auth', async () => {
  const actual = await vi.importActual('firebase/auth');
  return {
    ...actual,
    getAuth: vi.fn(() => ({
      currentUser: null,
    })),
    signInWithEmailAndPassword: vi.fn(() => Promise.resolve({
      user: { uid: 'mock-user', email: 'test@example.com' },
    })),
    signOut: vi.fn(() => Promise.resolve()),
    onAuthStateChanged: vi.fn(() => () => {}),
    sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
    updatePassword: vi.fn(() => Promise.resolve()),
    createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({
      user: { uid: 'new-user', email: 'new@example.com' },
    })),
    EmailAuthProvider: {
      credential: vi.fn(),
    },
    browserLocalPersistence: {},
    setPersistence: vi.fn(() => Promise.resolve()),
  };
});

// ============================================================================
// MOCK: Firebase App (API Externa)
// ============================================================================
vi.mock('firebase/app', async () => {
  const actual = await vi.importActual('firebase/app');
  return {
    ...actual,
    initializeApp: vi.fn(() => ({})),
    getApps: vi.fn(() => []),
  };
});

// ============================================================================
// MOCK: Firebase Service - Exports Necessários
// ============================================================================
vi.mock('@/services/firebase', async () => {
  const actual = await vi.importActual('@/services/firebase');
  return {
    ...actual,
    getFirebaseAuth: vi.fn(() => ({ currentUser: null })),
    getFirebaseDb: vi.fn(() => ({})),
    getCurrentStoreId: vi.fn(() => 'store-1'),
    getCurrentFranchiseId: vi.fn(() => 'franchise-1'),
  };
});

// ============================================================================
// MOCK: Kiosk Mode Service (Browser API)
// ============================================================================
vi.mock('@/services/kioskModeService', () => ({
  enterKioskMode: vi.fn(() => Promise.resolve()),
  exitKioskMode: vi.fn(() => Promise.resolve()),
  isKioskMode: vi.fn(() => false),
}));

// ============================================================================
// MOCK: i18n (LanguageProvider/useTranslation)
// ============================================================================
vi.mock('@/i18n', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ============================================================================
// MOCK: Auth Context (for components that call useAuth)
// ============================================================================
vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
    setUser: vi.fn(),
  }),
}));

// ============================================================================
// MOCK: ESP32 Context
// ============================================================================
vi.mock('@/context/ESP32Context', () => ({
  ESP32Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useESP32: () => ({
    status: { connected: false, type: 'none' },
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn(),
  }),
}));

// ============================================================================
// MOCK: useSettings / useStoreSettings (currency + store settings)
// ============================================================================
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ currentCurrency: { code: 'USD', symbol: '$' }, settings: null, loading: false }),
  useCurrentCurrency: () => ({ code: 'USD', symbol: '$' }),
  currencies: [{ code: 'USD', name: 'US Dollar', symbol: '$' }],
}));

vi.mock('@/hooks/useStoreSettings', () => ({
  useStoreSettings: () => ({ settings: { attractTimeoutSeconds: 15 }, loading: false, isInitialized: true }),
}));

// ============================================================================
// MOCK: Capacitor Core
// ============================================================================
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

// ============================================================================
// MOCK: Web APIs (Browser)
// ============================================================================

// Web Bluetooth API
if (!global.navigator) {
  global.navigator = {} as any;
}

(global.navigator as any).bluetooth = {
  requestDevice: vi.fn(() => Promise.resolve({
    gatt: {
      connect: vi.fn(() => Promise.resolve({
        getPrimaryService: vi.fn(() => Promise.resolve({
          getCharacteristic: vi.fn(() => Promise.resolve({
            writeValue: vi.fn(() => Promise.resolve()),
            readValue: vi.fn(() => Promise.resolve(new DataView(new ArrayBuffer(4)))),
            startNotifications: vi.fn(() => Promise.resolve()),
            addEventListener: vi.fn(),
          })),
        })),
      })),
      disconnect: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
};

// Web Serial API
(global.navigator as any).serial = {
  requestPort: vi.fn(() => Promise.resolve({
    open: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    readable: new ReadableStream(),
    writable: new WritableStream(),
  })),
};

// ============================================================================
// RESET: Limpar mocks antes de cada teste
// ============================================================================
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

export {};
