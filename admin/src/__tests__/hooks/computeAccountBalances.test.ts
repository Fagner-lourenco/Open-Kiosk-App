/**
 * computeAccountBalances — saldo real por conta (openingBalance + ledger efetivado)
 */
import { describe, it, expect } from 'vitest';
import { computeAccountBalances } from '@/hooks/useFinAccounts';
import type { FinAccount, LedgerEntry } from '@/types/finance';

const account = (id: string, openingBalance: number, status: 'active' | 'inactive' = 'active'): FinAccount =>
  ({ id, name: id, type: 'cash', currency: 'BRL', openingBalance, status } as FinAccount);

const entry = (
  accountId: string,
  direction: 'in' | 'out',
  amount: number,
  status: LedgerEntry['status'] = 'paid',
): LedgerEntry => ({ accountId, direction, amount, status } as LedgerEntry);

describe('computeAccountBalances', () => {
  it('soma entradas e subtrai saídas efetivadas', () => {
    const { balanceByAccount, totalBalance } = computeAccountBalances(
      [account('a1', 1000)],
      [entry('a1', 'in', 500), entry('a1', 'out', 200)],
    );
    expect(balanceByAccount.get('a1')).toBe(1300);
    expect(totalBalance).toBe(1300);
  });

  it('ignora lançamentos pending e canceled', () => {
    const { totalBalance } = computeAccountBalances(
      [account('a1', 100)],
      [entry('a1', 'in', 999, 'pending'), entry('a1', 'out', 999, 'canceled')],
    );
    expect(totalBalance).toBe(100);
  });

  it('inclui reconciled no saldo', () => {
    const { totalBalance } = computeAccountBalances(
      [account('a1', 0)],
      [entry('a1', 'in', 250, 'reconciled')],
    );
    expect(totalBalance).toBe(250);
  });

  it('contas inativas entram no balanceByAccount mas não no total', () => {
    const { balanceByAccount, totalBalance } = computeAccountBalances(
      [account('a1', 100), account('a2', 900, 'inactive')],
      [entry('a2', 'in', 100)],
    );
    expect(balanceByAccount.get('a2')).toBe(1000);
    expect(totalBalance).toBe(100);
  });

  it('ignora lançamentos de contas desconhecidas e sem accountId', () => {
    const { totalBalance } = computeAccountBalances(
      [account('a1', 50)],
      [entry('ghost', 'in', 500), entry('', 'in', 500)],
    );
    expect(totalBalance).toBe(50);
  });

  it('sem contas retorna total zero', () => {
    const { totalBalance, balanceByAccount } = computeAccountBalances([], [entry('a1', 'in', 10)]);
    expect(totalBalance).toBe(0);
    expect(balanceByAccount.size).toBe(0);
  });
});
