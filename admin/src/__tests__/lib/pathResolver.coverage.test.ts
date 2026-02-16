import { beforeAll, describe, expect, it, vi } from 'vitest';

let mod: typeof import('@/lib/pathResolver');

beforeAll(async () => {
  vi.unmock('@/lib/pathResolver');
  mod = await import('@/lib/pathResolver');
});

describe('pathResolver coverage', () => {
  it('builds canonical paths for store, members and globals', () => {
    expect(mod.storesPath('f1')).toBe('franchises/f1/stores');
    expect(mod.storePath('f1', 's1')).toBe('franchises/f1/stores/s1');
    expect(mod.storeSubPath('f1', 's1', 'products')).toBe('franchises/f1/stores/s1/products');
    expect(mod.storeDocPath('f1', 's1', 'orders', 'o1')).toBe('franchises/f1/stores/s1/orders/o1');
    expect(mod.membersPath('f1')).toBe('franchises/f1/members');
    expect(mod.memberPath('f1', 'u1')).toBe('franchises/f1/members/u1');
    expect(mod.invitationsPath()).toBe('invitations');
    expect(mod.auditLogsPath('f1')).toBe('franchises/f1/auditLogs');
    expect(mod.franchisePath('f1')).toBe('franchises/f1');
    expect(mod.userPath('u1')).toBe('users/u1');
  });

  it('builds ranking, tv and franchise operational paths', () => {
    expect(mod.ordersPath('f1', 's1')).toBe('franchises/f1/stores/s1/orders');
    expect(mod.tvConfigPath('f1', 's1')).toBe('franchises/f1/stores/s1/tvConfig/current');
    expect(mod.eventStatsPath('f1', 's1')).toBe('franchises/f1/stores/s1/eventStats/current');
    expect(mod.rankingAggPath('f1', 's1')).toBe('franchises/f1/stores/s1/rankingAgg');
    expect(mod.challengesPath('f1', 's1')).toBe('franchises/f1/stores/s1/challenges');
    expect(mod.prizesPath('f1', 's1')).toBe('franchises/f1/stores/s1/prizes');
    expect(mod.franchiseNotificationsPath('f1')).toBe('franchises/f1/notifications');
    expect(mod.billingEventsPath('f1')).toBe('franchises/f1/billingEvents');
  });

  it('builds finance paths for all mapped subcollections', () => {
    expect(mod.financeSubPath('f1', 's1', 'accounts')).toBe('franchises/f1/stores/s1/finAccounts');
    expect(mod.financeSubPath('f1', 's1', 'categories')).toBe('franchises/f1/stores/s1/finCategories');
    expect(mod.financeSubPath('f1', 's1', 'costCenters')).toBe('franchises/f1/stores/s1/finCostCenters');
    expect(mod.financeSubPath('f1', 's1', 'parties')).toBe('franchises/f1/stores/s1/finParties');
    expect(mod.financeSubPath('f1', 's1', 'ledger')).toBe('franchises/f1/stores/s1/finLedger');
    expect(mod.financeSubPath('f1', 's1', 'invoices')).toBe('franchises/f1/stores/s1/finInvoices');
    expect(mod.financeSubPath('f1', 's1', 'bills')).toBe('franchises/f1/stores/s1/finBills');
    expect(mod.financeSubPath('f1', 's1', 'finPayments')).toBe('franchises/f1/stores/s1/finPayments');
    expect(mod.financeDocPath('f1', 's1', 'ledger', 'l1')).toBe('franchises/f1/stores/s1/finLedger/l1');
    expect(mod.financeSummaryPath('f1')).toBe('franchises/f1/financeSummary');
  });

  it('throws when required franchise id is missing', () => {
    expect(() => mod.storesPath('')).toThrow('storesPath');
    expect(() => mod.storePath('', 's1')).toThrow('storePath');
    expect(() => mod.storeSubPath('', 's1', 'orders')).toThrow('storeSubPath');
    expect(() => mod.financeSubPath('', 's1', 'ledger')).toThrow('financeSubPath');
  });

  it('keeps helper object wired to exported functions', () => {
    expect(mod.pathResolver.storePath('f1', 's1')).toBe(mod.storePath('f1', 's1'));
    expect(mod.pathResolver.financeDocPath('f1', 's1', 'accounts', 'a1')).toBe(
      mod.financeDocPath('f1', 's1', 'accounts', 'a1'),
    );
  });
});
