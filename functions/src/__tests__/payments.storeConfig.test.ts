/**
 * Tests for payments/storeConfig.ts (pure functions — no mocking needed)
 * Covers: normalizePaymentGatewayConfig, isMethodEnabled
 */
import { describe, it, expect } from 'vitest';
import { normalizePaymentGatewayConfig, isMethodEnabled } from '../payments/storeConfig';

describe('payments/storeConfig', () => {
  describe('normalizePaymentGatewayConfig', () => {
    it('retorna null para input null/undefined', () => {
      expect(normalizePaymentGatewayConfig(null)).toBeNull();
      expect(normalizePaymentGatewayConfig(undefined)).toBeNull();
    });

    it('retorna null para store sem nenhum campo de payment config', () => {
      // Empty object {} has no payment fields at all
      // so the function correctly returns null (no config to normalize)
      const result = normalizePaymentGatewayConfig({});
      expect(result).toBeNull();
    });

    it('normaliza formato legado (mercadopago → mercado_pago)', () => {
      const result = normalizePaymentGatewayConfig({
        paymentGateway: { provider: 'mercadopago' },
      });
      expect(result?.provider).toBe('mercado_pago');
    });

    it('normaliza current config', () => {
      const result = normalizePaymentGatewayConfig({
        paymentGatewayConfig: {
          provider: 'pagbank',
          environment: 'production',
          enabledMethods: { cash: true, pix: true, credit: false, debit: false },
        },
      });
      expect(result?.provider).toBe('pagbank');
      expect(result?.environment).toBe('production');
      expect(result?.enabledMethods.pix).toBe(true);
      expect(result?.enabledMethods.credit).toBe(false);
    });

    it('merge legacy acceptPix/acceptCash com current', () => {
      const result = normalizePaymentGatewayConfig({
        acceptPix: true,
        acceptCash: false,
        acceptCard: true,
      });
      expect(result?.enabledMethods.pix).toBe(true);
      expect(result?.enabledMethods.cash).toBe(false);
      expect(result?.enabledMethods.credit).toBe(true);
    });

    it('provider desconhecido → none', () => {
      const result = normalizePaymentGatewayConfig({
        paymentGateway: { provider: 'unknown_provider' },
      });
      expect(result?.provider).toBe('none');
    });
  });

  describe('isMethodEnabled', () => {
    const config = normalizePaymentGatewayConfig({
      paymentGatewayConfig: {
        provider: 'pagbank',
        enabledMethods: { cash: true, pix: true, credit: false, debit: true },
      },
    })!;

    it('pix enabled', () => expect(isMethodEnabled(config, 'pix')).toBe(true));
    it('credit disabled', () => expect(isMethodEnabled(config, 'credit')).toBe(false));
    it('debit enabled', () => expect(isMethodEnabled(config, 'debit')).toBe(true));
  });
});
