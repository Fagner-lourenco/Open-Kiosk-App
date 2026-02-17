/**
 * Tests for auth/setCustomClaims.ts
 * Covers: callable - auth, validation, role hierarchy
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({ role: 'operator', franchiseId: 'f1', storeId: 's1' }) });
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, update: docUpdate }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const getUser = vi.fn().mockResolvedValue({ customClaims: {} });

  return { docGet, docUpdate, docFn, collectionFn, setCustomUserClaims, getUser };
});

vi.mock('../lib', () => ({
  db: { collection: mocks.collectionFn, doc: mocks.docFn },
  admin: {
    auth: () => ({ setCustomUserClaims: mocks.setCustomUserClaims, getUser: mocks.getUser }),
    firestore: { FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') } },
  },
  requireAuth: vi.fn((ctx: any) => { if (!ctx.auth) throw new Error('Usuário não autenticado'); }),
  requireOwnerOrAdmin: vi.fn((ctx: any) => {
    const role = ctx.auth?.token?.role;
    if (!['owner', 'admin'].includes(role)) throw new Error('permission-denied');
  }),
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { setCustomClaims } from '../auth/setCustomClaims';

const run = (setCustomClaims as any).run;

describe('auth/setCustomClaims', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita não autenticado', async () => {
    await expect(run({ data: { userId: 'u1' } })).rejects.toThrow(/autenticad/i);
  });

  it('rejeita role sem permissão', async () => {
    await expect(run({
      data: { userId: 'u1' },
      auth: { uid: 'caller', token: { role: 'viewer', franchiseId: 'f1' } },
    })).rejects.toThrow(/permission/i);
  });

  it('rejeita sem userId', async () => {
    await expect(run({
      data: {},
      auth: { uid: 'caller', token: { role: 'owner', franchiseId: 'f1' } },
    })).rejects.toThrow(/userId|obrigatório/i);
  });

  it('rejeita cross-franchise', async () => {
    // User in franchise f1, target in franchise f1 (same) but claims for f2
    mocks.docGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'operator', franchiseId: 'f2', storeId: 's1' }),
    });

    await expect(run({
      data: { userId: 'target' },
      auth: { uid: 'caller', token: { role: 'admin', franchiseId: 'f1' } },
    })).rejects.toThrow(/franquia|permission/i);
  });

  it('owner pode atualizar claims', async () => {
    mocks.docGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ role: 'operator', franchiseId: 'f1', storeId: 's1' }),
    });

    const result = await run({
      data: { userId: 'target', role: 'manager' },
      auth: { uid: 'caller', token: { role: 'owner', franchiseId: 'f1' } },
    });
    expect(result.success).toBe(true);
    expect(mocks.setCustomUserClaims).toHaveBeenCalled();
  });
});
