/**
 * Tests for auth/onCreate.ts
 * Covers: onUserCreated trigger — creates franchise + user doc
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: false });
  const docFn = vi.fn(() => ({ set: docSet, get: docGet, id: 'auto-id' }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 });
  const where = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where, limit }));
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
  const batchSet = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batchFn = vi.fn(() => ({ set: batchSet, commit: batchCommit }));

  return { docSet, docGet, docFn, collectionFn, setCustomUserClaims, colGet, batchSet, batchCommit, batchFn };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    batch: mocks.batchFn,
  },
  admin: {
    auth: () => ({
      setCustomUserClaims: mocks.setCustomUserClaims,
    }),
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
      Timestamp: { fromDate: (d: Date) => d },
    },
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setUserClaims: mocks.setCustomUserClaims,
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// v1 auth trigger mock
vi.mock('firebase-functions/v1/auth', () => ({
  user: () => ({
    onCreate: (handler: any) => {
      const fn: any = {};
      fn.run = handler;
      return fn;
    },
  }),
}));

import { onUserCreated } from '../auth/onCreate';

const run = (onUserCreated as any).run;

describe('auth/onCreate - onUserCreated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('é exportado', () => {
    expect(onUserCreated).toBeDefined();
  });

  it('cria franchise e user doc para novo usuário via email', async () => {
    const user = {
      uid: 'new-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
    };

    await run(user);

    // Verifica que batch.set foi chamado (franchise + user docs via batch)
    expect(mocks.batchSet).toHaveBeenCalled();
    expect(mocks.batchCommit).toHaveBeenCalled();
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('new-uid', expect.objectContaining({
      role: expect.any(String),
    }));
  });

  it('lida com usuário sem email gracefully', async () => {
    const user = {
      uid: 'no-email-uid',
      email: null,
      displayName: null,
      photoURL: null,
    };

    // Should not throw
    await expect(run(user)).resolves.not.toThrow();
  });
});
