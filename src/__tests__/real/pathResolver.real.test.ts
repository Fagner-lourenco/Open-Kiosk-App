import { describe, it, expect } from 'vitest';
import { storesPath } from '@/lib/pathResolver';

describe('pathResolver', () => {
  describe('storesPath', () => {
    it('retorna path correto com franchiseId', () => {
      expect(storesPath('franchise-1')).toBe('franchises/franchise-1/stores');
    });

    it('é uma função', () => {
      expect(typeof storesPath).toBe('function');
    });
  });
});
