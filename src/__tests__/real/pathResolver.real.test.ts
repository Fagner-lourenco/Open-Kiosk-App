import { describe, it, expect } from 'vitest';
import { isFranchiseMode, storesPath } from '@/lib/pathResolver';

describe('pathResolver', () => {
  describe('isFranchiseMode', () => {
    it('retorna um valor booleano', () => {
      const result = isFranchiseMode();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('storesPath', () => {
    it('retorna "stores" quando franchiseId não fornecido', () => {
      expect(storesPath()).toBe('stores');
    });

    it('é uma função', () => {
      expect(typeof storesPath).toBe('function');
    });
  });
});
