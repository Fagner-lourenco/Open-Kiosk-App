/**
 * Tests for superadmin/promoteSuperAdminHTTP.ts
 * Covers: HTTP endpoint (POST only, secret validation, enable check)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet, update: docUpdate }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));
  const getUserByEmail = vi.fn().mockResolvedValue({
    uid: 'u1',
    email: 'test@example.com',
    displayName: 'Test',
    photoURL: null,
  });
  const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);

  return { docSet, docGet, docUpdate, docFn, collectionFn, getUserByEmail, setCustomUserClaims };
});

vi.mock('../lib', () => ({
  db: { collection: mocks.collectionFn, doc: mocks.docFn },
  auth: {
    getUserByEmail: mocks.getUserByEmail,
    setCustomUserClaims: mocks.setCustomUserClaims,
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { promoteSuperAdminHTTP } from '../superadmin/promoteSuperAdminHTTP';

const run = (promoteSuperAdminHTTP as any).run;

describe('superadmin/promoteSuperAdminHTTP', () => {
  const res = () => ({
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    json: vi.fn(),
    set: vi.fn(),
  });

  beforeEach(() => vi.clearAllMocks());

  it('responde OPTIONS com 204', async () => {
    const r = res();
    await run({ method: 'OPTIONS', headers: {}, body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(204);
  });

  it('rejeita quando desabilitado', async () => {
    delete process.env.SUPERADMIN_ENABLED;
    const r = res();
    await run({ method: 'POST', headers: {}, body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rejeita GET', async () => {
    process.env.SUPERADMIN_ENABLED = 'true';
    const r = res();
    await run({ method: 'GET', headers: {}, body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejeita sem secret configurado', async () => {
    process.env.SUPERADMIN_ENABLED = 'true';
    delete process.env.SUPERADMIN_SECRET;
    const r = res();
    await run({ method: 'POST', headers: {}, body: { email: 'a@b.com', secret: 'wrong' } }, r);
    expect(r.status).toHaveBeenCalledWith(500);
  });

  it('rejeita secret errado', async () => {
    process.env.SUPERADMIN_ENABLED = 'true';
    process.env.SUPERADMIN_SECRET = 'correct';
    const r = res();
    await run({ method: 'POST', headers: {}, body: { email: 'a@b.com', secret: 'wrong' } }, r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rejeita sem email', async () => {
    process.env.SUPERADMIN_ENABLED = 'true';
    process.env.SUPERADMIN_SECRET = 'mysecret';
    const r = res();
    await run({ method: 'POST', headers: {}, body: { secret: 'mysecret' } }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('promove com sucesso', async () => {
    process.env.SUPERADMIN_ENABLED = 'true';
    process.env.SUPERADMIN_SECRET = 'mysecret';
    const r = res();
    await run({
      method: 'POST',
      headers: {},
      body: { email: 'test@example.com', secret: 'mysecret' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(mocks.setCustomUserClaims).toHaveBeenCalled();
  });
});
