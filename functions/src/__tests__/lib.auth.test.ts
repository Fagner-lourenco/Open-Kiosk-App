/**
 * Tests for lib/auth.ts
 * Covers: requireAuth, requireRole, requireSuperAdmin, requireOwnerOrAdmin,
 *         requireManager, requireFranchiseAccess, verifySuperAdminInFirestore,
 *         roleHierarchy, isRoleHigherOrEqual
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docFn = vi.fn(() => ({ get: docGet }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));
  return { docGet, docFn, collectionFn };
});

vi.mock('../lib/firebase', () => ({
  db: { collection: mocks.collectionFn, doc: mocks.docFn },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
}));

import {
  requireAuth,
  requireRole,
  requireSuperAdmin,
  requireOwnerOrAdmin,
  requireManager,
  requireFranchiseAccess,
  verifySuperAdminInFirestore,
  roleHierarchy,
  isRoleHigherOrEqual,
} from '../lib/auth';

describe('lib/auth', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('requireAuth', () => {
    it('passa com auth presente', () => {
      expect(() => requireAuth({ auth: { uid: 'u1' } } as any)).not.toThrow();
    });
    it('joga sem auth', () => {
      expect(() => requireAuth({} as any)).toThrow(/autenticad/i);
    });
    it('joga com auth null', () => {
      expect(() => requireAuth({ auth: null } as any)).toThrow(/autenticad/i);
    });
  });

  describe('requireRole', () => {
    it('aceita role permitida', () => {
      expect(() => requireRole(
        { auth: { uid: 'u1', token: { role: 'admin' } } } as any,
        ['admin', 'owner'],
      )).not.toThrow();
    });
    it('rejeita role não permitida', () => {
      expect(() => requireRole(
        { auth: { uid: 'u1', token: { role: 'viewer' } } } as any,
        ['admin', 'owner'],
      )).toThrow(/permiss|negad/i);
    });
  });

  describe('requireSuperAdmin', () => {
    it('aceita superadmin', () => {
      expect(() => requireSuperAdmin(
        { auth: { uid: 'u1', token: { role: 'superadmin' } } } as any,
      )).not.toThrow();
    });
    it('rejeita non-superadmin', () => {
      expect(() => requireSuperAdmin(
        { auth: { uid: 'u1', token: { role: 'admin' } } } as any,
      )).toThrow(/super admin/i);
    });
  });

  describe('requireOwnerOrAdmin', () => {
    it('aceita owner', () => {
      expect(() => requireOwnerOrAdmin(
        { auth: { uid: 'u1', token: { role: 'owner' } } } as any,
      )).not.toThrow();
    });
    it('aceita admin', () => {
      expect(() => requireOwnerOrAdmin(
        { auth: { uid: 'u1', token: { role: 'admin' } } } as any,
      )).not.toThrow();
    });
    it('rejeita operator', () => {
      expect(() => requireOwnerOrAdmin(
        { auth: { uid: 'u1', token: { role: 'operator' } } } as any,
      )).toThrow();
    });
  });

  describe('requireManager', () => {
    it('aceita manager', () => {
      expect(() => requireManager(
        { auth: { uid: 'u1', token: { role: 'manager' } } } as any,
      )).not.toThrow();
    });
    it('rejeita viewer', () => {
      expect(() => requireManager(
        { auth: { uid: 'u1', token: { role: 'viewer' } } } as any,
      )).toThrow();
    });
  });

  describe('requireFranchiseAccess', () => {
    it('superadmin acessa qualquer franquia', async () => {
      await expect(requireFranchiseAccess(
        { auth: { uid: 'u1', token: { role: 'superadmin', franchiseId: 'f-other' } } } as any,
        'f1',
      )).resolves.toBeUndefined();
    });
    it('aceita mesmo franchiseId', async () => {
      await expect(requireFranchiseAccess(
        { auth: { uid: 'u1', token: { role: 'admin', franchiseId: 'f1' } } } as any,
        'f1',
      )).resolves.toBeUndefined();
    });
    it('rejeita franchiseId diferente', async () => {
      await expect(requireFranchiseAccess(
        { auth: { uid: 'u1', token: { role: 'admin', franchiseId: 'f2' } } } as any,
        'f1',
      )).rejects.toThrow(/franquia/i);
    });
  });

  describe('verifySuperAdminInFirestore', () => {
    it('retorna true se existir e ativo', async () => {
      mocks.docGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'active' }) });
      expect(await verifySuperAdminInFirestore('u1')).toBe(true);
    });
    it('retorna false se não existir', async () => {
      mocks.docGet.mockResolvedValueOnce({ exists: false, data: () => ({}) });
      expect(await verifySuperAdminInFirestore('u1')).toBe(false);
    });
    it('retorna false se status != active', async () => {
      mocks.docGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'revoked' }) });
      expect(await verifySuperAdminInFirestore('u1')).toBe(false);
    });
  });

  describe('roleHierarchy', () => {
    it('superadmin é o mais alto', () => {
      expect(roleHierarchy.superadmin).toBeGreaterThan(roleHierarchy.owner);
    });
    it('owner > admin', () => {
      expect(roleHierarchy.owner).toBeGreaterThan(roleHierarchy.admin);
    });
    it('viewer é o mais baixo', () => {
      expect(roleHierarchy.viewer).toBeLessThan(roleHierarchy.operator);
    });
  });

  describe('isRoleHigherOrEqual', () => {
    it('owner >= admin', () => {
      expect(isRoleHigherOrEqual('owner', 'admin')).toBe(true);
    });
    it('admin < owner', () => {
      expect(isRoleHigherOrEqual('admin', 'owner')).toBe(false);
    });
    it('admin == admin', () => {
      expect(isRoleHigherOrEqual('admin', 'admin')).toBe(true);
    });
  });
});
