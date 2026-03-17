import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseReferenceId } from '../payments/paymentService';

describe('Audit Functions - contratos e inconsistencias', () => {
  it('parseReferenceId aceita formato dash okp-franchise-store-payment', () => {
    expect(parseReferenceId('okp-f1-s1-p1')).toEqual({
      franchiseId: 'f1',
      storeId: 's1',
      paymentId: 'p1',
    });
  });

  it('parseReferenceId aceita formato legacy pipe okp|franchise|store|payment', () => {
    expect(parseReferenceId('okp|f1|s1|p1')).toEqual({
      franchiseId: 'f1',
      storeId: 's1',
      paymentId: 'p1',
    });
  });

  it('parseReferenceId rejeita formatos invalidos', () => {
    expect(parseReferenceId('')).toBeNull();
    expect(parseReferenceId('okp-f1-s1')).toBeNull();
    expect(parseReferenceId('wrong-f1-s1-p1')).toBeNull();
  });

  it('notificacao de pagamento nao deve converter valor dividindo por 100 quando amount ja esta em BRL (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/payments/onPaymentUpdated.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/amount\s*\/\s*100/);
  });

  it('cleanup de loja deve incluir subcolecoes reais usadas pelo app (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/cleanup/onDeleteStore.ts'),
      'utf8'
    );

    const block = source.match(/const STORE_SUBCOLLECTIONS = \[([\s\S]*?)\] as const/)?.[1] ?? '';
    const declared = Array.from(block.matchAll(/'([^']+)'/g), (m) => m[1]);

    const expectedCriticalSubcollections = [
      'dailyStats',
      'metrics',
      'kegs',
      'tapAssignments',
      'devices',
      'hardware',
      'tvConfig',
      'eventStats',
      'finAccounts',
      'finBills',
      'finCategories',
      'finCostCenters',
      'finLedger',
      'finInvoices',
      'finParties',
      'finPayments',
      'calendarItems',
      'customers',
      'deals',
      'commercialEvents',
      'quotes',
      'rankingAgg',
      'challenges',
      'prizes',
    ];

    const missing = expectedCriticalSubcollections.filter((name) => !declared.includes(name));
    expect(missing).toEqual([]);
  });

  it('cleanup de loja deve usar estrategia recursiva para subcolecoes aninhadas (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/cleanup/onDeleteStore.ts'),
      'utf8'
    );

    // Ex.: commercialEvents/{eventId}/budgetLines, invoices/{invoiceId}/lines.
    // Deletar apenas docs da subcolecao pai nao remove filhos aninhados.
    const hasRecursiveDelete = /recursiveDelete\s*\(/.test(source);

    expect(hasRecursiveDelete).toBe(true);
  });

  it('callable cancelPagBankPayment usada no frontend deve estar exportada no entrypoint (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/index.ts'),
      'utf8'
    );

    expect(source).toMatch(/cancelPagBankPayment/);
  });

  it('cancelPagBankPayment nao deve persistir datas ISO string em Firestore (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/payments/index.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/cancelRequestedAt:\s*new Date\(\)\.toISOString\(\)/);
    expect(source).not.toMatch(/updatedAt:\s*new Date\(\)\.toISOString\(\)/);
  });
});
