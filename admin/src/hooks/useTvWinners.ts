/**
 * ============================================================================
 * useTvWinners — Hook real-time para ganhadores recentes (TV)
 * ============================================================================
 *
 * Escuta prizes/ onde status in ['won','redeemed'] via onSnapshot.
 * Ordenado por wonAt desc, limit 8.
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { prizesPath } from '@/lib/pathResolver';
import type { Prize } from '@/types/tvDashboard';

export interface UseTvWinnersReturn {
  winners: Prize[];
  isLoading: boolean;
  error: string | null;
}

function splitPath(path: string) {
  return path.split('/');
}

export function useTvWinners(
  franchiseId: string | null | undefined,
  storeId: string | null | undefined,
  maxResults: number = 8
): UseTvWinnersReturn {
  const [winners, setWinners] = useState<Prize[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    if (!franchiseId || !storeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const path = prizesPath(franchiseId, storeId);
    const parts = splitPath(path);
    const colRef = collection(db, parts[0], ...parts.slice(1));

    const q = query(
      colRef,
      where('status', 'in', ['won', 'redeemed']),
      orderBy('wonAt', 'desc'),
      limit(maxResults)
    );

    unsubRef.current = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as Prize[];
        setWinners(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error('[useTvWinners] snapshot error:', err);
        setError('Erro ao carregar ganhadores');
        setIsLoading(false);
      }
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [franchiseId, storeId, maxResults]);

  return { winners, isLoading, error };
}
