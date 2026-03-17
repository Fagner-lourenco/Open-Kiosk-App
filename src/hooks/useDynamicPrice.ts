/**
 * ============================================================================
 * useDynamicPrice — Hook para obter preço dinâmico de um produto drink
 * ============================================================================
 *
 * Encapsula a lógica de avaliação do Dynamic Pricing Engine para uso
 * em qualquer componente (Shop cards, checkout modal, cart, etc.).
 *
 * - Atualiza automaticamente a cada 60s para reagir a Happy Hour
 * - Reage a mudanças na config (admin liga/desliga DP em tempo real)
 * - Retorna preço original quando DP está desativado ou não se aplica
 */

import { useState, useEffect, useMemo } from 'react';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { evaluateDynamicPrice } from '../../shared/utils/dynamicPricingEngine';
import type { DynamicPricingResult } from '../../shared/types/dynamicPricing';

/** Intervalo de atualização para regras baseadas em tempo (Happy Hour) */
const TIME_REFRESH_MS = 60_000;

export interface DynamicPriceInfo {
  /** Preço final já calculado para o size (com DP aplicado) */
  effectivePrice: number;
  /** Preço base original do size */
  basePrice: number;
  /** Se dynamic pricing está ativo e alterou o preço */
  isModified: boolean;
  /** Percentual de variação (-20 a +20 tipicamente) */
  deltaPercent: number;
  /** Label da regra aplicada (ex: "Happy Hour -15%") */
  reason: string;
  /** Resultado completo do engine (null se DP inativo) */
  result: DynamicPricingResult | null;
}

/**
 * Retorna informações de preço dinâmico para um drink com size específico.
 *
 * @param sizePrice   Preço base do size (ex: 12.90)
 * @param sizeMl      Volume do size em mL (ex: 300)
 * @param kegLevelPercent  Nível atual do barril (0-100), undefined se desconhecido
 */
export function useDynamicPrice(
  sizePrice: number | undefined,
  sizeMl: number | undefined,
  kegLevelPercent?: number,
): DynamicPriceInfo {
  const { settings } = useStoreSettings();

  // Tick reativo para forçar recalculo periódico (Happy Hour depende de hora)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), TIME_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const dpConfig = settings?.dynamicPricingConfig;
  const eventDpOverride = settings?.eventMode?.enabled && settings?.eventMode?.activateDynamicPricing;
  const isDpActive = !!(dpConfig?.rules?.length && (dpConfig.enabled || eventDpOverride));

  return useMemo((): DynamicPriceInfo => {
    const basePrice = sizePrice ?? 0;
    if (!sizePrice || !sizeMl || !isDpActive || !dpConfig) {
      return {
        effectivePrice: basePrice,
        basePrice,
        isModified: false,
        deltaPercent: 0,
        reason: '',
        result: null,
      };
    }

    const basePricePerMl = sizePrice / sizeMl;
    const effectiveConfig = dpConfig.enabled ? dpConfig : { ...dpConfig, enabled: true };

    const result = evaluateDynamicPrice(basePricePerMl, effectiveConfig, {
      timestamp: new Date(),
      kegLevelPercent,
    });

    if (result.deltaPercent === 0) {
      return {
        effectivePrice: basePrice,
        basePrice,
        isModified: false,
        deltaPercent: 0,
        reason: '',
        result,
      };
    }

    const roundingPrecision = dpConfig?.roundingPrecision ?? 2;
    const effectivePrice = Number(
      (result.effectivePricePerMl * sizeMl).toFixed(roundingPrecision)
    );

    return {
      effectivePrice,
      basePrice,
      isModified: true,
      deltaPercent: result.deltaPercent,
      reason: result.reason,
      result,
    };
     
  }, [sizePrice, sizeMl, isDpActive, dpConfig, kegLevelPercent, tick]);
}
