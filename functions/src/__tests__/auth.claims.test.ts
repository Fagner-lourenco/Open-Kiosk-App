/**
 * Tests for auth/claims.ts (callable functions)
 * Covers: setAdminClaims, syncMembershipClaims, getClaimsForUser, refreshUserToken
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const getUser = vi.fn().mockResolvedValue({
    uid: 'u1',
    customClaims: { role: 'operator' },
  });
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet, update: docUpdate }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const where = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where }));

  return { setCustomUserClaims, getUser, docFn, docGet, docSet, docUpdate, collectionFn, colGet };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
  admin: {
    auth: () => ({
      setCustomUserClaims: mocks.setCustomUserClaims,
      getUser: mocks.getUser,
    }),
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
    },
  },
  requireAuth: vi.fn((ctx: any) => {
    if (!ctx.auth) throw new Error('Usuário não autenticado');
  }),
  requireRole: vi.fn(),
  requireOwnerOrAdmin: vi.fn(),
  requireManager: vi.fn(),
  requireFranchiseAccess: vi.fn(),
  requireSuperAdmin: vi.fn((ctx: any) => {
    if (ctx.auth?.token?.role !== 'superadmin') throw new Error('Apenas super admins');
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'HttpsError'; }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = typeof _opts === 'function' ? _opts : handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import * as claims from '../auth/claims';

describe('auth/claims', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exports setAdminClaims', () => {
    expect(claims.setAdminClaims).toBeDefined();
  });

  it('exports syncMembershipClaims', () => {
    expect(claims.syncMembershipClaims).toBeDefined();
  });

  it('exports getClaimsForUser', () => {
    expect(claims.getClaimsForUser).toBeDefined();
  });

  it('exports refreshUserToken', () => {
    expect(claims.refreshUserToken).toBeDefined();
  });

  describe('getClaimsForUser', () => {
    it('rejeita não autenticado', async () => {
      const run = (claims.getClaimsForUser as any).run;
      await expect(run({ data: { uid: 'u1' } })).rejects.toThrow(/autenticad/i);
    });

    it('retorna claims de um user', async () => {
      const run = (claims.getClaimsForUser as any).run;
      mocks.getUser.mockResolvedValueOnce({
        uid: 'u1',
        customClaims: { role: 'admin', franchiseId: 'f1' },
      });

      const result = await run({
        data: { uid: 'u1' },
        auth: { uid: 'caller', token: { role: 'superadmin' } },
      });

      expect(result).toBeDefined();
    });
  });

  describe('refreshUserToken', () => {
    it('rejeita sem autenticação', async () => {
      const run = (claims.refreshUserToken as any).run;
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });
  });
});
