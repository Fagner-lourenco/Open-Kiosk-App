/**
 * Setup de Testes - Configuração Global Vitest
 * Executado antes de todos os testes
 *
 * NOTA: NÃO importar { vi, expect, afterEach, ... } de 'vitest' aqui.
 * Com globals: true no vitest.config.ts, essas APIs são globais.
 * Importar diretamente no setupFile causa "failed to find the runner"
 * no vitest >=4.x.
 */

import { cleanup } from '@testing-library/react/pure';

// ============================================================
// LIMPEZA PÓS-TESTE
// ============================================================
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

// ============================================================
// MOCK GLOBAL: WINDOW
// ============================================================
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ResizeObserver não existe no jsdom, então criamos um stub simples
class ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    // no-op
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserver,
});

Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

// ============================================================
// MOCK GLOBAL: FETCH
// ============================================================
global.fetch = vi.fn();

// ============================================================
// MOCK GLOBAL: LOCALSTORAGE & SESSIONSTORAGE
// ============================================================
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
};

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// ============================================================
// MOCK GLOBAL: INDEXEDDB
// ============================================================
const indexedDBMock = {
  open: vi.fn().mockResolvedValue({}),
  deleteDatabase: vi.fn(),
};

Object.defineProperty(window, 'indexedDB', {
  value: indexedDBMock,
});

// ============================================================
// MOCK GLOBAL: CRYPTO
// ============================================================
Object.defineProperty(window, 'crypto', {
  value: {
    getRandomValues: (arr: any) => {
      return arr.fill(0);
    },
    subtle: {
      digest: vi.fn(),
      pbkdf2: vi.fn(),
    },
  },
});

// ============================================================
// MOCK GLOBAL: NOTIFICATIONS
// ============================================================
Object.defineProperty(window, 'Notification', {
  value: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
  })),
});

Object.defineProperty(Notification, 'permission', {
  writable: true,
  value: 'granted',
});

// ============================================================
// MOCK GLOBAL: SERVICE WORKER
// ============================================================
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: vi.fn().mockResolvedValue({}),
    getRegistrations: vi.fn().mockResolvedValue([]),
  },
});

// ============================================================
// MOCK FIREBASE
// ============================================================
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn(),
  browserLocalPersistence: {},
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  CACHE_SIZE_UNLIMITED: -1,
}));

// ============================================================
// MOCK VIRTUAL MODULES
// ============================================================
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(() => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  })),
}), { virtual: true });

// ============================================================
// MOCK CAPACITOR
// ============================================================
vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: {
    initialize: vi.fn(),
    startScan: vi.fn(),
    stopScan: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    writeWithoutResponse: vi.fn(),
    startNotifications: vi.fn(),
    stopNotifications: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isPluginAvailable: vi.fn().mockReturnValue(true),
    getPlatform: vi.fn().mockReturnValue('web'),
    isNativePlatform: vi.fn().mockReturnValue(false),
  },
  registerPlugin: vi.fn(),
}));

vi.mock('capacitor-usb-serial-plugin', () => ({
  UsbSerial: {
    openSerial: vi.fn(),
    closeSerial: vi.fn(),
    readSerial: vi.fn(),
    writeSerial: vi.fn(),
    registerReadCallback: vi.fn(),
  },
}));

vi.mock('usb', () => ({
  usb: {
    getDeviceList: vi.fn(() => []),
    findByIds: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

// ============================================================
// MOCK APIs EXTERNAS
// ============================================================
// Mercado Pago
vi.mock('@/services/mercadopagoAPI', () => ({
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  getPaymentStatus: vi.fn(),
  createCheckout: vi.fn(),
}));

// Stripe
vi.mock('stripe', () => ({
  default: vi.fn().mockReturnValue({
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    invoices: {
      create: vi.fn(),
      list: vi.fn(),
    },
    subscriptions: {
      create: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
  }),
}));

// ============================================================
// MOCK CONSOLE
// ============================================================
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ============================================================
// CUSTOM MATCHERS
// ============================================================
expect.extend({
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    const pass = emailRegex.test(received);
    return {
      message: () => `expected ${received} to be a valid email`,
      pass,
    };
  },
  toBeValidPIN(received: string) {
    const pinRegex = /^\\d{4}$/;
    const pass = pinRegex.test(received);
    return {
      message: () => `expected ${received} to be a valid 4-digit PIN`,
      pass,
    };
  },
  toBeValidCurrency(received: number) {
    const pass = received >= 0 && received <= 1000000 && Number.isFinite(received);
    return {
      message: () => `expected ${received} to be a valid currency amount (0-1000000)`,
      pass,
    };
  },
  toBeValidTransactionId(received: string) {
    const txnIdRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    const pass = txnIdRegex.test(received);
    return {
      message: () => `expected ${received} to be a valid transaction UUID`,
      pass,
    };
  },
});

// ============================================================
// ENVIRONMENT VARIABLES PARA TESTES
// ============================================================
process.env.VITE_FIREBASE_API_KEY = 'test-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.VITE_FIREBASE_PROJECT_ID = 'test-project';
process.env.VITE_FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
process.env.VITE_FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.VITE_FIREBASE_APP_ID = 'test-app-id';
process.env.VITE_MERCADO_PAGO_ACCESS_TOKEN = 'test-mp-token';
process.env.VITE_STRIPE_PUBLISHABLE_KEY = 'pk_test_xxx';

// ============================================================
// TIMEOUT GLOBAL
// ============================================================
vi.setConfig({
  testTimeout: 10000,
});

export { };
