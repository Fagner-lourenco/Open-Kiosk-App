/**
 * Tests for billing/stripeWebhook.ts
 * Covers: HTTP endpoint, signature verification, event handling
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const dedupGet = vi.fn().mockResolvedValue({ exists: false });
  const dedupSet = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}), ref: { update: vi.fn(), collection: vi.fn(() => ({ add: vi.fn() })) } });
  const docFn = vi.fn(() => ({ get: dedupGet, set: dedupSet, update: vi.fn(), collection: vi.fn(() => ({ add: vi.fn() })) }));
  const colGet = vi.fn().mockResolvedValue({ empty: false, docs: [{ id: 'f1', ref: { update: vi.fn(), collection: vi.fn(() => ({ add: vi.fn() })) } }] });
  const where = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where, limit }));

  return { docGet, dedupGet, dedupSet, docFn, collectionFn, colGet, where };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
      Timestamp: { fromMillis: vi.fn((ms: number) => new Date(ms)) },
    },
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('../lib/stripe', () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue({
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { franchiseId: 'f1', plan: 'pro' },
        customer: 'cus_123',
        subscription: 'sub_123',
        id: 'cs_test',
      },
    },
  }),
  getPlanFromPriceId: vi.fn().mockReturnValue('pro'),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (handler: any) => {
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

import { stripeWebhook } from '../billing/stripeWebhook';

const run = (stripeWebhook as any).run;

describe('billing/stripeWebhook', () => {
  beforeEach(() => vi.clearAllMocks());

  it('é exportado', () => {
    expect(stripeWebhook).toBeDefined();
  });

  it('rejeita método não-POST', async () => {
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), set: vi.fn() };
    await run({ method: 'GET', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejeita sem stripe-signature', async () => {
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), set: vi.fn() };
    await run({ method: 'POST', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('processa evento checkout.session.completed', async () => {
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), set: vi.fn() };
    await run({
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      rawBody: 'payload',
    }, res);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
