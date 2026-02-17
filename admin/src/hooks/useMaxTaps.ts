/**
 * ============================================================================
 * useMaxTaps Hook
 * ============================================================================
 *
 * Resolves the maximum number of taps for a given store.
 * Shared between StoreWastageTab, StoreMaintenanceTab, and any other
 * component that needs to enumerate tap IDs.
 *
 * Resolution priority:
 *   1. store.maxTaps (explicit field)
 *   2. store.settings.maxTaps
 *   3. store.taps[].length (configured tap count)
 *   4. Fallback: 4
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useMaxTaps(franchiseId: string, storeId: string) {
  const { data: maxTaps = 4 } = useQuery({
    queryKey: ['store-max-taps', franchiseId, storeId],
    queryFn: async () => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
      const storeSnapshot = await getDoc(storeRef);

      if (!storeSnapshot.exists()) return 4;

      const data = storeSnapshot.data() as Record<string, unknown>;
      const settings = (data.settings as Record<string, unknown> | undefined) || {};
      const explicitMaxTaps = Number(data.maxTaps);
      const settingsMaxTaps = Number(settings.maxTaps);
      const configuredTapCount = Array.isArray(data.taps) ? data.taps.length : 0;

      const candidates = [explicitMaxTaps, settingsMaxTaps, configuredTapCount, 4];
      const resolvedTapCount = candidates.find((value) => Number.isFinite(value) && value > 0) ?? 4;

      return Math.min(32, Math.max(1, Math.trunc(resolvedTapCount)));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const tapIds = useMemo(
    () => Array.from({ length: maxTaps }, (_, index) => String(index)),
    [maxTaps],
  );

  return { maxTaps, tapIds };
}
