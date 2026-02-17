/**
 * ============================================================================
 * Tests — Dynamic Pricing Engine (shared/utils/dynamicPricingEngine)
 * ============================================================================
 *
 * Testes puro-unitários: sem mocks de Firebase, sem DOM.
 * Cada teste é determinístico usando timestamps fixos.
 */

import { describe, it, expect } from 'vitest';
import { evaluateDynamicPrice, toPricingSnapshot } from '../dynamicPricingEngine';
import type {
  DynamicPricingConfig,
  DynamicPricingContext,
  HappyHourParams,
  KegProgressiveParams,
} from '../../types/dynamicPricing';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '../../types/dynamicPricing';

// ============================================================================
// HELPERS
// ============================================================================

/** Cria uma Date com hora/minuto, dia fixo */
function makeTime(hours: number, minutes: number): Date {
  const d = new Date(2025, 0, 15, hours, minutes, 0, 0); // 15 Jan 2025
  return d;
}

/** Config com Happy Hour habilitado */
function hhConfig(windows: HappyHourParams['windows'], opts?: Partial<DynamicPricingConfig>): DynamicPricingConfig {
  return {
    enabled: true,
    maxVariationPercent: opts?.maxVariationPercent ?? 20,
    minChangeIntervalSec: 300,
    roundingPrecision: opts?.roundingPrecision ?? 4,
    rules: [
      {
        id: 'hh-test',
        type: 'happy_hour',
        enabled: true,
        priority: 10,
        label: 'Happy Hour',
        params: { windows },
      },
      ...(opts?.rules?.filter(r => r.id !== 'hh-test') ?? []),
    ],
  };
}

/** Config com Keg Progressive habilitado */
function kegConfig(tiers: KegProgressiveParams['tiers'], opts?: Partial<DynamicPricingConfig>): DynamicPricingConfig {
  return {
    enabled: true,
    maxVariationPercent: opts?.maxVariationPercent ?? 20,
    minChangeIntervalSec: 300,
    roundingPrecision: opts?.roundingPrecision ?? 4,
    rules: [
      {
        id: 'keg-test',
        type: 'keg_progressive',
        enabled: true,
        priority: 10,
        label: 'Barril Progressivo',
        params: { tiers },
      },
    ],
  };
}

// Base price per mL: R$25 / 500mL = R$0.05 per mL
const BASE_PRICE_PER_ML = 0.05;

// ============================================================================
// FEATURE FLAG (enabled / disabled)
// ============================================================================

describe('evaluateDynamicPrice — Feature Flag', () => {
  it('retorna preço base quando disabled', () => {
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, {
      ...DEFAULT_DYNAMIC_PRICING_CONFIG,
      enabled: false,
    }, { timestamp: makeTime(18, 0) });

    expect(result.effectivePricePerMl).toBe(BASE_PRICE_PER_ML);
    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
  });

  it('retorna preço base quando config é null', () => {
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, null, { timestamp: makeTime(18, 0) });

    expect(result.effectivePricePerMl).toBe(BASE_PRICE_PER_ML);
    expect(result.deltaPercent).toBe(0);
  });

  it('retorna preço base quando config é undefined', () => {
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, undefined, { timestamp: makeTime(18, 0) });

    expect(result.effectivePricePerMl).toBe(BASE_PRICE_PER_ML);
    expect(result.deltaPercent).toBe(0);
  });

  it('retorna preço base quando basePricePerMl é 0', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(0, config, { timestamp: makeTime(18, 0) });

    expect(result.effectivePricePerMl).toBe(0);
    expect(result.deltaPercent).toBe(0);
  });

  it('retorna preço base quando não há regras', () => {
    const config: DynamicPricingConfig = {
      enabled: true,
      maxVariationPercent: 20,
      minChangeIntervalSec: 300,
      roundingPrecision: 4,
      rules: [],
    };
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    expect(result.effectivePricePerMl).toBe(BASE_PRICE_PER_ML);
    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
  });
});

// ============================================================================
// HAPPY HOUR
// ============================================================================

