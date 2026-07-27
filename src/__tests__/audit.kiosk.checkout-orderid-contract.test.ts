/**
 * Contrato: checkout do kiosk DEVE vincular orderNumber ao payment do backend.
 *
 * Fix auditoria Kiosk 2026-07 (K2): as chamadas processMercadoPagoQRBackend/
 * PointBackend passavam orderId=undefined — sem o vínculo, a dedup transacional
 * do backend (KIO-18, doc `order_{orderId}`) não atua e o estorno por orderId
 * do Admin (refundMercadoPagoPayment) nunca localiza o pagamento.
 *
 * Também cobre K1: consulta de status pós-aprovação deve propagar gatewayConfig
 * (token da loja) — sem isso, lojas com accessToken próprio consultam com o
 * token das env vars.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const modalSource = fs.readFileSync(
  path.resolve(__dirname, '../components/DrinkQuickCheckoutModal.tsx'),
  'utf-8',
);

const paymentServiceSource = fs.readFileSync(
  path.resolve(__dirname, '../services/paymentService.ts'),
  'utf-8',
);

describe('Audit Kiosk - contrato orderId/payment (K1/K2)', () => {
  it('QR backend recebe o orderNumber gerado (não undefined)', () => {
    const qrCall = modalSource.match(
      /processMercadoPagoQRBackend\(\s*totalAmount,\s*cfItems,\s*(\w+)/,
    );
    expect(qrCall, 'chamada processMercadoPagoQRBackend não encontrada').toBeTruthy();
    expect(qrCall![1]).toBe('newOrderNumber');
  });

  it('Point backend recebe o orderNumber gerado (não undefined)', () => {
    const pointCall = modalSource.match(
      /processMercadoPagoPointBackend\(\s*totalAmount,\s*cfItems,\s*(\w+)/,
    );
    expect(pointCall, 'chamada processMercadoPagoPointBackend não encontrada').toBeTruthy();
    expect(pointCall![1]).toBe('newOrderNumber');
  });

  it('enriquecimento pós-pagamento propaga gatewayConfig na consulta de status', () => {
    expect(modalSource).toMatch(
      /checkMercadoPagoOrderStatus\(payment\.providerOrderId,\s*undefined,\s*gatewayConfig\)/,
    );
  });

  it('checkMercadoPagoOrderStatus aceita gatewayConfig e resolve token da loja', () => {
    const fnBlock = paymentServiceSource.match(
      /async checkMercadoPagoOrderStatus\([\s\S]*?\n  \}/,
    );
    expect(fnBlock, 'checkMercadoPagoOrderStatus não encontrado').toBeTruthy();
    expect(fnBlock![0]).toContain('gatewayConfig?: PaymentGatewayConfig | null');
    expect(fnBlock![0]).toContain('getPaymentConfig(gatewayConfig)');
  });

  it('cancelMercadoPagoOrder aceita gatewayConfig e resolve token da loja', () => {
    const fnBlock = paymentServiceSource.match(
      /async cancelMercadoPagoOrder\([\s\S]*?getOrder/,
    );
    expect(fnBlock, 'cancelMercadoPagoOrder não encontrado').toBeTruthy();
    expect(fnBlock![0]).toContain('gatewayConfig?: PaymentGatewayConfig | null');
    expect(fnBlock![0]).toContain('getPaymentConfig(gatewayConfig)');
  });
});
