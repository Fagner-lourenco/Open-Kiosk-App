/**
 * ============================================================================
 * useTvRanking — Hook real-time para ranking pre-agregado (TV)
 * ============================================================================
 *
 * Escuta rankingAgg/{customerId} via onSnapshot.
 * Throttle de 5s para evitar flicker no telão.
 * Ordena por totalMl30min ou totalMl (conforme rankingWindow).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { rankingAggPath } from '@/lib/pathResolver';
import type { RankingAggEntry, RankingWindow } from '@/types/tvDashboard';

export interface UseTvRankingReturn {
  ranking: RankingAggEntry[];
  isLoading: boolean;
  error: string | null;
}

const THROTTLE_MS = 5_000;

function splitPath(path: string) {
  return path.split('/');
}

export function useTvRanking(
  franchiseId: string | null | undefined,
  storeId: string | null | undefined,
  rankingWindow: RankingWindow = '30min',
  maxPositions: number = 10
): UseTvRankingReturn {
  const [ranking, setRanking] = useState<RankingAggEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unsubRef = useRef<Unsubscribe | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<RankingAggEntry[] | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const sortField = useMemo(() => {
    switch (rankingWindow) {
      case '30min':
      case '1h':
        return 'totalMl30min';
      default:
        return 'totalMl';
    }
  }, [rankingWindow]);

  const applyUpdate = useCallback((data: RankingAggEntry[]) => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= THROTTLE_MS) {
      // Aplicar imediatamente
      setRanking(data);
      lastUpdateRef.current = now;
      pendingDataRef.current = null;
    } else {
      // Agendar para depois
      pendingDataRef.current = data;
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          if (pendingDataRef.current) {
            setRanking(pendingDataRef.current);
            lastUpdateRef.current = Date.now();
            pendingDataRef.current = null;
          }
          throttleTimerRef.current = null;
        }, THROTTLE_MS - elapsed);
      }
    }
  }, []);

  useEffect(() => {
    if (!franchiseId || !storeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const path = rankingAggPath(franchiseId, storeId);
    const parts = splitPath(path);
    const colRef = collection(db, parts[0], ...parts.slice(1));

    const q = query(
      colRef,
      orderBy(sortField, 'desc'),
      limit(maxPositions)
    );

    unsubRef.current = onSnapshot(
      q,
      (snapshot) => {
        const entries = snapshot.docs.map((d) => d.data() as RankingAggEntry);
        applyUpdate(entries);
        setIsLoading(false);
      },
      (err) => {
        console.error('[useTvRanking] snapshot error:', err);
        setError('Erro ao carregar ranking');
        setIsLoading(false);
      }
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, [franchiseId, storeId, sortField, maxPositions, applyUpdate]);

  return { ranking, isLoading, error };
}
