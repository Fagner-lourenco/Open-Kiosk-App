/**
 * ============================================================================
 * useTvDashboard — Hook real-time para TvConfig + EventStats
 * ============================================================================
 *
 * Escuta tvConfig/current e eventStats/current via onSnapshot.
 * Usado na página TV Display e na página de config do Admin.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tvConfigPath, eventStatsPath } from '@/lib/pathResolver';
import type { TvConfig, EventStats } from '@/types/tvDashboard';
import { DEFAULT_TV_CONFIG, DEFAULT_EVENT_STATS } from '@/types/tvDashboard';
import type { DynamicPricingConfig } from '@shared/types/dynamicPricing';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '@shared/types/dynamicPricing';

export interface UseTvDashboardReturn {
  tvConfig: TvConfig;
  eventStats: EventStats;
  /** ⚡ COST-OPT: Extraído do mesmo snapshot de tvConfig/current (evita listener duplicado) */
  dynamicPricingConfig: DynamicPricingConfig;
  isDynamicPricingEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

function splitPath(path: string) {
  return path.split('/');
}

function docFromPath(path: string) {
  const parts = splitPath(path);
  return doc(db, parts[0], ...parts.slice(1));
}

export function useTvDashboard(
  franchiseId: string | null | undefined,
  storeId: string | null | undefined
): UseTvDashboardReturn {
  const [tvConfig, setTvConfig] = useState<TvConfig>({
    ...DEFAULT_TV_CONFIG,
    updatedAt: undefined,
  });
  const [dynamicPricingConfig, setDynamicPricingConfig] = useState<DynamicPricingConfig>({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
  const [eventStats, setEventStats] = useState<EventStats>({
    ...DEFAULT_EVENT_STATS,
    updatedAt: undefined,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unsubTvRef = useRef<Unsubscribe | null>(null);
  const unsubEsRef = useRef<Unsubscribe | null>(null);

  const cleanup = useCallback(() => {
    unsubTvRef.current?.();
    unsubEsRef.current?.();
    unsubTvRef.current = null;
    unsubEsRef.current = null;
  }, []);

  useEffect(() => {
    if (!franchiseId || !storeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    let loadedCount = 0;
    const checkReady = () => {
      loadedCount++;
      if (loadedCount >= 2) setIsLoading(false);
    };

    // tvConfig listener
    const tvRef = docFromPath(tvConfigPath(franchiseId, storeId));
    unsubTvRef.current = onSnapshot(
      tvRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setTvConfig({ ...DEFAULT_TV_CONFIG, ...data } as TvConfig);
          // ⚡ COST-OPT: Extrai dynamicPricingConfig do mesmo snapshot
          setDynamicPricingConfig({
            ...DEFAULT_DYNAMIC_PRICING_CONFIG,
            ...(data.dynamicPricingConfig || {}),
          });
        } else {
          setTvConfig({ ...DEFAULT_TV_CONFIG, updatedAt: undefined });
          setDynamicPricingConfig({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
        }
        checkReady();
      },
      (err) => {
        console.error('[useTvDashboard] tvConfig error:', err);
        setError('Erro ao carregar configuração do telão');
        checkReady();
      }
    );

    // eventStats listener
    const esRef = docFromPath(eventStatsPath(franchiseId, storeId));
    unsubEsRef.current = onSnapshot(
      esRef,
      (snap) => {
        if (snap.exists()) {
          setEventStats({ ...DEFAULT_EVENT_STATS, ...snap.data() } as EventStats);
        } else {
          setEventStats({ ...DEFAULT_EVENT_STATS, updatedAt: undefined });
        }
        checkReady();
      },
      (err) => {
        console.error('[useTvDashboard] eventStats error:', err);
        setError('Erro ao carregar estatísticas do evento');
        checkReady();
      }
    );

    return cleanup;
  }, [franchiseId, storeId, cleanup]);

  // DP está ativo se habilitado na config OU se o event mode ativou DP
  const eventDpOverride = eventStats.eventMode?.enabled && eventStats.eventMode?.activateDynamicPricing;
  const isDynamicPricingEnabled = (dynamicPricingConfig.enabled || !!eventDpOverride) && dynamicPricingConfig.rules.length > 0;

  return { tvConfig, eventStats, dynamicPricingConfig, isDynamicPricingEnabled, isLoading, error };
}
