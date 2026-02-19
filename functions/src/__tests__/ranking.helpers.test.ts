/**
 * Tests for ranking/helpers.ts (pure functions — no mocking)
 * Covers: maskName, getCustomerId, calcTotalMl, calcFavoriteDrink, todayYMD, generatePrizeCode
 */
import { describe, it, expect } from 'vitest';
import {
  maskName,
  getCustomerId,
  calcTotalMl,
  calcFavoriteDrink,
  todayYMD,
  generatePrizeCode,
} from '../ranking/helpers';

describe('ranking/helpers', () => {
  describe('maskName', () => {
    it('nome único não mascara', () => {
      expect(maskName('João')).toBe('João');
    });

    it('mascara sobrenomes (LGPD)', () => {
      expect(maskName('João Miguel Santos')).toBe('João M. S.');
    });

    it('trata string vazia', () => {
      expect(maskName('')).toBe('');
    });

    it('trata espaços extras', () => {
      expect(maskName('  Ana  Beatriz  ')).toBe('Ana B.');
    });

    it('preserva tokens numéricos (fallback ranking: cartão/CPF)', () => {
      expect(maskName('Cervejeiro 5557')).toBe('Cervejeiro 5557');
    });

    it('preserva números mas mascara texto misto', () => {
      expect(maskName('Cervejeiro Anônimo')).toBe('Cervejeiro A.');
    });

    it('preserva múltiplos tokens numéricos', () => {
      expect(maskName('Cliente 1234 5678')).toBe('Cliente 1234 5678');
    });
  });

  describe('getCustomerId', () => {
    it('usa customerIdentification (CPF) quando disponível', () => {
      expect(getCustomerId({ customerIdentification: '123.456.789-00' })).toBe('12345678900');
    });

    it('fallback para customerName normalizado', () => {
      expect(getCustomerId({ customerName: 'João Silva' })).toBe('JOÃO_SILVA');
    });

    it('retorna "unknown" sem dados', () => {
      expect(getCustomerId({})).toBe('UNKNOWN');
    });
  });

  describe('calcTotalMl', () => {
    it('retorna 0 para null/undefined', () => {
      expect(calcTotalMl(undefined)).toBe(0);
      expect(calcTotalMl(null as any)).toBe(0);
    });

    it('calcula soma de mL', () => {
      const items = [
        { productId: 'p1', title: 'IPA', quantity: 2, price: 10, total: 20, mlPerUnit: 500 },
        { productId: 'p2', title: 'Lager', quantity: 1, price: 8, total: 8, mlPerUnit: 300 },
      ];
      expect(calcTotalMl(items)).toBe(1300); // 2*500 + 1*300
    });

    it('ignora items sem mlPerUnit', () => {
      const items = [
        { productId: 'p1', title: 'Batata', quantity: 1, price: 15, total: 15 },
      ];
      expect(calcTotalMl(items)).toBe(0);
    });
  });

  describe('calcFavoriteDrink', () => {
    it('retorna N/A para lista vazia', () => {
      expect(calcFavoriteDrink([])).toBe('N/A');
      expect(calcFavoriteDrink(undefined)).toBe('N/A');
    });

    it('retorna drink com mais mL', () => {
      const items = [
        { productId: 'p1', title: 'IPA - 500ml', quantity: 3, price: 10, total: 30, mlPerUnit: 500 },
        { productId: 'p2', title: 'Pilsen - 300ml', quantity: 1, price: 8, total: 8, mlPerUnit: 300 },
      ];
      expect(calcFavoriteDrink(items)).toBe('IPA');
    });
  });

  describe('todayYMD', () => {
    it('formato YYYY-MM-DD', () => {
      const result = todayYMD();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('generatePrizeCode', () => {
    it('gera 8 caracteres', () => {
      const code = generatePrizeCode();
      expect(code).toHaveLength(8);
    });

    it('exclui caracteres ambíguos', () => {
      // Charset: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 — excludes 0, O, I, 1
      for (let i = 0; i < 50; i++) {
        const code = generatePrizeCode();
        expect(code).not.toMatch(/[0OI1]/);
      }
    });

    it('gera códigos únicos', () => {
      const codes = new Set(Array.from({ length: 20 }, generatePrizeCode));
      expect(codes.size).toBeGreaterThan(15); // At least 75% unique
    });
  });
});
