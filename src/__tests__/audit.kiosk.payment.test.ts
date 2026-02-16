import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const createOrderMock = vi.fn();

vi.mock('@/services/mercadopagoAPI', () => ({
  createMercadoPagoAPI: vi.fn(() => ({
    createOrder: createOrderMock,
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    listTerminals: vi.fn(async () => ({ data: { terminals: [] } })),
    getPayment: vi.fn(),
  })),
}));

vi.mock('@/config/paymentGateway', () => ({
  getPaymentConfig: vi.fn(() => ({
    accessToken: 'token_test',
    mode: 'sandbox',
    externalPosId: 'POS-001',
    terminalId: 'TERM-001',
    pointExpirationTime: 'PT10M',
    source: 'firestore',
  })),
}));

import { PaymentError, paymentService } from '@/services/paymentService';

describe('Audit Kiosk - pagamento e compatibilidade', () => {
  beforeEach(() => {
    createOrderMock.mockReset();
  });

  it('valida valor minimo para QR Mercado Pago', async () => {
    const items = [
      {
        title: 'Teste',
        unit_price: '0.99',
        quantity: 1,
        unit_measure: 'unit',
        total_amount: '0.99',
      },
    ];

    await expect(
      paymentService.processMercadoPagoQR(0.99, items, 'order-1', 'POS-001')
    ).rejects.toMatchObject({
      name: 'PaymentError',
      code: 'MP_MIN_AMOUNT',
    } satisfies Partial<PaymentError>);
  });

  it('serializa valores monetarios como string com 2 casas no payload MP', async () => {
    createOrderMock.mockResolvedValue({
      id: 'ord_123',
      status: 'created',
      type_response: { qr_data: 'qr_text' },
    });

    const items = [
      {
        title: 'Produto',
        unit_price: '10.00',
        quantity: 1,
        unit_measure: 'unit',
        total_amount: '10.00',
      },
    ];

    const result = await paymentService.processMercadoPagoQR(10, items, 'order-2', 'POS-001');
    const payload = createOrderMock.mock.calls[0][0];

    expect(payload.total_amount).toBe('10.00');
    expect(payload.transactions.payments[0].amount).toBe('10.00');
    expect(result.qrData).toBe('qr_text');
  });

  it('nao deve depender de path legado settings/attract_video (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AttractScreen.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/['"]settings['"]\s*,\s*['"]attract_video['"]/);
  });

  it('cancelamento fallback PagBank nao deve persistir datas ISO string em payments (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/paymentService.ts'),
      'utf8'
    );

    const fallbackBlock =
      source.match(/await updateDoc\(paymentRef,\s*\{[\s\S]*?cancelRequestedAt:[\s\S]*?\}\);/)?.[0] ?? '';

    expect(fallbackBlock).not.toMatch(/toISOString\(\)/);
  });
});
