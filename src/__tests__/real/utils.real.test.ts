import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('lib/utils', () => {
  describe('cn (class names)', () => {
    it('combina classes simples', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('mescla classes tailwind conflitantes', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });

    it('lida com undefined e null', () => {
      expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
    });

    it('lida com arrays', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });

    it('lida com objetos condicionais', () => {
      expect(cn('base', { active: true, disabled: false })).toBe('base active');
    });

    it('retorna string vazia para inputs vazios', () => {
      expect(cn()).toBe('');
    });

    it('combina múltiplas classes tailwind corretamente', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('preserva classes não conflitantes', () => {
      expect(cn('text-white', 'bg-blue-500', 'p-4')).toBe('text-white bg-blue-500 p-4');
    });
  });
});
