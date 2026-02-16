import { describe, expect, it } from 'vitest';
import { sanitizeForLog, stripSensitiveFields } from '../lib/sanitize';

describe('sanitize coverage', () => {
  it('handles primitives, depth and pan masking in strings', () => {
    expect(sanitizeForLog('card 4111111111111111')).toBe('card ****1111');
    expect(sanitizeForLog(123)).toBe(123);
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
    expect(sanitizeForLog({ a: { b: 1 } }, 0)).toBe('[MAX_DEPTH]');
  });

  it('sanitizes arrays and nested objects', () => {
    const input = [
      { email: 'john@example.com', token: 'abc', cardNumber: '5555444433331111' },
      { holderName: 'Joao Silva', cvc: 123, meta: { note: 'ok', pan: '4444333322221111' } },
    ];

    const output = sanitizeForLog(input) as Array<Record<string, unknown>>;
    expect(output[0].email).toBe('j***m');
    expect(output[0].token).toBe('[REDACTED]');
    expect(output[0].cardNumber).toBe('****1111');
    expect(output[1].holderName).toBe('J***a');
    expect(output[1].cvc).toBe('[REDACTED]');
    expect(output[1].meta).toEqual({ note: 'ok', pan: '****1111' });
  });

  it('redacts short names and non-string sensitive values', () => {
    const out = sanitizeForLog({
      holder_name: 'AB',
      password: 123456,
      authorization: '',
      api_key: 'my-key',
    }) as Record<string, unknown>;

    expect(out.holder_name).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.api_key).toBe('[REDACTED]');
  });

  it('strips sensitive fields for storage', () => {
    const stripped = stripSensitiveFields({
      email: 'john@example.com',
      token: 'secret',
      safe: 'value',
      amount: 10,
    });

    expect(stripped).toEqual({ safe: 'value', amount: 10 });
  });
});



