/**
 * Tests for shared/utils/dynamicPricingEngine.ts
 * Pure function — no mocking needed
 */
import { describe, it, expect } from 'vitest';
import { evaluateDynamicPrice, toPricingSnapshot } from '../utils/dynamicPricingEngine';
import type { DynamicPricingConfig, DynamicPricingContext } from '../types/dynamicPricing';

const baseCtx = (): DynamicPricingContext => ({
  timestamp: new Date('2025-01-15T12:00:00'),
});

describe('shared/utils/dynamicPricingEngine', () => {
  it('retorna preço inalterado quando disabled', () => {
    const result = evaluateDynamicPrice(0.05, { enabled: false } as any, baseCtx());
    expect(result.effectivePricePerMl).toBe(0.05);
    expect(result.ruleId).toBeNull();
    expect(result.deltaPercent).toBe(0);
  });

  it('retorna preço inalterado quando config é null', () => {
    const result = evaluateDynamicPrice(0.05, null, baseCtx());
    expect(result.effectivePricePerMl).toBe(0.05);
  });

  it('retorna preço inalterado quando basePricePerMl <= 0', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 20,
      minChangeIntervalSec: 300, roundingPrecision: 4, rules: [],
    };
    const result = evaluateDynamicPrice(0, config, baseCtx());
    expect(result.effectivePricePerMl).toBe(0);
  });

  it('retorna preço inalterado quando nenhuma regra matcha', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 20,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'hh-1', type: 'happy_hour', enabled: true, priority: 1, label: 'HH',
        params: { windows: [{ startTime: '18:00', endTime: '20:00', deltaPercent: -10 }] },
      }],
    };
    // Context at 12:00 — outside happy hour
    const result = evaluateDynamicPrice(0.05, config, baseCtx());
    expect(result.effectivePricePerMl).toBe(0.05);
    expect(result.ruleId).toBeNull();
  });

  it('aplica happy hour quando dentro da janela', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 20,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'hh-1', type: 'happy_hour', enabled: true, priority: 1, label: 'Happy Hour',
        params: { windows: [{ startTime: '11:00', endTime: '13:00', deltaPercent: -10 }] },
      }],
    };
    const result = evaluateDynamicPrice(0.05, config, baseCtx());
    expect(result.effectivePricePerMl).toBe(0.045);
    expect(result.ruleId).toBe('hh-1');
    expect(result.deltaPercent).toBe(-10);
  });

  it('clamp delta ao maxVariationPercent', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 5,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'hh-big', type: 'happy_hour', enabled: true, priority: 1, label: 'Big HH',
        params: { windows: [{ startTime: '11:00', endTime: '13:00', deltaPercent: -30 }] },
      }],
    };
    const result = evaluateDynamicPrice(0.10, config, baseCtx());
    // Clamped to -5% instead of -30%
    expect(result.deltaPercent).toBe(-5);
    expect(result.effectivePricePerMl).toBe(0.095);
  });

  it('aplica keg_progressive quando nível é fornecido', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 30,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'keg-1', type: 'keg_progressive', enabled: true, priority: 1, label: 'Progressivo',
        params: { tiers: [
          { minPercent: 0, maxPercent: 50, deltaPercent: 0 },
          { minPercent: 50, maxPercent: 80, deltaPercent: -5 },
          { minPercent: 80, maxPercent: 100, deltaPercent: -15 },
        ]},
      }],
    };
    const ctx: DynamicPricingContext = { timestamp: new Date(), kegLevelPercent: 85 };
    const result = evaluateDynamicPrice(0.10, config, ctx);
    expect(result.ruleId).toBe('keg-1');
    expect(result.deltaPercent).toBe(-15);
    expect(result.effectivePricePerMl).toBe(0.085);
  });

  it('ignora keg_progressive sem kegLevelPercent', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 30,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'keg-1', type: 'keg_progressive', enabled: true, priority: 1, label: 'Prog',
        params: { tiers: [{ minPercent: 0, maxPercent: 100, deltaPercent: -10 }] },
      }],
    };
    const result = evaluateDynamicPrice(0.10, config, baseCtx());
    expect(result.ruleId).toBeNull();
  });

  it('prioridade: menor número ganha', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 30,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [
        {
          id: 'keg-low', type: 'keg_progressive', enabled: true, priority: 2, label: 'Keg',
          params: { tiers: [{ minPercent: 0, maxPercent: 100, deltaPercent: -20 }] },
        },
        {
          id: 'hh-lunch', type: 'happy_hour', enabled: true, priority: 1, label: 'HH',
          params: { windows: [{ startTime: '11:00', endTime: '13:00', deltaPercent: -10 }] },
        },
      ],
    };
    const ctx: DynamicPricingContext = { timestamp: new Date('2025-01-15T12:00:00'), kegLevelPercent: 50 };
    const result = evaluateDynamicPrice(0.10, config, ctx);
    expect(result.ruleId).toBe('hh-lunch'); // priority 1 wins
  });

  it('ignora regras desabilitadas', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 30,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'hh-off', type: 'happy_hour', enabled: false, priority: 1, label: 'HH',
        params: { windows: [{ startTime: '11:00', endTime: '13:00', deltaPercent: -10 }] },
      }],
    };
    const result = evaluateDynamicPrice(0.10, config, baseCtx());
    expect(result.ruleId).toBeNull();
  });

  it('happy hour com janela cruzando meia-noite', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 30,
      minChangeIntervalSec: 300, roundingPrecision: 4,
      rules: [{
        id: 'hh-night', type: 'happy_hour', enabled: true, priority: 1, label: 'Noite',
        params: { windows: [{ startTime: '23:00', endTime: '01:00', deltaPercent: -15 }] },
      }],
    };
    const ctx: DynamicPricingContext = { timestamp: new Date('2025-01-15T23:30:00') };
    const result = evaluateDynamicPrice(0.10, config, ctx);
    expect(result.ruleId).toBe('hh-night');
    expect(result.deltaPercent).toBe(-15);
  });

  describe('toPricingSnapshot', () => {
    it('converte resultado para snapshot', () => {
      const result = evaluateDynamicPrice(0.05, null, baseCtx());
      const snapshot = toPricingSnapshot(result, 10.0, 10.0);
      expect(snapshot.basePrice).toBe(10.0);
      expect(snapshot.effectivePrice).toBe(10.0);
      expect(snapshot.basePricePerMl).toBe(0.05);
      expect(snapshot.ruleId).toBeNull();
    });
  });
});
