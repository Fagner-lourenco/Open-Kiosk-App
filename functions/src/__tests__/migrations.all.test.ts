/**
 * Tests for migrations (consolidatePaymentGatewayConfig, unifyStoreSettings, migrateDispensersToTaps)
 * Covers: auth checks, validation
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet, update: docUpdate }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [], forEach: vi.fn() });
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet }));

  return { docGet, docSet, docUpdate, docFn, collectionFn, colGet };
});

vi.mock('../lib', () => ({
  db: { doc: mocks.docFn, collection: mocks.collectionFn },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
        delete: vi.fn(() => 'DELETED'),
      },
    },
  },
  requireAuth: vi.fn((ctx: any) => { if (!ctx.auth) throw new Error('Usuário não autenticado'); }),
  requireSuperAdmin: vi.fn((ctx: any) => {
    if (ctx.auth?.token?.role !== 'superadmin') throw new Error('Apenas super admins');
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = typeof _opts === 'function' ? _opts : handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

vi.mock('../payments/storeConfig', () => ({
  normalizePaymentGatewayConfig: vi.fn().mockReturnValue(null),
}));

describe('migrations', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('consolidatePaymentGatewayConfig', () => {
    it('exporta a função', async () => {
      const mod = await import('../migrations/consolidatePaymentGatewayConfig');
      expect(mod.consolidatePaymentGatewayConfig).toBeDefined();
    });

    it('rejeita não autenticado', async () => {
      const mod = await import('../migrations/consolidatePaymentGatewayConfig');
      const run = (mod.consolidatePaymentGatewayConfig as any).run;
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });
  });

  describe('unifyStoreSettings', () => {
    it('exporta a função', async () => {
      const mod = await import('../migrations/unifyStoreSettings');
      expect(mod.unifyStoreSettings).toBeDefined();
    });

    it('rejeita não autenticado', async () => {
      const mod = await import('../migrations/unifyStoreSettings');
      const run = (mod.unifyStoreSettings as any).run;
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });
  });

  describe('migrateDispensersToTaps', () => {
    it('exporta a função', async () => {
      const mod = await import('../migrations/migrateDispensersToTaps');
      expect(mod.migrateDispensersToTaps).toBeDefined();
    });

    it('rejeita não autenticado', async () => {
      const mod = await import('../migrations/migrateDispensersToTaps');
      const run = (mod.migrateDispensersToTaps as any).run;
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });
  });
});
