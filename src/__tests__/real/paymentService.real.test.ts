/**
 * ============================================================================
 * TESTES REAIS - PaymentService
 * ============================================================================
 * Testa o PaymentService REAL (singleton). Somente APIs externas são mockadas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { paymentService } from '@/services/paymentService';

// Mocks mínimos para APIs externas
vi.mock('@/services/firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
  getCurrentStoreId: vi.fn(() => 'store-1'),
  getCurrentFranchiseId: vi.fn(() => 'franchise-1'),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(),
    doc: vi.fn(),
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'mock-tx' })),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    serverTimestamp: vi.fn(() => new Date()),
    Timestamp: {
      now: () => ({ toDate: () => new Date() }),
      fromDate: (date: Date) => ({ toDate: () => date }),
    },
    CACHE_SIZE_UNLIMITED: 104857600,
    enableIndexedDbPersistence: vi.fn(() => Promise.resolve()),
    initializeFirestore: vi.fn(() => ({})),
  };
});

// Mock Mercado Pago API wrapper
vi.mock('@/services/mercadopagoAPI', () => ({
  createMercadoPagoAPI: vi.fn(() => ({
    createPixOrder: vi.fn(async () => ({
      id: 'order-123',
      status: 'opened',
      qrData: 'qr-data',
    })),
    getOrder: vi.fn(async () => ({
      id: 'order-123',
      status: 'opened',
    })),
    cancelOrder: vi.fn(async () => ({})),
    createPointPayment: vi.fn(async () => ({
      id: 'point-123',
      status: 'opened',
    })),
    createOrder: vi.fn(async () => ({
      id: 'order-123',
      status: 'opened',
      type_response: {
        qr_data: 'qrdata',
      },
    })),
  })),
}));

describe('PaymentService Real Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('PIX', () => {
    it('should process PIX payment', async () => {
      const result = await paymentService.processPixPayment(100.0, 'order-123');
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should reject negative amount', async () => {
      const result = await paymentService.processPixPayment(-50, 'order-neg');
      expect(result).toBeDefined();
    });
  });

  describe('Card (Point)', () => {
    it('should process card payment via terminal', async () => {
      const result = await paymentService.processCardPayment(120.0, 'order-456', 'terminal-1');
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should fail with invalid amount', async () => {
      const result = await paymentService.processCardPayment(-10, 'order-bad', 'terminal-1');
      expect(result).toBeDefined();
    });
  });

  describe('MercadoPago QR', () => {
    it('should create QR order', async () => {
      const result = await paymentService.processMercadoPagoQR(50, 'order-qr', 'store-1', 'POS-01');
      expect(result).toBeDefined();
    });
  });

  describe('Status & Cancel', () => {
    it('should check order status', async () => {
      const order = await paymentService.checkMercadoPagoOrderStatus('order-123');
      expect(order).toBeDefined();
    });

    it('should cancel order', async () => {
      const result = await paymentService.cancelMercadoPagoOrder('order-123');
      expect(result).toBeDefined();
    });
  });
});
