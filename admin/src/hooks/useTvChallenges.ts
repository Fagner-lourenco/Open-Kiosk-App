/**
 * ============================================================================
 * useTvChallenges — Hook real-time para desafios ativos (TV)
 * ============================================================================
 *
 * Escuta challenges/ onde status=='active' via onSnapshot.
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { challengesPath } from '@/lib/pathResolver';
import type { Challenge } from '@/types/tvDashboard';

export interface UseTvChallengesReturn {
  challenges: Challenge[];
  isLoading: boolean;
  error: string | null;
}

function splitPath(path: string) {
  return path.split('/');
}

export function useTvChallenges(
  franchiseId: string | null | undefined,
  storeId: string | null | undefined
): UseTvChallengesReturn {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
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

    const path = challengesPath(franchiseId, storeId);
    const parts = splitPath(path);
    const colRef = collection(db, parts[0], ...parts.slice(1));

    const q = query(
      colRef,
      where('status', '==', 'active'),
      orderBy('startsAt', 'desc')
    );

    unsubRef.current = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => {
          // 🔒 Sanitizar: remover completedCustomers (IDs de clientes) do frontend público
          const { completedCustomers, ...safeData } = d.data() as Record<string, unknown>;
          return { ...safeData, id: d.id };
        }) as Challenge[];
        setChallenges(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error('[useTvChallenges] snapshot error:', err);
        setError('Erro ao carregar desafios');
        setIsLoading(false);
      }
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [franchiseId, storeId]);

  return { challenges, isLoading, error };
}
