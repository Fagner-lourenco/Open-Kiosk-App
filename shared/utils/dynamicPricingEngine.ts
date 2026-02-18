/**
 * ============================================================================
 * Dynamic Pricing Engine — Motor de regras determinístico
 * ============================================================================
 *
 * Função pura: recebe preço base, regras e contexto, retorna preço efetivo.
 * - Regras são avaliadas por prioridade (menor número = maior prioridade)
 * - Primeira regra habilitada que "matcha" vence (exclusivo, não acumulativo)
 * - Guardrails: maxVariationPercent limita delta; roundingPrecision controla casas
 * - Sem side-effects, sem I/O, determinística
 *
 * @module shared/utils/dynamicPricingEngine
 */

import type {
  DynamicPricingConfig,
  DynamicPricingContext,
  DynamicPricingResult,
  DynamicPricingRule,
  HappyHourParams,
  KegProgressiveParams,
} from '../types/dynamicPricing';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '../types/dynamicPricing';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrai HH:MM de um Date como minutos desde meia-noite.
 */
function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Parseia "HH:MM" para minutos desde meia-noite.
 */
function parseTimeString(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Verifica se um horário (em minutos) está dentro de uma janela.
 * Suporta janelas que cruzam meia-noite (ex: 23:00–01:00).
 */
function isInTimeWindow(currentMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes <= endMinutes) {
    // Janela normal (ex: 11:30–13:30)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Janela que cruza meia-noite (ex: 23:00–01:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Calcula minutos restantes até o fim de uma janela de tempo.
 */
function minutesUntilEnd(currentMinutes: number, endMinutes: number): number {
  if (endMinutes > currentMinutes) {
    return endMinutes - currentMinutes;
  }
  // Cruza meia-noite
  return (1440 - currentMinutes) + endMinutes;
}

/**
 * Arredonda um número com precisão específica.
 */
function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// EVALUATORS POR TIPO DE REGRA
// ============================================================================

interface RuleMatchResult {
  deltaPercent: number;
  reason: string;
  validUntil: Date | null;
}

/**
 * Avalia regra Happy Hour.
 */
function evaluateHappyHour(
  rule: DynamicPricingRule,
  ctx: DynamicPricingContext
): RuleMatchResult | null {
  const params = rule.params as HappyHourParams;
  if (!params.windows || params.windows.length === 0) return null;

  const currentMinutes = minutesSinceMidnight(ctx.timestamp);

  for (const window of params.windows) {
    const start = parseTimeString(window.startTime);
    const end = parseTimeString(window.endTime);

    if (isInTimeWindow(currentMinutes, start, end)) {
      const minsLeft = minutesUntilEnd(currentMinutes, end);
      const validUntil = new Date(ctx.timestamp.getTime() + minsLeft * 60_000);

      return {
        deltaPercent: window.deltaPercent,
        reason: `${rule.label} ${window.deltaPercent > 0 ? '+' : ''}${window.deltaPercent}%`,
        validUntil,
      };
    }
  }

  return null;
}

/**
 * Avalia regra Progressivo por Barril.
 */
function evaluateKegProgressive(
  rule: DynamicPricingRule,
  ctx: DynamicPricingContext
): RuleMatchResult | null {
  const params = rule.params as KegProgressiveParams;
  if (!params.tiers || params.tiers.length === 0) return null;
  if (ctx.kegLevelPercent === undefined || ctx.kegLevelPercent === null) return null;

  const level = Math.max(0, Math.min(100, ctx.kegLevelPercent));

  for (const tier of params.tiers) {
    // Half-open interval [min, max) — standard for contiguous ranges.
    // Special case: level === 100 (fully consumed) matches a tier whose maxPercent is 100.
    if (level >= tier.minPercent && (level < tier.maxPercent || (level === 100 && tier.maxPercent === 100))) {
      if (tier.deltaPercent === 0) return null; // Delta 0 = sem alteração
      return {
        deltaPercent: tier.deltaPercent,
        reason: `${rule.label} (${tier.minPercent}–${tier.maxPercent}%): ${tier.deltaPercent > 0 ? '+' : ''}${tier.deltaPercent}%`,
        validUntil: null, // Barril muda continuamente, sem "valid until" fixo
      };
    }
  }

  return null;
}

/** Registry dos avaliadores por tipo de regra */
const EVALUATORS: Record<string, (rule: DynamicPricingRule, ctx: DynamicPricingContext) => RuleMatchResult | null> = {
  happy_hour: evaluateHappyHour,
  keg_progressive: evaluateKegProgressive,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Avalia preço dinâmico dado um preço base por mL, config e contexto.
 *
 * - Retorna `originalPricePerMl` inalterado se `config.enabled === false`
 * - Avalia regras por prioridade (menor = maior prioridade)
 * - Primeira match ganha (não acumula)
 * - Limita variação a `config.maxVariationPercent`
 * - Arredonda com `config.roundingPrecision`
 *
 * @param basePricePerMl - Preço base por mililitro (derivado de size.price / size.ml)
 * @param config - Config de preço dinâmico da loja (ou DEFAULT se ausente)
 * @param context - Contexto temporal + estado do barril
 * @returns Resultado com preço efetivo, regra aplicada e metadata
 */
export function evaluateDynamicPrice(
  basePricePerMl: number,
  config: DynamicPricingConfig | undefined | null,
  context: DynamicPricingContext
): DynamicPricingResult {
  const cfg = config || DEFAULT_DYNAMIC_PRICING_CONFIG;
  const now = context.timestamp;
  const computedAt = now.toISOString();

  // Early return: disabled ou preço base inválido
  if (!cfg.enabled || basePricePerMl <= 0) {
    return {
      effectivePricePerMl: basePricePerMl,
      originalPricePerMl: basePricePerMl,
      ruleId: null,
      reason: '',
      deltaPercent: 0,
      computedAt,
      validUntil: null,
    };
  }

  // Ordena regras por prioridade (menor = maior prioridade)
  const sortedRules = [...cfg.rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Avalia cada regra em ordem de prioridade — primeira match ganha
  for (const rule of sortedRules) {
    const evaluator = EVALUATORS[rule.type];
    if (!evaluator) continue;

    const match = evaluator(rule, context);
    if (!match) continue;

    // Clamp delta ao maxVariationPercent
    const maxVar = cfg.maxVariationPercent ?? 20;
    const clampedDelta = Math.max(-maxVar, Math.min(maxVar, match.deltaPercent));

    // Calcula preço efetivo
    const rawEffective = basePricePerMl * (1 + clampedDelta / 100);
    const effective = roundTo(Math.max(0, rawEffective), cfg.roundingPrecision ?? 4);

    return {
      effectivePricePerMl: effective,
      originalPricePerMl: basePricePerMl,
      ruleId: rule.id,
      reason: match.reason,
      deltaPercent: clampedDelta,
      computedAt,
      validUntil: match.validUntil?.toISOString() ?? null,
    };
  }

  // Nenhuma regra matchou
  return {
    effectivePricePerMl: basePricePerMl,
    originalPricePerMl: basePricePerMl,
    ruleId: null,
    reason: '',
    deltaPercent: 0,
    computedAt,
    validUntil: null,
  };
}

/**
 * Converte um DynamicPricingResult em PricingSnapshot para persistência.
 * Recebe os preços absolutos (por unidade) para gravar no pedido.
 */
export function toPricingSnapshot(
  result: DynamicPricingResult,
  basePrice: number,
  effectivePrice: number
): import('../types/dynamicPricing').PricingSnapshot {
  return {
    basePrice,
    effectivePrice,
    basePricePerMl: result.originalPricePerMl,
    effectivePricePerMl: result.effectivePricePerMl,
    ruleId: result.ruleId,
    reason: result.reason,
    deltaPercent: result.deltaPercent,
    computedAt: result.computedAt,
    validUntil: result.validUntil,
  };
}
