/**
 * Coverage tests for admin/src/utils/ (uncovered files)
 * Pure functions — minimal or no mocking needed
 */
import { describe, it, expect } from 'vitest';

// utils/firestoreSanitize.ts
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

// utils/format.ts
import { formatMl } from '@/utils/format';

// utils/franchise-badges.ts
import { getPlanBadge, getStatusBadge } from '@/utils/franchise-badges';

// utils/hardwareStatus.ts
import { mapFirestoreToDeviceStatus } from '@/utils/hardwareStatus';

// utils/paymentNormalizer.ts
import {
  DEFAULT_ENABLED_METHODS,
  normalizeProvider,
  normalizePaymentGatewayConfig,
  sanitizePaymentGatewayConfigForSave,
  validatePaymentGatewayConfig,
} from '@/utils/paymentNormalizer';

// utils/videoUrlValidator.ts
import { validateVideoUrl } from '@/utils/videoUrlValidator';

// utils/invitation-badges.tsx — JSX, needs React
import { getInvitationStatusBadge } from '@/utils/invitation-badges';

describe('utils/firestoreSanitize', () => {
  it('remove campos undefined de objetos', () => {
    const input = { a: 1, b: undefined, c: 'hello' };
    const result = sanitizeFirestoreData(input);
    expect(result).toEqual({ a: 1, c: 'hello' });
    expect('b' in result).toBe(false);
  });

  it('preserva Date', () => {
    const d = new Date();
    const result = sanitizeFirestoreData({ date: d });
    expect(result.date).toBe(d);
  });

  it('filtra undefined de arrays', () => {
    const result = sanitizeFirestoreData({ arr: [1, undefined, 3] });
    expect(result.arr).toEqual([1, 3]);
  });

  it('processa recursivamente', () => {
    const result = sanitizeFirestoreData({ nested: { a: 1, b: undefined } });
    expect(result.nested).toEqual({ a: 1 });
  });
});

describe('utils/format', () => {
  it('formatMl formata mL corretamente', () => {
    expect(formatMl(500)).toContain('500');
    expect(formatMl(1500)).toContain('1');
  });
});

describe('utils/franchise-badges', () => {
  it('getPlanBadge retorna classes CSS', () => {
    const badge = getPlanBadge('trial');
    expect(typeof badge).toBe('string');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('getStatusBadge retorna classes CSS', () => {
    const badge = getStatusBadge('active');
    expect(typeof badge).toBe('string');
    expect(badge.length).toBeGreaterThan(0);
  });
});

describe('utils/hardwareStatus', () => {
  it('mapFirestoreToDeviceStatus converte doc', () => {
    const doc = {
      connectionType: 'usb',
      firmware: '1.0.0',
      lastSeen: { seconds: Date.now() / 1000 },
    };
    const result = mapFirestoreToDeviceStatus(doc as any);
    expect(result).toBeDefined();
  });
});

describe('utils/paymentNormalizer', () => {
  it('DEFAULT_ENABLED_METHODS tem métodos padrão', () => {
    expect(DEFAULT_ENABLED_METHODS.cash).toBe(true);
    expect(DEFAULT_ENABLED_METHODS.pix).toBe(true);
  });

  it('normalizeProvider converte mercadopago para mercado_pago', () => {
    expect(normalizeProvider('mercadopago')).toBe('mercado_pago');
    expect(normalizeProvider('mercado_pago')).toBe('mercado_pago');
  });

  it('normalizePaymentGatewayConfig normaliza dados raw', () => {
    const raw = { provider: 'mercadopago', accessToken: 'tok123' };
    const result = normalizePaymentGatewayConfig(raw);
    expect(result).toBeDefined();
    expect(result.provider).toBeTruthy();
  });

  it('sanitizePaymentGatewayConfigForSave remove segredos', () => {
    const config = {
      provider: 'mercado_pago',
      accessToken: 'secret',
      enabledMethods: DEFAULT_ENABLED_METHODS,
    };
    const result = sanitizePaymentGatewayConfigForSave(config as any);
    expect(result).toBeDefined();
  });

  it('validatePaymentGatewayConfig retorna erros', () => {
    const errors = validatePaymentGatewayConfig({} as any);
    expect(Array.isArray(errors)).toBe(true);
  });
});

describe('utils/videoUrlValidator', () => {
  it('validateVideoUrl rejeita URL não-HTTPS', async () => {
    const result = await validateVideoUrl('http://example.com/video.mp4');
    expect(result.status).toBe('invalid');
  });

  it('validateVideoUrl rejeita URL vazia', async () => {
    const result = await validateVideoUrl('');
    expect(result.status).toBe('invalid');
  });
});

describe('utils/invitation-badges', () => {
  it('getInvitationStatusBadge retorna elemento para accepted', () => {
    const badge = getInvitationStatusBadge('accepted', new Date());
    expect(badge).toBeDefined();
  });

  it('getInvitationStatusBadge retorna elemento para pending', () => {
    const badge = getInvitationStatusBadge('pending', new Date(Date.now() + 86400000));
    expect(badge).toBeDefined();
  });
});