describe('evaluateDynamicPrice — Happy Hour', () => {
  it('aplica desconto dentro da janela', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    expect(result.deltaPercent).toBe(-10);
    expect(result.ruleId).toBe('hh-test');
    expect(result.effectivePricePerMl).toBeLessThan(BASE_PRICE_PER_ML);
    expect(result.effectivePricePerMl).toBeCloseTo(0.045, 4); // 0.05 * 0.9
    expect(result.reason).toContain('Happy Hour');
  });

  it('não aplica fora da janela', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(12, 0) });

    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
    expect(result.effectivePricePerMl).toBe(BASE_PRICE_PER_ML);
  });

  it('aplica acréscimo (delta positivo)', () => {
    const config = hhConfig([{ startTime: '20:00', endTime: '23:00', deltaPercent: 15 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(21, 0) });

    expect(result.deltaPercent).toBe(15);
    expect(result.effectivePricePerMl).toBeCloseTo(0.0575, 4); // 0.05 * 1.15
  });

  it('suporta janela que cruza meia-noite', () => {
    const config = hhConfig([{ startTime: '23:00', endTime: '02:00', deltaPercent: -15 }]);

    // Dentro: 23:30
    const r1 = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(23, 30) });
    expect(r1.deltaPercent).toBe(-15);
    expect(r1.ruleId).toBe('hh-test');

    // Dentro: 01:00
    const r2 = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(1, 0) });
    expect(r2.deltaPercent).toBe(-15);

    // Fora: 15:00
    const r3 = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(15, 0) });
    expect(r3.deltaPercent).toBe(0);
    expect(r3.ruleId).toBeNull();
  });

  it('aplica a primeira janela que matcha (múltiplas janelas)', () => {
    const config = hhConfig([
      { startTime: '11:30', endTime: '13:30', deltaPercent: -5 },
      { startTime: '17:00', endTime: '19:00', deltaPercent: -10 },
    ]);

    const r1 = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(12, 0) });
    expect(r1.deltaPercent).toBe(-5);

    const r2 = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });
    expect(r2.deltaPercent).toBe(-10);
  });

  it('gera validUntil correto', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const ts = makeTime(18, 30);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: ts });

    expect(result.validUntil).not.toBeNull();
    // 30 min restantes (de 18:30 até 19:00)
    const validDate = new Date(result.validUntil!);
    const diffMinutes = (validDate.getTime() - ts.getTime()) / 60000;
    expect(diffMinutes).toBeCloseTo(30, 0);
  });

  it('ignora regra desabilitada', () => {
    const config: DynamicPricingConfig = {
      enabled: true,
      maxVariationPercent: 20,
      minChangeIntervalSec: 300,
      roundingPrecision: 4,
      rules: [
        {
          id: 'hh-disabled',
          type: 'happy_hour',
          enabled: false,
          priority: 10,
          label: 'HH Desabilitado',
          params: { windows: [{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }] },
        },
      ],
    };

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });
    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
  });

  it('não faz match no exato endTime', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(19, 0) });

    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
  });

  it('faz match no exato startTime', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(17, 0) });

    expect(result.deltaPercent).toBe(-10);
    expect(result.ruleId).toBe('hh-test');
  });
});

// ============================================================================
// KEG PROGRESSIVE
// ============================================================================

