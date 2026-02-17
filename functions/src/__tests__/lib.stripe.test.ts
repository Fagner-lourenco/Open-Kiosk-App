/**
 * Tests for lib/stripe.ts
 * Covers: getStripeClient, PLAN_PRICES, PRICE_TO_PLAN, getPlanFromPriceId, verifyWebhookSignature
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
}));

vi.mock('stripe', () => {
  const constructEvent = vi.fn().mockReturnValue({ type: 'test_event' });
  class StripeMock {
    webhooks = { constructEvent };
    customers = { create: vi.fn() };
  }
  return { default: StripeMock };
});

import { getStripeClient, PLAN_PRICES, PRICE_TO_PLAN, getPlanFromPriceId, verifyWebhookSignature } from '../lib/stripe';

describe('lib/stripe', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getStripeClient', () => {
    it('retorna instância Stripe', () => {
      const client = getStripeClient();
      expect(client).toBeDefined();
    });

    it('retorna mesma instância (singleton)', () => {
      const a = getStripeClient();
      const b = getStripeClient();
      expect(a).toBe(b);
    });
  });

  describe('PLAN_PRICES', () => {
    it('tem starter, pro, enterprise', () => {
      expect(PLAN_PRICES).toHaveProperty('starter');
      expect(PLAN_PRICES).toHaveProperty('pro');
      expect(PLAN_PRICES).toHaveProperty('enterprise');
    });
    it('cada plano tem monthly e yearly', () => {
      for (const plan of Object.values(PLAN_PRICES)) {
        expect(plan).toHaveProperty('monthly');
        expect(plan).toHaveProperty('yearly');
      }
    });
  });

  describe('PRICE_TO_PLAN', () => {
    it('mapeia price IDs para planos', () => {
      expect(PRICE_TO_PLAN).toBeDefined();
      expect(typeof PRICE_TO_PLAN).toBe('object');
    });
  });

  describe('getPlanFromPriceId', () => {
    it('retorna plano para price ID válido', () => {
      const plan = getPlanFromPriceId('price_starter_monthly');
      expect(plan).toBe('starter');
    });

    it('retorna null para ID desconhecido', () => {
      const plan = getPlanFromPriceId('unknown_price');
      expect(plan).toBeNull();
    });
  });

  describe('verifyWebhookSignature', () => {
    it('joga sem webhook secret', () => {
      const original = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      expect(() => verifyWebhookSignature('payload', 'sig')).toThrow(/secret|configurad/i);

      if (original) process.env.STRIPE_WEBHOOK_SECRET = original;
    });
  });
});
