/**
 * Tests for lib/claims.ts
 * Covers: setUserClaims, getUserClaims, updateUserRole, promoteSuperAdmin, revokeSuperAdmin
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const getUser = vi.fn().mockResolvedValue({ uid: 'u1', customClaims: { role: 'admin', franchiseId: 'f1', storeId: null } });

  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const docFn = vi.fn(() => ({ update: docUpdate, set: docSet, get: docGet }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));
  const runTransaction = vi.fn(async (cb: any) => {
    const transaction = {
      get: vi.fn().mockResolvedValue({ exists: true }),
      set: vi.fn(),
      update: vi.fn(),
    };
    return cb(transaction);
  });

  return { setCustomUserClaims, getUser, docFn, docUpdate, docSet, collectionFn, runTransaction };
});

vi.mock('../lib/firebase', () => ({
  auth: {
    setCustomUserClaims: mocks.setCustomUserClaims,
    getUser: mocks.getUser,
  },
  db: {
    collection: mocks.collectionFn,
    doc: mocks.docFn,
    runTransaction: mocks.runTransaction,
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('../lib/auth', () => ({
  type: {} as any,
}));

import {
  setUserClaims,
  getUserClaims,
  updateUserRole,
  promoteSuperAdmin,
  revokeSuperAdmin,
} from '../lib/claims';

describe('lib/claims', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('setUserClaims', () => {
    it('chama setCustomUserClaims', async () => {
      await setUserClaims('u1', { role: 'admin', franchiseId: 'f1', storeId: null } as any);
      expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        role: 'admin',
        franchiseId: 'f1',
        storeId: null,
      });
    });
  });

  describe('getUserClaims', () => {
    it('retorna claims do user', async () => {
      const result = await getUserClaims('u1');
      expect(result).toEqual({ role: 'admin', franchiseId: 'f1', storeId: null });
    });

    it('retorna null se user não existe', async () => {
      mocks.getUser.mockRejectedValueOnce(new Error('User not found'));
      const result = await getUserClaims('nope');
      expect(result).toBeNull();
    });
  });

  describe('updateUserRole', () => {
    it('atualiza claims e Firestore', async () => {
      await updateUserRole('u1', 'manager' as any, 'caller1');
      expect(mocks.setCustomUserClaims).toHaveBeenCalled();
      expect(mocks.docUpdate).toHaveBeenCalled();
    });
  });

  describe('promoteSuperAdmin', () => {
    it('usa transaction para promover', async () => {
      await promoteSuperAdmin('u1', 'a@b.com', 'Test', null, 'caller1');
      expect(mocks.runTransaction).toHaveBeenCalled();
      expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
      });
    });
  });

  describe('revokeSuperAdmin', () => {
    it('usa transaction para revogar', async () => {
      await revokeSuperAdmin('u1', 'caller1');
      expect(mocks.runTransaction).toHaveBeenCalled();
      expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        role: 'viewer',
        franchiseId: null,
        storeId: null,
      });
    });
  });
});
