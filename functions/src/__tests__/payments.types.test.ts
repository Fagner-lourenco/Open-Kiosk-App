/**
 * Tests for payments/types.ts
 * Covers: type exports exist (TS validation via import)
 */
import { describe, it, expect } from 'vitest';
import type {
  PaymentMethod,
  PaymentStatus,
  PaymentItemInput,
  PaymentCustomer,
  PaymentCard,
  CreatePaymentInput,
  NormalizedPaymentGatewayConfig,
  PaymentRecord,
  PaymentProvider,
  ProviderMetadata,
} from '../payments/types';

describe('payments/types', () => {
  it('PaymentMethod assignment works', () => {
    const m: PaymentMethod = 'pix';
    expect(m).toBe('pix');
  });

  it('PaymentStatus assignment works', () => {
    const s: PaymentStatus = 'paid';
    expect(s).toBe('paid');
  });

  it('PaymentItemInput is structurally valid', () => {
    const item: PaymentItemInput = { name: 'Beer', quantity: 1, unitAmount: 10 };
    expect(item.name).toBe('Beer');
  });

  it('PaymentCard requires encrypted', () => {
    const card: PaymentCard = { encrypted: 'enc_blob' };
    expect(card.encrypted).toBe('enc_blob');
  });

  it('NormalizedPaymentGatewayConfig structure', () => {
    const config: NormalizedPaymentGatewayConfig = {
      provider: 'pagbank',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: false, debit: false },
    };
    expect(config.provider).toBe('pagbank');
  });
});
