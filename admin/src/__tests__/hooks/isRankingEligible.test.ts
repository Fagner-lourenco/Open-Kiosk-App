/**
 * isRankingEligible — critérios de inclusão de pedido no ranking de clientes.
 * Fixes auditoria ranking 2026-07: failed_dispense conta (pago), grafias
 * canceled/cancelled ambas excluem, pedidos anônimos ficam de fora.
 */
import { describe, it, expect } from 'vitest';
import { isRankingEligible } from '@/hooks/useCustomerRanking';
import type { FirestoreOrder } from '@/types/ranking';

const order = (over: Partial<FirestoreOrder>): FirestoreOrder =>
  ({
    customerName: 'JOAO SILVA',
    status: 'completed',
    paymentStatus: 'paid',
    total: 25,
    items: [],
    date: '2026-07-04',
    ...over,
  } as FirestoreOrder);

describe('isRankingEligible', () => {
  it('aceita pedido pago e completado com nome', () => {
    expect(isRankingEligible(order({}))).toBe(true);
  });

  it('aceita failed_dispense (cliente pagou)', () => {
    expect(isRankingEligible(order({ status: 'failed_dispense' }))).toBe(true);
  });

  it('aceita paid_pending_dispense e dispensing', () => {
    expect(isRankingEligible(order({ status: 'paid_pending_dispense' }))).toBe(true);
    expect(isRankingEligible(order({ status: 'dispensing' }))).toBe(true);
  });

  it('rejeita pedido sem nome de cliente (venda anônima)', () => {
    expect(isRankingEligible(order({ customerName: undefined }))).toBe(false);
  });

  it('aceita cardholderName como fallback de nome', () => {
    expect(
      isRankingEligible(order({ customerName: undefined, cardholderName: 'MARIA' } as Partial<FirestoreOrder>)),
    ).toBe(true);
  });

  it('rejeita status cancelled', () => {
    expect(isRankingEligible(order({ status: 'cancelled' }))).toBe(false);
  });

  it('rejeita paymentStatus refunded', () => {
    expect(isRankingEligible(order({ paymentStatus: 'refunded' }))).toBe(false);
  });

  it('rejeita ambas grafias de cancelamento no paymentStatus', () => {
    expect(isRankingEligible(order({ paymentStatus: 'canceled' }))).toBe(false);
    expect(isRankingEligible(order({ paymentStatus: 'cancelled' }))).toBe(false);
  });

  it('rejeita paymentStatus expired e failed', () => {
    expect(isRankingEligible(order({ paymentStatus: 'expired' }))).toBe(false);
    expect(isRankingEligible(order({ paymentStatus: 'failed' }))).toBe(false);
  });

  it('aceita pedido sem paymentStatus (legado) com status válido', () => {
    expect(isRankingEligible(order({ paymentStatus: undefined }))).toBe(true);
  });
});
