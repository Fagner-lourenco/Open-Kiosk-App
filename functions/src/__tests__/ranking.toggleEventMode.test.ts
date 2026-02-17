/**
 * Tests for ranking/toggleEventMode.ts
 * Covers: callable auth, validation, toggle on/off
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));

  return { docGet, docSet, docFn, collectionFn };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
  admin: {
    firestore: {
      Timestamp: {
        fromDate: (d: Date) => d,
      },
    },
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

import { toggleEventMode } from '../ranking/toggleEventMode';

const run = (toggleEventMode as any).run;

describe('ranking/toggleEventMode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita não autenticado', async () => {
    await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
  });

  it('rejeita parâmetros inválidos', async () => {
    await expect(run({
      data: { franchiseId: 'f1' },
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    })).rejects.toThrow(/parâmetros|inválid/i);
  });

  it('superadmin pode ativar modo evento', async () => {
    const result = await run({
      data: { franchiseId: 'f1', storeId: 's1', enabled: true, label: 'Test Event', durationMinutes: 15 },
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    });
    expect(result.success).toBe(true);
    expect(mocks.docSet).toHaveBeenCalled();
  });

  it('rejeita membro sem permissão', async () => {
    mocks.docGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ ownerId: 'other' }) }) // franchise
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'viewer' }) }); // member

    await expect(run({
      data: { franchiseId: 'f1', storeId: 's1', enabled: true },
      auth: { uid: 'u1', token: { role: 'viewer' } },
    })).rejects.toThrow(/permiss|role/i);
  });
});
