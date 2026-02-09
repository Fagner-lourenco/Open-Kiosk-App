/**
 * ============================================================================
 * useTapsRealtime — Shared Real-Time Tap Operational State
 * ============================================================================
 *
 * Provides real-time tap operational state via onSnapshot.
 * Both StoreKegsTab and StoreOperationsTab MUST use this hook
 * to ensure they always show the same tap status.
 *
 * Path: franchises/{fId}/stores/{sId}/taps/{tapId}
 * Fields: tapId, status, currentKegId, todayMlDispensed, todaySessions, todayWastageMl
 *
 * @author Open Kiosk Project
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TapOperationalState } from '@shared/types/operations';

// ============================================================================
// NORMALIZER
// ============================================================================

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function normalizeTap(id: string, data: Record<string, unknown>): TapOperationalState {
  return {
    tapId: id,
    status: (data.status as TapOperationalState['status']) || 'idle',
    currentKegId: (data.currentKegId as string) ?? null,
    todayMlDispensed: (data.todayMlDispensed as number) || 0,
    todaySessions: (data.todaySessions as number) || 0,
    todayWastageMl: (data.todayWastageMl as number) || 0,
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || 'system',
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string) || 'system',
  };
}

// ============================================================================
// HOOK
// ============================================================================

interface UseTapsRealtimeResult {
  taps: TapOperationalState[];
  loading: boolean;
  error: string | null;
}

export function useTapsRealtime(
  franchiseId: string,
  storeId: string
): UseTapsRealtimeResult {
  const [taps, setTaps] = useState<TapOperationalState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Cleanup previous listener
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    if (!franchiseId || !storeId) {
      setTaps([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const tapsRef = collection(
      db,
      'franchises',
      franchiseId,
      'stores',
      storeId,
      'taps'
    );
    const q = query(tapsRef, orderBy('tapId'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const tapData = snapshot.docs.map((d) =>
          normalizeTap(d.id, d.data() as Record<string, unknown>)
        );
        setTaps(tapData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useTapsRealtime] onSnapshot error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [franchiseId, storeId]);

  return { taps, loading, error };
}