describe('evaluateDynamicPrice — Keg Progressive', () => {
  const tiers = [
    { minPercent: 0, maxPercent: 30, deltaPercent: 0 },
    { minPercent: 30, maxPercent: 60, deltaPercent: -5 },
    { minPercent: 60, maxPercent: 100, deltaPercent: -15 },
  ];

  it('retorna sem alteração para faixa 0–30%', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 20,
    });

    // Delta 0 = sem alteração (retorna null do evaluator)
    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
  });

  it('aplica -5% para faixa 30–60%', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 45,
    });

    expect(result.deltaPercent).toBe(-5);
    expect(result.ruleId).toBe('keg-test');
    expect(result.effectivePricePerMl).toBeCloseTo(0.0475, 4); // 0.05 * 0.95
  });

  it('aplica -15% para faixa 60–100%', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 80,
    });

    expect(result.deltaPercent).toBe(-15);
    expect(result.ruleId).toBe('keg-test');
    expect(result.effectivePricePerMl).toBeCloseTo(0.0425, 4); // 0.05 * 0.85
  });

  it('não aplica quando kegLevelPercent é undefined', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
    });

    expect(result.deltaPercent).toBe(0);
    expect(result.ruleId).toBeNull();
  });

  it('clampa kegLevelPercent negativo para 0', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: -5,
    });

    // level = 0, cai na faixa 0–30 com delta 0
    expect(result.deltaPercent).toBe(0);
  });

  it('clampa kegLevelPercent > 100 para 100', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 150, // clampa para 100, que agora matcha faixa 60–100 (maxPercent inclusivo quando == 100)
    });

    // level=100 matcha a faixa 60–100 com delta -15
    expect(result.deltaPercent).toBe(-15);
  });

  it('matcha exatamente no minPercent da faixa', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 60,
    });

    expect(result.deltaPercent).toBe(-15);
    expect(result.ruleId).toBe('keg-test');
  });

  it('não matcha exatamente no maxPercent da faixa (exclusive)', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 30,
    });

    // 30 >= 30 && 30 < 60 → matcha faixa 30–60
    expect(result.deltaPercent).toBe(-5);
    expect(result.ruleId).toBe('keg-test');
  });

  it('validUntil é null para keg progressive', () => {
    const config = kegConfig(tiers);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 45,
    });

    expect(result.validUntil).toBeNull();
  });
});

// ============================================================================
// PRIORIDADE (múltiplas regras)
// ============================================================================

describe('evaluateDynamicPrice — Priority', () => {
  it('primeira match por prioridade ganha (HH > Keg)', () => {
    const config: DynamicPricingConfig = {
      enabled: true,
      maxVariationPercent: 30,
      minChangeIntervalSec: 300,
      roundingPrecision: 4,
      rules: [
        {
          id: 'hh-1',
          type: 'happy_hour',
          enabled: true,
          priority: 5,
          label: 'HH Prioridade',
          params: { windows: [{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }] },
        },
        {
          id: 'keg-1',
          type: 'keg_progressive',
          enabled: true,
          priority: 10,
          label: 'Keg Low Priority',
          params: { tiers: [{ minPercent: 0, maxPercent: 100, deltaPercent: -20 }] },
        },
      ],
    };

    // Ambas regras matcham, mas HH tem prioridade 5 < 10
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(18, 0),
      kegLevelPercent: 50,
    });

    expect(result.ruleId).toBe('hh-1');
    expect(result.deltaPercent).toBe(-10);
  });

  it('regra de maior prioridade que não matcha é ignorada', () => {
    const config: DynamicPricingConfig = {
      enabled: true,
      maxVariationPercent: 30,
      minChangeIntervalSec: 300,
      roundingPrecision: 4,
      rules: [
        {
          id: 'hh-1',
          type: 'happy_hour',
          enabled: true,
          priority: 5,
          label: 'HH fora do horário',
          params: { windows: [{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }] },
        },
        {
          id: 'keg-1',
          type: 'keg_progressive',
          enabled: true,
          priority: 10,
          label: 'Keg',
          params: { tiers: [{ minPercent: 30, maxPercent: 100, deltaPercent: -20 }] },
        },
      ],
    };

    // HH não matcha (12:00 fora da janela), Keg matcha
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(12, 0),
      kegLevelPercent: 50,
    });

    expect(result.ruleId).toBe('keg-1');
    expect(result.deltaPercent).toBe(-20);
  });
});

// ============================================================================
// MAX VARIATION (CLAMPING)
// ============================================================================

describe('evaluateDynamicPrice — Max Variation Clamping', () => {
  it('limita desconto ao maxVariationPercent', () => {
    const config = hhConfig(
      [{ startTime: '17:00', endTime: '19:00', deltaPercent: -30 }],
      { maxVariationPercent: 15 },
    );

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    expect(result.deltaPercent).toBe(-15); // clampado de -30 para -15
    expect(result.effectivePricePerMl).toBeCloseTo(0.0425, 4); // 0.05 * 0.85
  });

  it('limita acréscimo ao maxVariationPercent', () => {
    const config = hhConfig(
      [{ startTime: '20:00', endTime: '23:00', deltaPercent: 50 }],
      { maxVariationPercent: 10 },
    );

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(21, 0) });

    expect(result.deltaPercent).toBe(10); // clampado de 50 para 10
    expect(result.effectivePricePerMl).toBeCloseTo(0.055, 4); // 0.05 * 1.10
  });

  it('não clampa se delta está dentro do limite', () => {
    const config = hhConfig(
      [{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }],
      { maxVariationPercent: 20 },
    );

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    expect(result.deltaPercent).toBe(-10); // não clampado
  });
});

