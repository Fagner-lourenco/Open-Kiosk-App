import { describe, expect, it } from 'vitest';

describe('audit - functions entrypoint exports', () => {
  it('deve exportar funcoes criticas de auth/payments/erp/ranking/migrations', async () => {
    const entry = await import('../index');

    expect(entry.onUserCreated).toBeTruthy();
    expect(entry.setCustomClaims).toBeTruthy();
    expect(entry.setAdminClaims).toBeTruthy();
    expect(entry.syncMembershipClaims).toBeTruthy();

    expect(entry.createPayment).toBeTruthy();
    expect(entry.pagbankWebhook).toBeTruthy();
    expect(entry.cancelPagBankPayment).toBeTruthy();
    expect(entry.onPaymentUpdated).toBeTruthy();

    expect(entry.onServingSessionCreated).toBeTruthy();
    expect(entry.onWastageEventCreated).toBeTruthy();
    expect(entry.aggregateOperationalDaily).toBeTruthy();
    expect(entry.checkKegLevels).toBeTruthy();
    expect(entry.checkMaintenanceOverdue).toBeTruthy();
    expect(entry.resetTapDailyCounters).toBeTruthy();
    expect(entry.cleanupOldNotifications).toBeTruthy();

    expect(entry.onOrderUpdatedRanking).toBeTruthy();
    expect(entry.recalculateRanking30min).toBeTruthy();
    expect(entry.onOrderUpdatedChallenge).toBeTruthy();
    expect(entry.onOrderUpdatedGoldenServe).toBeTruthy();
    expect(entry.toggleEventMode).toBeTruthy();
    expect(entry.recalculateRanking30minNow).toBeTruthy();
    expect(entry.expirePrizes).toBeTruthy();
    expect(entry.expireEventMode).toBeTruthy();

    expect(entry.consolidatePaymentGatewayConfig).toBeTruthy();
    expect(entry.rollbackPaymentGatewayConfig).toBeTruthy();
    expect(entry.unifyStoreSettings).toBeTruthy();
    expect(entry.migrateDispensersToTaps).toBeTruthy();
  }, 30000);
});
