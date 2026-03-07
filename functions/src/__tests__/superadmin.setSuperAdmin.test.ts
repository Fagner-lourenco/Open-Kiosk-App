/**
 * Tests for superadmin/setSuperAdmin.ts
 * Covers: setSuperAdmin, removeSuperAdmin, listSuperAdmins
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docDelete = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet, update: docUpdate, delete: docDelete }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const limit = vi.fn().mockReturnThis();
  const orderByFn = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, limit, orderBy: orderByFn }));
  const getUserByEmail = vi.fn().mockResolvedValue({
    uid: 'u1', email: 'a@b.com', displayName: 'Test', photoURL: null,
  });
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const getUser = vi.fn().mockResolvedValue({ customClaims: {} });
  const runTransaction = vi.fn(async (cb: any) => {
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
      set: vi.fn(),
      update: vi.fn(),
    };
    return cb(tx);
  });

  return { docSet, docGet, docFn, collectionFn, colGet, getUserByEmail, setCustomUserClaims, getUser, runTransaction, docDelete, docUpdate };
});

vi.mock('../lib', () => ({
  db: {
    collection: mocks.collectionFn,
    doc: mocks.docFn,
    runTransaction: mocks.runTransaction,
  },
  auth: {
    getUserByEmail: mocks.getUserByEmail,
    setCustomUserClaims: mocks.setCustomUserClaims,
    getUser: mocks.getUser,
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (...args: any[]) => {
    const handler = args.length === 2 ? args[1] : args[0];
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { setSuperAdmin, removeSuperAdmin, listSuperAdmins } from '../superadmin/setSuperAdmin';

describe('superadmin/setSuperAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('setSuperAdmin', () => {
    const run = (setSuperAdmin as any).run;

    it('rejeita não autenticado', async () => {
      await expect(run({ data: { email: 'a@b.com' } })).rejects.toThrow(/autenticad/i);
    });

    it('rejeita non-superadmin quando já existe superadmin', async () => {
      mocks.colGet.mockResolvedValueOnce({ empty: false, docs: [{}] });
      await expect(run({
        data: { email: 'a@b.com' },
        auth: { uid: 'u1', token: { role: 'admin' } },
      })).rejects.toThrow(/super admin|permiss/i);
    });

    it('aceita first setup sem superadmin existente', async () => {
      mocks.colGet.mockResolvedValueOnce({ empty: true, docs: [] });
      const result = await run({
        data: { email: 'a@b.com' },
        auth: { uid: 'u1', token: { role: 'admin', email: 'a@b.com' } },
      });
      expect(result.success).toBe(true);
    });

    it('rejeita sem email', async () => {
      await expect(run({
        data: {},
        auth: { uid: 'u1', token: { role: 'superadmin' } },
      })).rejects.toThrow(/email|obrigatório/i);
    });
  });

  describe('removeSuperAdmin', () => {
    const run = (removeSuperAdmin as any).run;

    it('rejeita não autenticado', async () => {
      await expect(run({ data: { uid: 'u1' } })).rejects.toThrow(/autenticad/i);
    });

    it('rejeita non-superadmin', async () => {
      await expect(run({
        data: { uid: 'u2' },
        auth: { uid: 'u1', token: { role: 'admin' } },
      })).rejects.toThrow(/super admin|permiss/i);
    });

    it('rejeita auto-remoção', async () => {
      await expect(run({
        data: { uid: 'u1' },
        auth: { uid: 'u1', token: { role: 'superadmin' } },
      })).rejects.toThrow(/próprio|yourself/i);
    });
  });

  describe('listSuperAdmins', () => {
    const run = (listSuperAdmins as any).run;

    it('rejeita não autenticado', async () => {
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });

    it('superadmin pode listar', async () => {
      mocks.colGet.mockResolvedValueOnce({
        docs: [{ id: 'u1', data: () => ({ email: 'a@b.com' }) }],
      });
      const result = await run({
        data: {},
        auth: { uid: 'u1', token: { role: 'superadmin' } },
      });
      expect(result.success).toBe(true);
      expect(result.superAdmins).toBeDefined();
    });
  });
});