// ============================================================================
// ARREDONDAMENTO
// ============================================================================

describe('evaluateDynamicPrice — Rounding', () => {
  it('arredonda com precisão 2', () => {
    const config = hhConfig(
      [{ startTime: '17:00', endTime: '19:00', deltaPercent: -7 }],
      { roundingPrecision: 2 },
    );

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    // 0.05 * 0.93 = 0.0465 → rounded to 0.05 (2 decimal places)
    expect(result.effectivePricePerMl).toBe(0.05);
  });

  it('arredonda com precisão 4 (default)', () => {
    // 0.05 * 0.93 = 0.0465 → rounded to 0.0465 (4 decimal places)
    const config = hhConfig(
      [{ startTime: '17:00', endTime: '19:00', deltaPercent: -7 }],
      { roundingPrecision: 4 },
    );

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });
    expect(result.effectivePricePerMl).toBe(0.0465);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('evaluateDynamicPrice — Edge Cases', () => {
  it('preço não fica negativo com desconto > 100%', () => {
    // maxVariationPercent clampa para 50 max, mas vamos testar
    const config: DynamicPricingConfig = {
      enabled: true,
      maxVariationPercent: 99,
      minChangeIntervalSec: 300,
      roundingPrecision: 4,
      rules: [
        {
          id: 'extreme',
          type: 'happy_hour',
          enabled: true,
          priority: 1,
          label: 'Extreme',
          params: { windows: [{ startTime: '00:00', endTime: '23:59', deltaPercent: -99 }] },
        },
      ],
    };

    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(12, 0) });
    expect(result.effectivePricePerMl).toBeGreaterThanOrEqual(0);
  });

  it('computedAt é um ISO string válido', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    expect(result.computedAt).toBeTruthy();
    expect(new Date(result.computedAt).toISOString()).toBe(result.computedAt);
  });

  it('janela vazia na happy hour → sem match', () => {
    const config = hhConfig([]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    expect(result.deltaPercent).toBe(0);
  });

  it('tiers vazios no keg → sem match', () => {
    const config = kegConfig([]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, {
      timestamp: makeTime(18, 0),
      kegLevelPercent: 50,
    });

    expect(result.deltaPercent).toBe(0);
  });
});

// ============================================================================
// toPricingSnapshot
// ============================================================================

describe('toPricingSnapshot', () => {
  it('cria snapshot correto a partir de DynamicPricingResult', () => {
    const config = hhConfig([{ startTime: '17:00', endTime: '19:00', deltaPercent: -10 }]);
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, config, { timestamp: makeTime(18, 0) });

    const snapshot = toPricingSnapshot(result, 25, 22.5);

    expect(snapshot.basePrice).toBe(25);
    expect(snapshot.effectivePrice).toBe(22.5);
    expect(snapshot.basePricePerMl).toBe(BASE_PRICE_PER_ML);
    expect(snapshot.effectivePricePerMl).toBeCloseTo(0.045, 4);
    expect(snapshot.ruleId).toBe('hh-test');
    expect(snapshot.reason).toContain('Happy Hour');
    expect(snapshot.deltaPercent).toBe(-10);
    expect(snapshot.computedAt).toBeTruthy();
    expect(snapshot.validUntil).not.toBeNull();
  });

  it('snapshot sem regra aplicada', () => {
    const result = evaluateDynamicPrice(BASE_PRICE_PER_ML, null, { timestamp: makeTime(18, 0) });
    const snapshot = toPricingSnapshot(result, 25, 25);

    expect(snapshot.basePrice).toBe(25);
    expect(snapshot.effectivePrice).toBe(25);
    expect(snapshot.ruleId).toBeNull();
    expect(snapshot.deltaPercent).toBe(0);
  });
});
