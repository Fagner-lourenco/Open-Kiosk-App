/**
 * Tests for invitations/sendEmail.ts
 * Covers: sendInvitationEmail auth, validation, creation
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Franquia Test' }) });
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet, id: 'inv-1' }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const where = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where, limit }));

  return { docGet, docSet, docFn, collectionFn, colGet };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
      Timestamp: { fromDate: (d: Date) => d },
    },
  },
  requireAuth: vi.fn((ctx: any) => {
    if (!ctx.auth) throw new Error('Usuário não autenticado');
  }),
  requireManager: vi.fn((ctx: any) => {
    const role = ctx.auth?.token?.role;
    if (!['owner', 'admin', 'manager'].includes(role)) throw new Error('permission-denied');
  }),
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
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  })),
}));

import { sendInvitationEmail } from '../invitations/sendEmail';

describe('invitations/sendEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  const run = (sendInvitationEmail as any).run;

  it('rejeita não autenticado', async () => {
    await expect(run({
      data: { email: 'a@b.com', role: 'operator' },
    })).rejects.toThrow(/autenticad/i);
  });

  it('rejeita role sem permissão', async () => {
    await expect(run({
      data: { email: 'a@b.com', role: 'operator' },
      auth: { uid: 'u1', token: { role: 'viewer', franchiseId: 'f1' } },
    })).rejects.toThrow(/permission/i);
  });

  it('rejeita sem email', async () => {
    await expect(run({
      data: { role: 'operator' },
      auth: { uid: 'u1', token: { role: 'owner', franchiseId: 'f1' } },
    })).rejects.toThrow(/email|obrigatório/i);
  });

  it('rejeita email inválido', async () => {
    await expect(run({
      data: { email: 'not-an-email', role: 'operator' },
      auth: { uid: 'u1', token: { role: 'owner', franchiseId: 'f1' } },
    })).rejects.toThrow(/email|inválid/i);
  });

  it('rejeita role inválida', async () => {
    await expect(run({
      data: { email: 'a@b.com', role: 'superadmin' },
      auth: { uid: 'u1', token: { role: 'owner', franchiseId: 'f1' } },
    })).rejects.toThrow(/role|inválid/i);
  });
});
