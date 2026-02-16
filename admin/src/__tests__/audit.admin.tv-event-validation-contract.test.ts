import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetFirestoreMocks, TEST_FRANCHISE_ID, TEST_STORE_ID } from './test-utils';

vi.mock('@/lib/pathResolver', () => ({
  tvConfigPath: vi.fn((franchiseId: string, storeId: string) => `franchises/${franchiseId}/stores/${storeId}/tvConfig/current`),
  eventStatsPath: vi.fn((franchiseId: string, storeId: string) => `franchises/${franchiseId}/stores/${storeId}/eventStats/current`),
  rankingAggPath: vi.fn((franchiseId: string, storeId: string) => `franchises/${franchiseId}/stores/${storeId}/rankingAgg`),
  challengesPath: vi.fn((franchiseId: string, storeId: string) => `franchises/${franchiseId}/stores/${storeId}/challenges`),
  prizesPath: vi.fn((franchiseId: string, storeId: string) => `franchises/${franchiseId}/stores/${storeId}/prizes`),
}));

import {
  updateTvConfig,
  setCollectiveGoal,
  toggleEventMode,
  createChallenge,
  addPrizesBatch,
} from '@/services/tvEventService';

describe('Audit Admin - tvEventService validation contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('updateTvConfig deve rejeitar rotationIntervalSec fora da faixa', async () => {
    await expect(
      updateTvConfig(TEST_FRANCHISE_ID, TEST_STORE_ID, { rotationIntervalSec: 2 } as any),
    ).rejects.toThrow(/rotationIntervalSec/);
  });

  it('updateTvConfig deve rejeitar rotationIntervalSec nao numerico (RED)', async () => {
    await expect(
      updateTvConfig(TEST_FRANCHISE_ID, TEST_STORE_ID, { rotationIntervalSec: '10' as any } as any),
    ).rejects.toThrow(/rotationIntervalSec|number|numérico|numerico/i);
  });

  it('updateTvConfig deve rejeitar maxDisplayPositions nao numerico (RED)', async () => {
    await expect(
      updateTvConfig(TEST_FRANCHISE_ID, TEST_STORE_ID, { maxDisplayPositions: '8' as any } as any),
    ).rejects.toThrow(/maxDisplayPositions|number|numérico|numerico/i);
  });

  it('setCollectiveGoal deve rejeitar milestone targetMl nao numerico (RED)', async () => {
    await expect(
      setCollectiveGoal(TEST_FRANCHISE_ID, TEST_STORE_ID, 1000, 'Meta', [
        { targetMl: '500' as any, label: 'M1', reached: false } as any,
      ]),
    ).rejects.toThrow(/Milestone targetMl|number|numérico|numerico/i);
  });

  it('createChallenge deve rejeitar threshold nao numerico (RED)', async () => {
    await expect(
      createChallenge(TEST_FRANCHISE_ID, TEST_STORE_ID, {
        title: 'Desafio X',
        rule: {
          type: 'min_orders',
          threshold: '3' as any,
          windowMinutes: 30,
        },
        status: 'draft',
        startsAt: null as any,
        endsAt: null as any,
        rewardType: 'coupon',
        rewardDescription: 'Cupom',
      } as any),
    ).rejects.toThrow(/Threshold|number|numérico|numerico/i);
  });

  it('addPrizesBatch deve rejeitar lotes acima de 500 itens', async () => {
    const prizes = Array.from({ length: 501 }, (_, i) => ({
      type: 'coupon',
      description: `Prize ${i}`,
      winnerId: undefined,
      winnerDisplayName: undefined,
      wonAt: undefined,
      expiresAt: undefined,
      redeemedAt: undefined,
      redeemedBy: undefined,
      orderId: undefined,
    }));

    await expect(
      addPrizesBatch(TEST_FRANCHISE_ID, TEST_STORE_ID, prizes as any),
    ).rejects.toThrow(/500/);
  });

  it('toggleEventMode deve rejeitar duracao acima de 24h', async () => {
    await expect(
      toggleEventMode(TEST_FRANCHISE_ID, TEST_STORE_ID, true, 'Evento', 1441),
    ).rejects.toThrow(/1440|24h/);
  });
});
