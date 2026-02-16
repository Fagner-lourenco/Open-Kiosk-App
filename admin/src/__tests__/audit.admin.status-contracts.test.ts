import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - status contracts', () => {
  it('getPaymentStatus deve mapear estados canonicos de pagamento do Kiosk (RED)', () => {
    const repoRoot = path.resolve(process.cwd(), '..');
    const kioskPaymentTypes = fs.readFileSync(
      path.resolve(repoRoot, 'src/types/payments.ts'),
      'utf8'
    );
    const statusBadgeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ui/status-badge.tsx'),
      'utf8'
    );

    expect(kioskPaymentTypes).toMatch(/'canceled'/);
    expect(kioskPaymentTypes).toMatch(/'expired'/);

    expect(statusBadgeSource).toMatch(/case 'canceled':/);
    expect(statusBadgeSource).toMatch(/case 'expired':/);
  });

  it('getOrderStatus deve tratar alias canceled (single-l) alem de cancelled (RED)', () => {
    const statusBadgeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ui/status-badge.tsx'),
      'utf8'
    );

    expect(statusBadgeSource).toMatch(/canceled/);
  });

  it('tipo de paymentStatus em orders do Admin deve cobrir cancelado/expirado (RED)', () => {
    const orderTypesSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/orders/types.ts'),
      'utf8'
    );

    const paymentStatusUnion = orderTypesSource.match(/paymentStatus:\s*([^;]+);/s)?.[1] ?? '';
    const literals = Array.from(paymentStatusUnion.matchAll(/'([^']+)'/g), (m) => m[1]);

    expect(literals).toEqual(expect.arrayContaining(['canceled', 'expired']));
  });
});
