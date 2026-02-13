import { describe, it, expect } from 'vitest';
import { getCartItemKey, getMaxQuantity, getStockDisplay, isLowStock } from '@/utils/productUtils';
import type { Product, CartItem } from '@/types/product';

const mockProduct: Product = {
  id: 'prod-1',
  title: 'Test Product',
  price: 10.00,
  description: '',
  tags: [],
  inStock: true,
  stock: 20,
  minStock: 5,
  isDrink: false,
  storeId: 'store-1',
  category: 'snacks',
};

const mockDrinkProduct: Product = {
  id: 'drink-1',
  title: 'Test Drink',
  price: 5.00,
  description: '',
  tags: [],
  inStock: true,
  stock: 0,
  isDrink: true,
  totalMlAvailable: 2000,
  defaultSizeKey: 'medium',
  sizes: [
    { key: 'small', label: 'Pequeno', ml: 200, price: 3.00 },
    { key: 'medium', label: 'Médio', ml: 400, price: 5.00 },
    { key: 'large', label: 'Grande', ml: 600, price: 7.00 },
  ],
  storeId: 'store-1',
  category: 'drinks',
};

describe('productUtils', () => {
  describe('getCartItemKey', () => {
    it('retorna apenas productId quando sizeKey não é fornecido', () => {
      expect(getCartItemKey('prod-1')).toBe('prod-1');
    });

    it('retorna productId#sizeKey quando sizeKey é fornecido', () => {
      expect(getCartItemKey('prod-1', 'large')).toBe('prod-1#large');
    });

    it('retorna productId quando sizeKey é undefined', () => {
      expect(getCartItemKey('prod-1', undefined)).toBe('prod-1');
    });
  });

  describe('getMaxQuantity', () => {
    it('retorna stock do produto normal sem itens no carrinho', () => {
      expect(getMaxQuantity(mockProduct)).toBe(20);
    });

    it('retorna stock menos itens no carrinho para produto normal', () => {
      const cartItems: CartItem[] = [
        { product: mockProduct, quantity: 5, unitPrice: 10 },
      ];
      expect(getMaxQuantity(mockProduct, undefined, cartItems)).toBe(15);
    });

    it('retorna 0 quando stock é 0', () => {
      const noStockProduct = { ...mockProduct, stock: 0 };
      expect(getMaxQuantity(noStockProduct)).toBe(0);
    });

    it('calcula ml disponível para bebidas', () => {
      // 2000ml total, medium = 400ml, então max = 5
      expect(getMaxQuantity(mockDrinkProduct, 'medium')).toBe(5);
    });

    it('calcula ml disponível para bebidas com itens no carrinho', () => {
      const cartItems: CartItem[] = [
        { product: mockDrinkProduct, quantity: 2, unitPrice: 5, mlPerUnit: 400 },
      ];
      // 2000 - (2*400) = 1200ml, medium = 400ml, max = 3
      expect(getMaxQuantity(mockDrinkProduct, 'medium', cartItems)).toBe(3);
    });

    it('retorna 0 quando tamanho não existe', () => {
      expect(getMaxQuantity(mockDrinkProduct, 'nonexistent')).toBe(0);
    });

    it('usa defaultSizeKey quando sizeKey não é fornecido para bebidas', () => {
      // default = medium = 400ml, 2000/400 = 5
      expect(getMaxQuantity(mockDrinkProduct)).toBe(5);
    });
  });

  describe('getStockDisplay', () => {
    it('mostra ml disponível para bebidas', () => {
      expect(getStockDisplay(mockDrinkProduct)).toBe('2000ml disponivel');
    });

    it('mostra estoque para produtos normais', () => {
      expect(getStockDisplay(mockProduct)).toBe('20 em estoque');
    });

    it('mostra 0ml para bebida sem ml disponível', () => {
      const emptyDrink = { ...mockDrinkProduct, totalMlAvailable: undefined };
      expect(getStockDisplay(emptyDrink)).toBe('0ml disponivel');
    });

    it('mostra 0 para produto sem stock', () => {
      const noStock = { ...mockProduct, stock: undefined };
      expect(getStockDisplay(noStock)).toBe('0 em estoque');
    });
  });

  describe('isLowStock', () => {
    it('retorna true para bebida com menos de 500ml', () => {
      const lowDrink = { ...mockDrinkProduct, totalMlAvailable: 400 };
      expect(isLowStock(lowDrink)).toBe(true);
    });

    it('retorna false para bebida com mais de 500ml', () => {
      expect(isLowStock(mockDrinkProduct)).toBe(false);
    });

    it('retorna true para produto normal com estoque <= minStock', () => {
      const lowStock = { ...mockProduct, stock: 5, minStock: 5 };
      expect(isLowStock(lowStock)).toBe(true);
    });

    it('retorna false para produto normal com estoque > minStock', () => {
      expect(isLowStock(mockProduct)).toBe(false);
    });

    it('retorna false para produto com estoque 0', () => {
      const noStock = { ...mockProduct, stock: 0 };
      expect(isLowStock(noStock)).toBe(false);
    });

    it('usa minStock padrão de 5 quando não definido', () => {
      const noMinStock = { ...mockProduct, stock: 4, minStock: undefined };
      expect(isLowStock(noMinStock)).toBe(true);
    });
  });
});
