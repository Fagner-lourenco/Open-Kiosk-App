/**
 * Tests for lib/rateLimit.ts
 * Covers: enforceRateLimit — janela nova, incremento, bloqueio, expiração, falha aberta
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const txnGet = vi.fn();
  const txnSet = vi.fn();
  const txnUpdate = vi.fn();
  const runTransaction = vi.fn().mockImplementation(async (cb: any) => {
    return cb({ get: txnGet, set: txnSet, update: txnUpdate });
  });
  const docFn = vi.fn(() => ({ id: 'rl-doc' }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));
  return { txnGet, txnSet, txnUpdate, runTransaction, docFn, collectionFn };
});

vi.mock('../lib/firebase', () => ({
  db: { collection: mocks.collectionFn, runTransaction: mocks.runTransaction },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { enforceRateLimit } from '../lib/rateLimit';

const baseOptions = {
  operation: 'setAdminClaims',
  callerUid: 'admin-1',
  maxCalls: 3,
  windowMs: 10 * 60 * 1000,
};

describe('lib/rateLimit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria janela nova quando doc não existe', async () => {
    mocks.txnGet.mockResolvedValue({ exists: false });

    await enforceRateLimit(baseOptions);

    expect(mocks.txnSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 })
    );
    expect(mocks.txnUpdate).not.toHaveBeenCalled();
  });

  it('incrementa contador dentro da janela', async () => {
    mocks.txnGet.mockResolvedValue({
      exists: true,
      data: () => ({ windowStartMs: Date.now(), count: 1 }),
    });

    await enforceRateLimit(baseOptions);

    expect(mocks.txnUpdate).toHaveBeenCalledWith(expect.anything(), { count: 2 });
  });

  it('bloqueia quando limite excedido dentro da janela', async () => {
    mocks.txnGet.mockResolvedValue({
      exists: true,
      data: () => ({ windowStartMs: Date.now(), count: 3 }),
    });

    await expect(enforceRateLimit(baseOptions)).rejects.toThrow(/Limite de chamadas/);
    expect(mocks.txnUpdate).not.toHaveBeenCalled();
  });

  it('reinicia janela expirada mesmo com contador alto', async () => {
    mocks.txnGet.mockResolvedValue({
      exists: true,
      data: () => ({ windowStartMs: Date.now() - 11 * 60 * 1000, count: 99 }),
    });

    await enforceRateLimit(baseOptions);

    expect(mocks.txnSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 })
    );
  });

  it('falha aberta em erro de infraestrutura (não bloqueia admin)', async () => {
    mocks.runTransaction.mockRejectedValueOnce(new Error('firestore offline'));

    await expect(enforceRateLimit(baseOptions)).resolves.toBeUndefined();
  });

  it('usa doc por operação e chamador', async () => {
    mocks.txnGet.mockResolvedValue({ exists: false });

    await enforceRateLimit(baseOptions);

    expect(mocks.collectionFn).toHaveBeenCalledWith('rateLimits');
    expect(mocks.docFn).toHaveBeenCalledWith('setAdminClaims_admin-1');
  });
});
