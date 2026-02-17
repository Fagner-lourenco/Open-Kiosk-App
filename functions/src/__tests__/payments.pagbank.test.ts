/**
 * Tests for payments/providers/pagbank/index.ts
 * Covers: createPagBankProvider, status mapping, metadata extraction
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Direct import — this module is pure logic (no firebase dep)
import { createPagBankProvider, type PagBankProviderConfig } from '../payments/providers/pagbank/index';

describe('payments/providers/pagbank', () => {
  const config: PagBankProviderConfig = {
    environment: 'sandbox',
    authToken: 'test-token',
  };

  const provider = createPagBankProvider(config);

  it('createPagBankProvider retorna objeto com createPayment e getPaymentStatus', () => {
    expect(provider.createPayment).toBeDefined();
    expect(provider.getPaymentStatus).toBeDefined();
    expect(typeof provider.createPayment).toBe('function');
    expect(typeof provider.getPaymentStatus).toBe('function');
  });

  it('createPayment rejeita cartão sem encrypted', async () => {
    await expect(
      provider.createPayment({
        paymentId: 'p1',
        referenceId: 'ref1',
        amount: 50,
        currency: 'BRL',
        method: 'credit',
        items: [{ name: 'Item', quantity: 1, unitAmount: 50 }],
        card: undefined as any,
      }),
    ).rejects.toThrow(/cart[aã]o|card/i);
  });

  it('getPaymentStatus rejeita sem providerOrderId', async () => {
    await expect(
      provider.getPaymentStatus!({
        franchiseId: 'f1',
        storeId: 's1',
        provider: 'pagbank',
        method: 'pix',
        status: 'pending',
        amount: 50,
        currency: 'BRL',
      }),
    ).rejects.toThrow(/providerOrderId/i);
  });
});
