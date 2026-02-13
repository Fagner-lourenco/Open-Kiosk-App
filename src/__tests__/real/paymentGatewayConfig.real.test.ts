import { describe, it, expect } from 'vitest';
import { getPaymentConfig, validatePaymentConfig } from '@/config/paymentGateway';

describe('paymentGateway config', () => {
  describe('getPaymentConfig', () => {
    it('retorna configuração com source env quando gatewayConfig não fornecido', () => {
      const config = getPaymentConfig();
      expect(config.source).toBe('env');
    });

    it('retorna configuração com source env quando gatewayConfig sem accessToken', () => {
      const config = getPaymentConfig({ provider: 'mercado_pago', environment: 'sandbox', enabledMethods: { cash: true, pix: true, credit: true, debit: true }, accessToken: '' });
      expect(config.source).toBe('env');
    });

    it('retorna configuração com source firestore quando gatewayConfig tem accessToken', () => {
      const config = getPaymentConfig({ 
        provider: 'mercado_pago',
        environment: 'sandbox',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
        accessToken: 'TEST-1234567890-abcdef' 
      });
      expect(config.source).toBe('firestore');
      expect(config.accessToken).toBe('TEST-1234567890-abcdef');
    });

    it('usa fallback de env quando campos do firestore estão vazios', () => {
      const config = getPaymentConfig({ 
        provider: 'mercado_pago',
        environment: 'sandbox',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
        accessToken: 'TEST-token',
        mode: undefined,
        userId: '',
      });
      expect(config.accessToken).toBe('TEST-token');
      expect(config.source).toBe('firestore');
    });
  });

  describe('validatePaymentConfig', () => {
    it('retorna objeto de validação com arrays errors e warnings', () => {
      const result = validatePaymentConfig();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.valid).toBe('boolean');
    });

    it('retorna errors quando accessToken é curto demais', () => {
      const result = validatePaymentConfig({
        provider: 'mercado_pago',
        environment: 'sandbox',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
        accessToken: 'short',
        externalPosId: 'POS001',
        userId: '12345',
      });
      expect(result.errors.some(e => e.includes('inválido'))).toBe(true);
    });

    it('retorna valid true quando todos os campos obrigatórios estão configurados', () => {
      const result = validatePaymentConfig({
        provider: 'mercado_pago',
        environment: 'sandbox',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
        accessToken: 'TEST-valid-token-1234567890-abcdef',
        externalPosId: 'POS001',
        userId: '12345',
      });
      expect(result.valid).toBe(true);
    });
  });
});
