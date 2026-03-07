/**
 * Tests for invitations/accept.ts
 * Covers: acceptInvitation, validateInvitationToken
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docRef = { get: docGet, set: docSet, update: docUpdate, ref: { update: docUpdate } };
  const docFn = vi.fn(() => docRef);
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const where = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where, limit }));
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batchUpdate = vi.fn();
  const batchSet = vi.fn();
  const batch = vi.fn(() => ({ commit: batchCommit, update: batchUpdate, set: batchSet }));
  const runTransaction = vi.fn().mockImplementation(async (cb: any) => cb({
    get: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  }));
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const getUser = vi.fn().mockResolvedValue({ uid: 'u1', email: 'test@example.com', displayName: 'Test' });

  return { docGet, docFn, collectionFn, colGet, where, batch, batchCommit, runTransaction, setCustomUserClaims, getUser };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    batch: mocks.batch,
    runTransaction: mocks.runTransaction,
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
    if (!ctx.auth) throw new Error('Usuario nao autenticado');
  }),
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
  onRequest: (...args: any[]) => {
    const handler = args.length === 2 ? args[1] : args[0];
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { acceptInvitation, validateInvitationToken } from '../invitations/accept';

describe('invitations/accept', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('acceptInvitation', () => {
    const run = (acceptInvitation as any).run;

    it('rejeita nao autenticado', async () => {
      await expect(run({ data: { token: 'abc' } })).rejects.toThrow(/autenticad/i);
    });

    it('rejeita sem token nem invitationId', async () => {
      await expect(run({
        data: {},
        auth: { uid: 'u1', token: { email: 'test@example.com' } },
      })).rejects.toThrow(/token|obrigatorio/i);
    });

    it('rejeita convite nao encontrado', async () => {
      mocks.colGet.mockResolvedValueOnce({ empty: true, docs: [] });
      await expect(run({
        data: { token: 'bad-token' },
        auth: { uid: 'u1', token: { email: 'test@example.com' } },
      })).rejects.toThrow(/nao encontrado|utilizado|não encontrado/i);
    });

    it('rejeita convite com franquia inexistente', async () => {
      const future = new Date(Date.now() + 60_000);
      mocks.colGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              email: 'test@example.com',
              status: 'pending',
              token: 'valid-token',
              role: 'operator',
              franchiseId: 'missing-franchise',
              storeAccess: ['s1'],
              expiresAt: { toDate: () => future },
            }),
            ref: { update: vi.fn() },
          },
        ],
      });

      await expect(run({
        data: { token: 'valid-token' },
        auth: { uid: 'u1', token: { email: 'test@example.com' } },
      })).rejects.toThrow(/franquia/i);
    });
  });

  describe('validateInvitationToken', () => {
    const run = (validateInvitationToken as any).run;

    it('rejeita OPTIONS com 204', async () => {
      const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), set: vi.fn() };
      await run({ method: 'OPTIONS', query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejeita metodo nao-GET', async () => {
      const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), set: vi.fn() };
      await run({ method: 'POST', query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejeita sem token', async () => {
      const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), set: vi.fn() };
      await run({ method: 'GET', query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});