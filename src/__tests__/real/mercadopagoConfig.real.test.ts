import { describe, it, expect } from 'vitest';
import { MERCADO_PAGO_CONFIG, POINT_ORDER_STATUS } from '@/config/mercadopago';

describe('mercadopago config', () => {
  describe('MERCADO_PAGO_CONFIG', () => {
    it('define QR_EXPIRATION_MINUTES como 2', () => {
      expect(MERCADO_PAGO_CONFIG.QR_EXPIRATION_MINUTES).toBe(2);
    });

    it('define POINT_EXPIRATION_SECONDS como 120', () => {
      expect(MERCADO_PAGO_CONFIG.POINT_EXPIRATION_SECONDS).toBe(120);
    });

    it('define POLLING_INTERVAL_MS como 3000', () => {
      expect(MERCADO_PAGO_CONFIG.POLLING_INTERVAL_MS).toBe(3000);
    });

    it('define POLLING_MAX_ATTEMPTS como 45', () => {
      expect(MERCADO_PAGO_CONFIG.POLLING_MAX_ATTEMPTS).toBe(45);
    });

    it('define MCC_CATEGORY como 621102', () => {
      expect(MERCADO_PAGO_CONFIG.MCC_CATEGORY).toBe(621102);
    });

    it('define MODE como sandbox ou production', () => {
      expect(['sandbox', 'production']).toContain(MERCADO_PAGO_CONFIG.MODE);
    });
  });

  describe('POINT_ORDER_STATUS', () => {
    it('define status CREATED', () => {
      expect(POINT_ORDER_STATUS.CREATED).toBe('created');
    });

    it('define status AT_TERMINAL', () => {
      expect(POINT_ORDER_STATUS.AT_TERMINAL).toBe('at_terminal');
    });

    it('define status PROCESSED', () => {
      expect(POINT_ORDER_STATUS.PROCESSED).toBe('processed');
    });

    it('define status CANCELED', () => {
      expect(POINT_ORDER_STATUS.CANCELED).toBe('canceled');
    });

    it('define status EXPIRED', () => {
      expect(POINT_ORDER_STATUS.EXPIRED).toBe('expired');
    });

    it('define status FAILED', () => {
      expect(POINT_ORDER_STATUS.FAILED).toBe('failed');
    });

    it('define status ACTION_REQUIRED', () => {
      expect(POINT_ORDER_STATUS.ACTION_REQUIRED).toBe('action_required');
    });
  });
});
