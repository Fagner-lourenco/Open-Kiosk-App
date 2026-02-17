/**
 * ============================================================================
 * Dynamic Pricing — Tipos compartilhados (Admin / Kiosk / Functions)
 * ============================================================================
 *
 * Preço Dinâmico: regras inteligentes de precificação (happy hour,
 * progressivo por barril, promo relâmpago) sem alterar o preço base
 * gravado no produto. O cálculo é puro e determinístico.
 */

// ============================================================================
// REGRAS
// ============================================================================

/** Tipos de regra suportados */
export type DynamicPricingRuleType =
  | 'happy_hour'
  | 'keg_progressive';

/** Janela de horário para Happy Hour */
export interface HappyHourWindow {
  /** Início no formato "HH:MM" (24h) */
  startTime: string;
  /** Fim no formato "HH:MM" (24h) */
  endTime: string;
  /** Delta percentual (negativo = desconto, positivo = acréscimo) */
  deltaPercent: number;
}

/** Parâmetros da regra Happy Hour */
export interface HappyHourParams {
  windows: HappyHourWindow[];
}

/** Faixa de nível do barril */
export interface KegTier {
  /** Percentual mínimo consumido (inclusive) */
  minPercent: number;
  /** Percentual máximo consumido (exclusive) */
  maxPercent: number;
  /** Delta percentual aplicado nesta faixa */
  deltaPercent: number;
}

/** Parâmetros da regra Progressivo por Barril */
export interface KegProgressiveParams {
  tiers: KegTier[];
}

/** Parâmetros de regra (union) */
export type DynamicPricingRuleParams = HappyHourParams | KegProgressiveParams;

/** Regra individual de preço dinâmico */
export interface DynamicPricingRule {
  /** ID único da regra (ex: "hh-almoco", "barril-prog") */
  id: string;
  /** Tipo da regra */
  type: DynamicPricingRuleType;
  /** Regra habilitada */
  enabled: boolean;
  /** Prioridade (menor número = maior prioridade). Primeira match ganha. */
  priority: number;
  /** Label amigável (exibido no UI) */
  label: string;
  /** Parâmetros específicos do tipo */
  params: DynamicPricingRuleParams;
}

// ============================================================================
// CONFIG (POR LOJA)
// ============================================================================

/** Configuração de preço dinâmico para uma loja */
export interface DynamicPricingConfig {
  /** Feature flag: ativa/desativa preço dinâmico */
  enabled: boolean;
  /** Variação máxima permitida (%) — guardrail de segurança */
  maxVariationPercent: number;
  /** Intervalo mínimo entre mudanças de preço (segundos) — anti-oscilação */
  minChangeIntervalSec: number;
  /** Casas decimais para arredondamento do preço final */
  roundingPrecision: number;
  /** Array de regras (ordenadas por priority na avaliação) */
  rules: DynamicPricingRule[];
}

/** Defaults seguros quando a config não existe */
export const DEFAULT_DYNAMIC_PRICING_CONFIG: DynamicPricingConfig = {
  enabled: false,
  maxVariationPercent: 20,
  minChangeIntervalSec: 300,
  roundingPrecision: 4,
  rules: [],
};

// ============================================================================
// RESULTADO DA AVALIAÇÃO
// ============================================================================

/** Resultado da avaliação do rules engine */
export interface DynamicPricingResult {
  /** Preço efetivo por mL (após regra) */
  effectivePricePerMl: number;
  /** Preço original por mL (antes da regra) */
  originalPricePerMl: number;
  /** ID da regra que matchou (null se nenhuma) */
  ruleId: string | null;
  /** Label da regra (para exibição no UI) */
  reason: string;
  /** Delta percentual aplicado (0 se sem regra) */
  deltaPercent: number;
  /** Timestamp de cálculo (ISO string) */
  computedAt: string;
  /** Validade do preço (ISO string, se aplicável) */
  validUntil: string | null;
}

// ============================================================================
// SNAPSHOT (AUDITORIA NO PEDIDO)
// ============================================================================

/** Snapshot de pricing salvo em cada item do pedido */
export interface PricingSnapshot {
  /** Preço base (original) */
  basePrice: number;
  /** Preço efetivo (cobrado) */
  effectivePrice: number;
  /** Preço por mL base */
  basePricePerMl: number;
  /** Preço por mL efetivo */
  effectivePricePerMl: number;
  /** ID da regra aplicada */
  ruleId: string | null;
  /** Motivo legível */
  reason: string;
  /** Delta % */
  deltaPercent: number;
  /** Quando foi calculado (ISO) */
  computedAt: string;
  /** Até quando vale (ISO, se aplicável) */
  validUntil: string | null;
}

// ============================================================================
// CONTEXTO DE AVALIAÇÃO
// ============================================================================

/** Contexto para o rules engine avaliar as regras */
export interface DynamicPricingContext {
  /** Timestamp atual (para Happy Hour) */
  timestamp: Date;
  /** Percentual consumido do barril (0–100), undefined se não disponível */
  kegLevelPercent?: number;
  /** ID da torneira (para overrides futuros) */
  tapId?: string;
  /** ID do produto (para overrides futuros) */
  productId?: string;
}
