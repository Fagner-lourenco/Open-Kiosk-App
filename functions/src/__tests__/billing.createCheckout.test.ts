/**
 * Tests for billing/createCheckout.ts
 * Covers: createCheckoutSession, createBillingPortalSession
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Test', stripeCustomerId: 'cus_123' }), ref: { update: vi.fn() } });
  const docFn = vi.fn(() => ({ get: docGet }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));

  return { docGet, docFn, collectionFn };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('../lib/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    customers: { create: vi.fn().mockResolvedValue({ id: 'cus_new' }) },
    checkout: {
      sessions: { create: vi.fn().mockResolvedValue({ id: 'sess_1', url: 'https://stripe.com/checkout' }) },
    },
    billingPortal: {
      sessions: { create: vi.fn().mockResolvedValue({ url: 'https://stripe.com/portal' }) },
    },
  })),
  PLAN_PRICES: {
    starter: { monthly: 'price_sm', yearly: 'price_sy' },
    pro: { monthly: 'price_pm', yearly: 'price_py' },
    enterprise: { monthly: 'price_em', yearly: 'price_ey' },
  },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (handler: any) => {
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

import { createCheckoutSession, createBillingPortalSession } from '../billing/createCheckout';

describe('billing/createCheckout', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createCheckoutSession', () => {
    const run = (createCheckoutSession as any).run;

    it('rejeita não autenticado', async () => {
      await expect(run({ data: { plan: 'starter', interval: 'monthly' } })).rejects.toThrow(/autenticad/i);
    });

    it('rejeita role != owner', async () => {
      await expect(run({
        data: { plan: 'starter', interval: 'monthly' },
        auth: { uid: 'u1', token: { role: 'operator', franchiseId: 'f1' } },
      })).rejects.toThrow(/proprietário|permission/i);
    });

    it('rejeita plan missing', async () => {
      await expect(run({
        data: { interval: 'monthly' },
        auth: { uid: 'u1', token: { role: 'owner', franchiseId: 'f1' } },
      })).rejects.toThrow(/plan|obrigatório/i);
    });

    it('rejeita interval inválido', async () => {
      await expect(run({
        data: { plan: 'starter', interval: 'weekly' },
        auth: { uid: 'u1', token: { role: 'owner', franchiseId: 'f1', email: 'a@b.com' } },
      })).rejects.toThrow(/interval/i);
    });

    it('rejeita plano inválido', async () => {
      await expect(run({
        data: { plan: 'invalid', interval: 'monthly' },
        auth: { uid: 'u1', token: { role: 'owner', franchiseId: 'f1', email: 'a@b.com' } },
      })).rejects.toThrow(/plano|inválid/i);
    });
  });

  describe('createBillingPortalSession', () => {
    const run = (createBillingPortalSession as any).run;

    it('rejeita não autenticado', async () => {
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });

    it('rejeita role != owner', async () => {
      await expect(run({
        data: {},
        auth: { uid: 'u1', token: { role: 'operator' } },
      })).rejects.toThrow(/proprietário|permission/i);
    });
  });
});
