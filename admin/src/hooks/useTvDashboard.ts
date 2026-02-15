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

export interface UseTvDashboardReturn {
  tvConfig: TvConfig;
  eventStats: EventStats;
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
          setTvConfig({ ...DEFAULT_TV_CONFIG, ...snap.data() } as TvConfig);
        } else {
          setTvConfig({ ...DEFAULT_TV_CONFIG, updatedAt: undefined });
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

  return { tvConfig, eventStats, isLoading, error };
}
