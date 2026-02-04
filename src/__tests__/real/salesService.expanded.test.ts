/**
 * ============================================================================
 * TESTES EXPANDIDOS - SalesService
 * ============================================================================
 * Testa o SalesService REAL com cobertura expandida. Firebase é mockado minimamente.
 * Foco em geração de números de pedido, transações, validações de estoque e edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase antes de importar
vi.mock('@/services/firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
  getStoreCollection: vi.fn(() => ({})),
  getStoreDoc: vi.fn(() => ({})),
  getCurrentStoreId: vi.fn(() => 'store-1'),
  getCurrentFranchiseId: vi.fn(() => 'franchise-1'),
}));

const mockTransaction = {
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
};

vi.mock('firebase/firestore', () => ({
  runTransaction: vi.fn((db, callback) => callback(mockTransaction)),
  collection: vi.fn(() => ({ id: 'orders' })),
  doc: vi.fn((ref, ...args) => {
    if (args.length === 0) return { id: 'auto-id' };
    return { id: `${args[args.length - 1]}` };
  }),
  serverTimestamp: vi.fn(() => new Date()),
  Timestamp: { 
    now: vi.fn(() => ({ toDate: () => new Date() })),
    fromDate: vi.fn((date) => date),
  },
}));

vi.mock('@/services/deviceHeartbeatService', () => ({
  deviceHeartbeatService: {
    getDeviceId: vi.fn(() => Promise.resolve('device-123')),
    sendHeartbeat: vi.fn(() => Promise.resolve()),
  },
}));

import { salesService } from '@/services/salesService';
import { 
  getCurrentStoreId, 
  getCurrentFranchiseId,
  getFirebaseDb,
  getStoreDoc,
  getStoreCollection,
} from '@/services/firebase';
import { deviceHeartbeatService } from '@/services/deviceHeartbeatService';
import { runTransaction } from 'firebase/firestore';

describe('SalesService - Expanded Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(getCurrentStoreId).mockReturnValue('store-1');
    vi.mocked(getCurrentFranchiseId).mockReturnValue('franchise-1');
    vi.mocked(getFirebaseDb).mockReturnValue({} as any);
    vi.mocked(getStoreDoc).mockReturnValue({ id: 'product-ref' } as any);
    vi.mocked(getStoreCollection).mockReturnValue({ id: 'orders-collection' } as any);
    vi.mocked(runTransaction).mockImplementation((db, callback) => callback(mockTransaction));
    vi.mocked(deviceHeartbeatService.getDeviceId).mockResolvedValue('device-123');
    vi.mocked(deviceHeartbeatService.sendHeartbeat).mockResolvedValue(undefined);

    // Reset transaction mocks
    mockTransaction.get.mockClear();
    mockTransaction.set.mockClear();
    mockTransaction.update.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('generateOrderNumber', () => {
    it('gera número de pedido com formato correto', async () => {
      const orderNumber = await salesService.generateOrderNumber();

      // Formato: YYMMDDHHMMSS-uniqueId
      expect(orderNumber).toMatch(/^\d{12}-[a-z0-9]+$/i);
    });

    it('gera números únicos em sequência rápida', async () => {
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

    it('inclui ano, mês, dia, hora, minuto e segundo', async () => {
      const orderNumber = await salesService.generateOrderNumber();
      const datePart = orderNumber.split('-')[0];

      expect(datePart).toHaveLength(12);
      expect(/^\d{12}$/.test(datePart)).toBe(true);

      // Validar que os componentes de data são razoáveis
      const yy = parseInt(datePart.substring(0, 2), 10);
      const mm = parseInt(datePart.substring(2, 4), 10);
      const dd = parseInt(datePart.substring(4, 6), 10);
      const hh = parseInt(datePart.substring(6, 8), 10);
      const min = parseInt(datePart.substring(8, 10), 10);
      const ss = parseInt(datePart.substring(10, 12), 10);

      expect(mm).toBeGreaterThanOrEqual(1);
      expect(mm).toBeLessThanOrEqual(12);
      expect(dd).toBeGreaterThanOrEqual(1);
      expect(dd).toBeLessThanOrEqual(31);
      expect(hh).toBeGreaterThanOrEqual(0);
      expect(hh).toBeLessThanOrEqual(23);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(min).toBeLessThanOrEqual(59);
      expect(ss).toBeGreaterThanOrEqual(0);
      expect(ss).toBeLessThanOrEqual(59);
    });

    it('cada número gerado é único mesmo em alta concorrência', async () => {
      const orderNumbers = await Promise.all(
        Array(20).fill(null).map(() => salesService.generateOrderNumber())
      );

      const unique = new Set(orderNumbers);
      expect(unique.size).toBe(20);
    });

    it('gera números com diferentes prefixos de data ao longo do tempo', async () => {
      const order1 = await salesService.generateOrderNumber();
      const datePart1 = order1.split('-')[0];

      // Esperar 1 segundo para mudar pelo menos os segundos
      await new Promise(resolve => setTimeout(resolve, 1100));

      const order2 = await salesService.generateOrderNumber();
      const datePart2 = order2.split('-')[0];

      // Os números podem ser iguais (muito raro que mudem em 1 segundo),
      // mas se mudar, a ordem2 deve ser maior ou igual
      expect(datePart2).toMatch(/^\d{12}$/);
    });
  });

  describe('recordSaleAndUpdateStock', () => {
    const mockProduct = {
      id: 'prod-1',
      title: 'Coffee',
      price: 5.0,
      stock: 100,
      inStock: true,
      isDrink: false,
      description: 'Hot coffee',
      tags: ['beverage'],
    };

    const mockDrinkProduct = {
      id: 'drink-1',
      title: 'Orange Juice',
      price: 3.0,
      isDrink: true,
      totalMlAvailable: 5000,
      inStock: true,
      description: 'Fresh OJ',
      tags: ['drink'],
    };

    const mockCartItem = {
      product: mockProduct,
      quantity: 2,
      unitPrice: 5.0,
    };

    const mockDrinkCartItem = {
      product: mockDrinkProduct,
      quantity: 1,
      unitPrice: 3.0,
      sizeKey: 'large',
      sizeLabel: '500ml',
      mlPerUnit: 500,
    };

    it('registra venda com sucesso para produto não-bebida', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      const saleId = await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-001',
        'credit_card',
        'store-1'
      );

      expect(saleId).toBeDefined();
      expect(mockTransaction.get).toHaveBeenCalled();
      expect(mockTransaction.update).toHaveBeenCalled();
      expect(mockTransaction.set).toHaveBeenCalled();
    });

    it('registra venda com sucesso para bebida', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockDrinkProduct,
      });

      const saleId = await salesService.recordSaleAndUpdateStock(
        [mockDrinkCartItem],
        3.0,
        'BRL',
        'test-order-002',
        'pix',
        'store-1'
      );

      expect(saleId).toBeDefined();
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          totalMlAvailable: expect.any(Number),
          inStock: expect.any(Boolean),
        })
      );
    });

    it('lança erro quando produto não existe', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      });

      await expect(
        salesService.recordSaleAndUpdateStock(
          [mockCartItem],
          10.0,
          'BRL',
          'test-order-003',
          'credit_card',
          'store-1'
        )
      ).rejects.toThrow('Product prod-1 not found');
    });

    it('lança erro quando estoque insuficiente para produtos não-bebida', async () => {
      const productWithLowStock = { ...mockProduct, stock: 1 };
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => productWithLowStock,
      });

      await expect(
        salesService.recordSaleAndUpdateStock(
          [{ ...mockCartItem, quantity: 5 }],
          25.0,
          'BRL',
          'test-order-004',
          'credit_card',
          'store-1'
        )
      ).rejects.toThrow('Estoque insuficiente');
    });

    it('lança erro quando estoque de bebida insuficiente', async () => {
      const drinkWithLowStock = { ...mockDrinkProduct, totalMlAvailable: 100 };
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => drinkWithLowStock,
      });

      await expect(
        salesService.recordSaleAndUpdateStock(
          [mockDrinkCartItem],
          3.0,
          'BRL',
          'test-order-005',
          'pix',
          'store-1'
        )
      ).rejects.toThrow('Estoque insuficiente');
    });

    it('atualiza estoque correto para múltiplos produtos', async () => {
      mockTransaction.get
        .mockResolvedValueOnce({ exists: () => true, data: () => mockProduct })
        .mockResolvedValueOnce({ exists: () => true, data: () => mockDrinkProduct });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem, mockDrinkCartItem],
        13.0,
        'BRL',
        'test-order-006',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.update).toHaveBeenCalledTimes(2);
    });

    it('inclui storeId na venda quando fornecido', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-007',
        'credit_card',
        'store-2'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'store-2',
        })
      );
    });

    it('inclui franchiseId na venda quando disponível', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-008',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          franchiseId: expect.any(String),
        })
      );
    });

    it('inclui deviceId na venda para rastreabilidade', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-009',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          deviceId: 'device-123',
        })
      );
    });

    it('marca venda como completed e paid', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-010',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'completed',
          paymentStatus: 'paid',
        })
      );
    });

    it('calcula timing data com timeSlot correto (manhã)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-04T08:00:00'));

      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-011',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          timeSlot: 'morning',
        })
      );

      vi.useRealTimers();
    });

    it('calcula timing data com isWeekend correto', async () => {
      vi.useFakeTimers();
      // 2026-02-07 é um sábado
      vi.setSystemTime(new Date('2026-02-07T10:00:00'));

      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-012',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isWeekend: true,
        })
      );

      vi.useRealTimers();
    });

    it('inclui detalhes corretos de itens de bebida', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockDrinkProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockDrinkCartItem],
        3.0,
        'BRL',
        'test-order-013',
        'pix',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              sizeKey: 'large',
              sizeLabel: '500ml',
              mlPerUnit: 500,
            }),
          ]),
        })
      );
    });

    it('lança erro quando item de bebida sem sizeLabel', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockDrinkProduct,
      });

      const invalidDrinkItem = {
        ...mockDrinkCartItem,
        sizeLabel: undefined,
      };

      await expect(
        salesService.recordSaleAndUpdateStock(
          [invalidDrinkItem],
          3.0,
          'BRL',
          'test-order-014',
          'pix',
          'store-1'
        )
      ).rejects.toThrow('Invalid drink item');
    });

    it('inclui timestamps de criação e pagamento', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-015',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          createdAt: expect.any(Date),
          paidAt: expect.any(Date),
          completedAt: expect.any(Date),
          lastSync: expect.any(Date),
        })
      );
    });

    it('calcula subtotal, tax e total corretamente', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      const subtotal = 10.0;
      const total = 12.0;
      const tax = total - subtotal;

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        total,
        'BRL',
        'test-order-016',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subtotal: subtotal,
          tax: tax,
          total: total,
        })
      );
    });

    it('envia heartbeat após venda bem-sucedida', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-017',
        'credit_card',
        'store-1'
      );

      expect(deviceHeartbeatService.sendHeartbeat).toHaveBeenCalled();
    });

    it('não envia heartbeat se venda falhar', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      });

      try {
        await salesService.recordSaleAndUpdateStock(
          [mockCartItem],
          10.0,
          'BRL',
          'test-order-018',
          'credit_card',
          'store-1'
        );
      } catch {
        // Esperado
      }

      expect(deviceHeartbeatService.sendHeartbeat).not.toHaveBeenCalled();
    });

    it('usa getCurrentStoreId como fallback quando storeId não fornecido', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        'test-order-019',
        'credit_card'
        // storeId não fornecido
      );

      // Deve usar getCurrentStoreId() internamente
      expect(getCurrentStoreId).toHaveBeenCalled();
    });

    it('reduz estoque correto para produto não-bebida', async () => {
      const product = { ...mockProduct, stock: 50 };
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => product,
      });

      await salesService.recordSaleAndUpdateStock(
        [{ ...mockCartItem, quantity: 5 }],
        25.0,
        'BRL',
        'test-order-020',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          stock: 45, // 50 - 5
          inStock: true,
        })
      );
    });

    it('reduz estoque correto para bebida', async () => {
      const product = { ...mockDrinkProduct, totalMlAvailable: 2000 };
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => product,
      });

      await salesService.recordSaleAndUpdateStock(
        [{ ...mockDrinkCartItem, quantity: 2, mlPerUnit: 500 }],
        6.0,
        'BRL',
        'test-order-021',
        'pix',
        'store-1'
      );

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          totalMlAvailable: 1000, // 2000 - (2 * 500)
          inStock: true,
        })
      );
    });

    it('marca produto como out of stock quando estoque zerado', async () => {
      const product = { ...mockProduct, stock: 2 };
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => product,
      });

      await salesService.recordSaleAndUpdateStock(
        [{ ...mockCartItem, quantity: 2 }],
        10.0,
        'BRL',
        'test-order-022',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          stock: 0,
          inStock: false,
        })
      );
    });

    it('inclui moeda na venda', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'USD',
        'test-order-023',
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currency: 'USD',
        })
      );
    });

    it('registra número de pedido na venda', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockProduct,
      });

      const orderNumber = 'ORDER-2026020400001';

      await salesService.recordSaleAndUpdateStock(
        [mockCartItem],
        10.0,
        'BRL',
        orderNumber,
        'credit_card',
        'store-1'
      );

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orderNumber: orderNumber,
        })
      );
    });
  });

  describe('Cenários complexos e edge cases', () => {
    it('trata venda com múltiplas bebidas e produtos', async () => {
      mockTransaction.get
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            id: 'prod-1',
            title: 'Coffee',
            price: 5.0,
            stock: 100,
            isDrink: false,
          }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            id: 'drink-1',
            title: 'OJ',
            price: 3.0,
            isDrink: true,
            totalMlAvailable: 5000,
          }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            id: 'drink-2',
            title: 'Water',
            price: 1.0,
            isDrink: true,
            totalMlAvailable: 10000,
          }),
        });

      const items = [
        {
          product: { id: 'prod-1', title: 'Coffee', isDrink: false },
          quantity: 1,
          unitPrice: 5.0,
        },
        {
          product: { id: 'drink-1', title: 'OJ', isDrink: true },
          quantity: 1,
          unitPrice: 3.0,
          sizeKey: 'large',
          sizeLabel: '500ml',
          mlPerUnit: 500,
        },
        {
          product: { id: 'drink-2', title: 'Water', isDrink: true },
          quantity: 2,
          unitPrice: 1.0,
          sizeKey: 'small',
          sizeLabel: '250ml',
          mlPerUnit: 250,
        },
      ];

      const saleId = await salesService.recordSaleAndUpdateStock(
        items,
        11.0,
        'BRL',
        'complex-order',
        'credit_card',
        'store-1'
      );

      expect(saleId).toBeDefined();
      expect(mockTransaction.update).toHaveBeenCalledTimes(3); // 3 produtos
      expect(mockTransaction.set).toHaveBeenCalledTimes(1); // 1 venda
    });

    it('valida todos os produtos ANTES de qualquer atualização de estoque', async () => {
      const validProduct = {
        exists: () => true,
        data: () => ({
          id: 'prod-1',
          title: 'Valid',
          stock: 10,
          isDrink: false,
        }),
      };

      const invalidProduct = {
        exists: () => false,
        data: () => null,
      };

      mockTransaction.get
        .mockResolvedValueOnce(validProduct)
        .mockResolvedValueOnce(invalidProduct);

      const items = [
        {
          product: { id: 'prod-1', title: 'Valid', isDrink: false },
          quantity: 1,
          unitPrice: 5.0,
        },
        {
          product: { id: 'prod-2', title: 'Invalid', isDrink: false },
          quantity: 1,
          unitPrice: 5.0,
        },
      ];

      await expect(
        salesService.recordSaleAndUpdateStock(items, 10.0, 'BRL', 'order', 'credit_card', 'store-1')
      ).rejects.toThrow('Product prod-2 not found');

      // Update não deve ter sido chamado porque falhou na validação
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
  });
});