/**
 * Tests for lib/sanitize.ts (pure functions)
 * Covers: sanitizeForLog, stripSensitiveFields
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForLog, stripSensitiveFields } from '../lib/sanitize';

describe('lib/sanitize', () => {
  describe('sanitizeForLog', () => {
    it('null/undefined passam direto', () => {
      expect(sanitizeForLog(null)).toBeNull();
      expect(sanitizeForLog(undefined)).toBeUndefined();
    });

    it('números passam direto', () => {
      expect(sanitizeForLog(42)).toBe(42);
    });

    it('mascara PAN em string', () => {
      const result = sanitizeForLog('Card 4111111111111111 ok') as string;
      expect(result).toContain('****1111');
      expect(result).not.toContain('4111111111111111');
    });

    it('redacta campo cvv', () => {
      const result = sanitizeForLog({ cvv: '123', name: 'OK' }) as any;
      expect(result.cvv).toBe('[REDACTED]');
      expect(result.name).toBe('OK');
    });

    it('redacta campo password', () => {
      const result = sanitizeForLog({ password: 'secret123' }) as any;
      expect(result.password).toBe('[REDACTED]');
    });

    it('redacta campo encrypted', () => {
      const result = sanitizeForLog({ encrypted: 'enc_blob_abc' }) as any;
      expect(result.encrypted).toBe('[REDACTED]');
    });

    it('mascara email parcialmente', () => {
      const result = sanitizeForLog({ email: 'test@example.com' }) as any;
      expect(result.email).toMatch(/^t\*\*\*m$/);
    });

    it('redacta token/secret/api_key', () => {
      const result = sanitizeForLog({
        token: 'tok_123',
        secret: 'sec_456',
        api_key: 'key_789',
      }) as any;
      expect(result.token).toBe('[REDACTED]');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
    });

    it('processa arrays', () => {
      const result = sanitizeForLog([{ cvv: '123' }, 'ok']) as any[];
      expect(result[0].cvv).toBe('[REDACTED]');
      expect(result[1]).toBe('ok');
    });

    it('respeita maxDepth', () => {
      const deep = { a: { b: { c: { d: 'val' } } } };
      const result = sanitizeForLog(deep, 2) as any;
      // After depth 2, should hit [MAX_DEPTH]
      expect(JSON.stringify(result)).toContain('MAX_DEPTH');
    });
  });

  describe('stripSensitiveFields', () => {
    it('remove campos sensíveis', () => {
      const obj = {
        orderId: 'o1',
        cvv: '123',
        cardNumber: '4111...',
        amount: 50,
        email: 'test@example.com',
      };
      const result = stripSensitiveFields(obj);
      expect(result).toHaveProperty('orderId', 'o1');
      expect(result).toHaveProperty('amount', 50);
      expect(result).not.toHaveProperty('cvv');
      expect(result).not.toHaveProperty('cardNumber');
      expect(result).not.toHaveProperty('email');
    });

    it('preserva campos não-sensíveis', () => {
      const obj = { status: 'paid', method: 'pix', provider: 'pagbank' };
      const result = stripSensitiveFields(obj);
      expect(result).toEqual(obj);
    });
  });
});
