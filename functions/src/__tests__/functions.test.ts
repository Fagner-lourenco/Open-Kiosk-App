/**
 * ============================================================================
 * Testes Unitários - Cloud Functions (Firebase)
 * ============================================================================
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fft from 'firebase-functions-test';
import * as functions from 'firebase-functions';

// Initialize test environment
const testEnv = fft();

/**
 * Wrapper v2-compatible: constrói CallableRequest a partir de (data, context)
 * como testEnv.wrap() faria para v1, mas passando um único request object.
 */
function wrapV2(fn: any) {
  return (data: any, context?: any) => fn.run({ data, ...context });
}

// Hoisted mocks to be accessible inside vi.mock factory
const mocks = vi.hoisted(() => {
  const collectionFn = vi.fn();
  const docFn = vi.fn();
  const getFn = vi.fn();
  const updateFn = vi.fn();
  const setFn = vi.fn();
  const setCustomUserClaims = vi.fn();
  const getUser = vi.fn().mockResolvedValue({ customClaims: {} });

  // Chain setup
  docFn.mockReturnValue({
    get: getFn,
    update: updateFn,
    set: setFn
  });
  collectionFn.mockReturnValue({
    doc: docFn,
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });

  return {
    collection: collectionFn,
    doc: docFn,
    get: getFn,
    update: updateFn,
    set: setFn,
    setCustomUserClaims,
    getUser
  };
});

// Mock ../lib
vi.mock('../lib', () => ({
  admin: {
    auth: () => ({
      setCustomUserClaims: mocks.setCustomUserClaims,
      getUser: mocks.getUser,
    }),
    firestore: {
      FieldValue: {
        serverTimestamp: () => 'MOCK_TIMESTAMP',
      },
      Timestamp: {
        fromDate: (d: Date) => d,
      }
    },
  },
  db: {
    collection: mocks.collection,
    runTransaction: vi.fn(),
  },
  requireAuth: vi.fn(),
  requireOwnerOrAdmin: vi.fn(),
  requireManager: vi.fn(),
  serverTimestamp: () => 'MOCK_TIMESTAMP',
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } }
  },
  PLAN_PRICES: {
    starter: { monthly: 'price_123' }
  }
}));

// Mock firebase-functions config
testEnv.mockConfig({
  app: { url: 'http://localhost' },
  smtp: { user: 'test', pass: 'test' }
});

// Import functions under test
import { setCustomClaims } from '../auth/setCustomClaims';
import { sendInvitationEmail } from '../invitations/sendEmail';

describe('Cloud Functions', () => {

  afterEach(() => {
    testEnv.cleanup();
    vi.clearAllMocks();
  });

  describe('setCustomClaims', () => {
    it('deve validar que userId é obrigatório', async () => {
      const wrapped = wrapV2(setCustomClaims);
      const data = { role: 'manager' }; // userId missing
      const context = { auth: { uid: 'admin', token: { role: 'owner', franchiseId: 'f1' } } };

      await expect(wrapped(data, context)).rejects.toThrow('userId é obrigatório');
    });

    it('deve atualizar claims quando caller é owner', async () => {
      const wrapped = wrapV2(setCustomClaims);
      const data = { userId: 'target-user', role: 'admin' };
      const context = { auth: { uid: 'owner-id', token: { role: 'owner', franchiseId: 'f1' } } };

      // Mock target user existence
      mocks.get.mockResolvedValue({
        exists: true,
        data: () => ({ franchiseId: 'f1', role: 'operator', storeId: 's1' })
      });

      await wrapped(data, context);

      expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('target-user', expect.objectContaining({
        role: 'admin',
        franchiseId: 'f1'
      }));
    });
  });

  describe('sendInvitationEmail', () => {
    it('deve rejeitar email inválido', async () => {
      const wrapped = wrapV2(sendInvitationEmail);
      const data = { email: 'bad-email', role: 'manager' };
      const context = { auth: { uid: 'admin-id', token: { role: 'admin', franchiseId: 'f1' } } };

      await expect(wrapped(data, context)).rejects.toThrow('Formato de email inválido');
    });
  });

});
