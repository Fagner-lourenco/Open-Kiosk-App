/**
 * Tests for lib/index.ts (barrel export)
 * Covers: Verifica que todos os exports estão disponíveis
 */
import { vi, describe, it, expect } from 'vitest';

// Mock all sub-modules to isolate barrel test
vi.mock('./firebase', () => ({
  db: { collection: vi.fn() },
  auth: { getUser: vi.fn() },
  storage: {},
  admin: { firestore: vi.fn() },
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

vi.mock('./auth', () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  requireSuperAdmin: vi.fn(),
  requireOwnerOrAdmin: vi.fn(),
  requireManager: vi.fn(),
  requireFranchiseAccess: vi.fn(),
  verifySuperAdminInFirestore: vi.fn(),
  roleHierarchy: {},
  isRoleHigherOrEqual: vi.fn(),
}));

vi.mock('./claims', () => ({
  setUserClaims: vi.fn(),
  getUserClaims: vi.fn(),
  updateUserRole: vi.fn(),
  promoteSuperAdmin: vi.fn(),
  revokeSuperAdmin: vi.fn(),
}));

vi.mock('./stripe', () => ({
  getStripeClient: vi.fn(),
  PLAN_PRICES: {},
  PRICE_TO_PLAN: {},
  getPlanFromPriceId: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('./sanitize', () => ({
  sanitizeForLog: vi.fn(),
  stripSensitiveFields: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => ({
  type: {} as any,
}));

import * as lib from '../lib/index';

describe('lib/index (barrel)', () => {
  it('exporta db', () => expect(lib.db).toBeDefined());
  it('exporta auth', () => expect(lib.auth).toBeDefined());
  it('exporta requireAuth', () => expect(lib.requireAuth).toBeDefined());
  it('exporta requireRole', () => expect(lib.requireRole).toBeDefined());
  it('exporta requireSuperAdmin', () => expect(lib.requireSuperAdmin).toBeDefined());
  it('exporta requireOwnerOrAdmin', () => expect(lib.requireOwnerOrAdmin).toBeDefined());
  it('exporta requireManager', () => expect(lib.requireManager).toBeDefined());
  it('exporta requireFranchiseAccess', () => expect(lib.requireFranchiseAccess).toBeDefined());
  it('exporta verifySuperAdminInFirestore', () => expect(lib.verifySuperAdminInFirestore).toBeDefined());
  it('exporta roleHierarchy', () => expect(lib.roleHierarchy).toBeDefined());
  it('exporta isRoleHigherOrEqual', () => expect(lib.isRoleHigherOrEqual).toBeDefined());
  it('exporta setUserClaims', () => expect(lib.setUserClaims).toBeDefined());
  it('exporta getUserClaims', () => expect(lib.getUserClaims).toBeDefined());
  it('exporta updateUserRole', () => expect(lib.updateUserRole).toBeDefined());
  it('exporta promoteSuperAdmin', () => expect(lib.promoteSuperAdmin).toBeDefined());
  it('exporta revokeSuperAdmin', () => expect(lib.revokeSuperAdmin).toBeDefined());
  it('exporta getStripeClient', () => expect(lib.getStripeClient).toBeDefined());
  it('exporta PLAN_PRICES', () => expect(lib.PLAN_PRICES).toBeDefined());
  it('exporta getPlanFromPriceId', () => expect(lib.getPlanFromPriceId).toBeDefined());
  it('exporta verifyWebhookSignature', () => expect(lib.verifyWebhookSignature).toBeDefined());
  it('exporta sanitizeForLog', () => expect(lib.sanitizeForLog).toBeDefined());
  it('exporta stripSensitiveFields', () => expect(lib.stripSensitiveFields).toBeDefined());
  it('exporta serverTimestamp', () => expect(lib.serverTimestamp).toBeDefined());
  it('exporta increment', () => expect(lib.increment).toBeDefined());
  it('exporta arrayUnion', () => expect(lib.arrayUnion).toBeDefined());
  it('exporta arrayRemove', () => expect(lib.arrayRemove).toBeDefined());
});
