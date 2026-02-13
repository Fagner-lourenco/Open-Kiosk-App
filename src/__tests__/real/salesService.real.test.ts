import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase antes de importar
vi.mock('@/services/firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
  getStoreCollection: vi.fn(() => ({})),
  getStoreDoc: vi.fn(() => ({})),
  getCurrentStoreId: vi.fn(() => 'store-1'),
  getCurrentFranchiseId: vi.fn(() => null),
}));

const mockTransaction = {
  get: vi.fn(() => Promise.resolve({ 
    exists: () => true, 
    data: () => ({ 
      id: 'prod-1',
      stock: 10, 
      title: 'Test Product',
      price: 10,
      inStock: true,
    }) 
  })),
  set: vi.fn(),
  update: vi.fn(),
};

vi.mock('firebase/firestore', () => ({
  runTransaction: vi.fn((db, callback) => callback(mockTransaction)),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'sale-123' })),
  serverTimestamp: vi.fn(() => new Date()),
  Timestamp: { now: vi.fn(() => ({ toDate: () => new Date() })) },
}));

vi.mock('@/services/deviceHeartbeatService', () => ({
  deviceHeartbeatService: { 
    getDeviceId: vi.fn(() => Promise.resolve('device-1')),
    sendHeartbeat: vi.fn(),
  },
}));

import { salesService } from '@/services/salesService';

describe('salesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateOrderNumber', () => {
    it('gera número de pedido com formato correto', async () => {
      const orderNumber = await salesService.generateOrderNumber();
      
      // Formato: YYMMDDHHMMSS-uniqueId
      expect(orderNumber).toMatch(/^\d{12}-[a-z0-9]+$/i);
    });

    it('gera números únicos', async () => {
      const order1 = await salesService.generateOrderNumber();
      const order2 = await salesService.generateOrderNumber();
      
      expect(order1).not.toBe(order2);
    });

    it('inclui data no formato correto', async () => {
      const orderNumber = await salesService.generateOrderNumber();
      const datePart = orderNumber.split('-')[0];
      
      // Verificar que tem 12 dígitos (YYMMDDHHMMSS)
      expect(datePart).toHaveLength(12);
      expect(/^\d+$/.test(datePart)).toBe(true);
    });

    it('gera múltiplos números únicos em sequência', async () => {
      const orders = await Promise.all([
        salesService.generateOrderNumber(),
        salesService.generateOrderNumber(),
        salesService.generateOrderNumber(),
        salesService.generateOrderNumber(),
        salesService.generateOrderNumber(),
      ]);
      
      const unique = new Set(orders);
      expect(unique.size).toBe(5);
    });
  });

  describe('recordSaleAndUpdateStock', () => {
    const mockCartItems = [
      {
        product: {
          id: 'prod-1',
          title: 'Test Product',
          price: 10,
          stock: 10,
          inStock: true,
          isDrink: false,
        },
        quantity: 2,
        unitPrice: 10,
      },
    ];

    it('registra venda com sucesso', async () => {
      const saleId = await salesService.recordSaleAndUpdateStock(
        mockCartItems as any,
        20,
        'BRL',
        'ORDER-001',
        'pix_qr',
        'store-1'
      );
      
      expect(saleId).toBe('sale-123');
    });

    it('chama runTransaction com o banco de dados', async () => {
      const { runTransaction } = await import('firebase/firestore');
      
      await salesService.recordSaleAndUpdateStock(
        mockCartItems as any,
        20,
        'BRL',
        'ORDER-002',
        'credit_card' as const,
        'store-1'
      );
      
      expect(runTransaction).toHaveBeenCalled();
    });

    it('atualiza estoque de produto regular', async () => {
      await salesService.recordSaleAndUpdateStock(
        mockCartItems as any,
        20,
        'BRL',
        'ORDER-003',
        'pix_qr',
        'store-1'
      );
      
      expect(mockTransaction.update).toHaveBeenCalled();
    });

    it('cria registro de venda na transação', async () => {
      await salesService.recordSaleAndUpdateStock(
        mockCartItems as any,
        20,
        'BRL',
        'ORDER-004',
        'debit_card' as const,
        'store-1'
      );
      
      expect(mockTransaction.set).toHaveBeenCalled();
    });

    it('envia heartbeat após venda', async () => {
      const { deviceHeartbeatService } = await import('@/services/deviceHeartbeatService');
      
      await salesService.recordSaleAndUpdateStock(
        mockCartItems as any,
        20,
        'BRL',
        'ORDER-005',
        'pix_qr',
        'store-1'
      );
      
      expect(deviceHeartbeatService.sendHeartbeat).toHaveBeenCalled();
    });

    it('usa storeId fornecido', async () => {
      const { getStoreDoc } = await import('@/services/firebase');
      
      await salesService.recordSaleAndUpdateStock(
        mockCartItems as any,
        20,
        'BRL',
        'ORDER-006',
        'pix_qr',
        'custom-store-id'
      );
      
      expect(getStoreDoc).toHaveBeenCalledWith('custom-store-id', 'products', 'prod-1');
    });

    it('trata produto bebida com ml', async () => {
      const drinkCartItems = [
        {
          product: {
            id: 'drink-1',
            title: 'Beer',
            price: 10,
            isDrink: true,
            totalMlAvailable: 2000,
          },
          quantity: 1,
          unitPrice: 10,
          sizeKey: 'medium',
          sizeLabel: '400ml',
          mlPerUnit: 400,
        },
      ];

      // Mock para produto bebida
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'drink-1',
          title: 'Beer',
          stock: 0,
          price: 10,
          inStock: true,
          isDrink: true,
          totalMlAvailable: 2000,
        }),
      });

      await salesService.recordSaleAndUpdateStock(
        drinkCartItems as any,
        10,
        'BRL',
        'ORDER-007',
        'pix_qr',
        'store-1'
      );
      
      expect(mockTransaction.update).toHaveBeenCalled();
    });

    it('lança erro quando produto não existe', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      await expect(
        salesService.recordSaleAndUpdateStock(
          mockCartItems as any,
          20,
          'BRL',
          'ORDER-008',
          'pix_qr',
          'store-1'
        )
      ).rejects.toThrow('not found');
    });

    it('lança erro quando estoque insuficiente', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'prod-1',
          title: 'Test Product',
          stock: 1, // Estoque insuficiente
          price: 10,
          inStock: true,
          isDrink: false,
        }),
      });

      const highQuantityCart = [
        {
          product: {
            id: 'prod-1',
            title: 'Test Product',
            price: 10,
            stock: 1,
            isDrink: false,
          },
          quantity: 10, // Mais do que disponível
          unitPrice: 10,
        },
      ];

      await expect(
        salesService.recordSaleAndUpdateStock(
          highQuantityCart as any,
          100,
          'BRL',
          'ORDER-009',
          'pix_qr',
          'store-1'
        )
      ).rejects.toThrow('insuficiente');
    });
  });
});
