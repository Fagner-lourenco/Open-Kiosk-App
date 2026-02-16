import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Functions - analytics vs contratos do Kiosk', () => {
  it('aggOrders deve tratar estados do fluxo de dispense do Kiosk (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/analytics/aggOrders.ts'),
      'utf8'
    );

    // Estados produzidos por salesService do Kiosk:
    // paid_pending_dispense -> dispensing -> completed | failed_dispense
    expect(source).toMatch(/paid_pending_dispense/);
    expect(source).toMatch(/dispensing/);
    expect(source).toMatch(/failed_dispense/);
  });

  it('aggregateDailySales nao deve assumir completed/paid quando campos faltam (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/analytics/aggregateDailySales.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/const status = order\.status \|\| 'completed'/);
    expect(source).not.toMatch(/const paymentStatus = order\.paymentStatus \|\| 'paid'/);
  });

  it('aggOrders deve ser resiliente a canceled/cancelled (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/analytics/aggOrders.ts'),
      'utf8'
    );

    const handlesCanceled = /canceled/.test(source);
    const handlesCancelled = /cancelled/.test(source);

    expect(handlesCanceled && handlesCancelled).toBe(true);
  });

  it('aggOrders deve manter consistencia UTC entre dateKey e hourKey (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/analytics/aggOrders.ts'),
      'utf8'
    );

    // dateKey é baseado em toISOString (UTC), então hourKey deve usar getUTCHours
    expect(source).toMatch(/getUTCHours\(\)/);
  });

  it('aggregateDailySales nao deve fixar deslocamento -3h no codigo (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/analytics/aggregateDailySales.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/setHours\(startOfDay\.getHours\(\)\s*-\s*3\)/);
    expect(source).not.toMatch(/setHours\(endOfDay\.getHours\(\)\s*-\s*3\)/);
  });
});
