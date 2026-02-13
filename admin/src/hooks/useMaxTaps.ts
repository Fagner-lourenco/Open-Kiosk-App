/**
 * ============================================================================
 * useMaxTaps — Shared hook for resolving max taps count
 * ============================================================================
 *
 * Retorna a quantidade máxima de torneiras configurada para uma loja.
 * Usado por StoreWastageTab e StoreMaintenanceTab para gerar tap selectors.
 *
 * Resolução:
 * 1. storeDoc.maxTaps (explícito)
 * 2. storeDoc.settings.maxTaps
 * 3. storeDoc.taps[].length (configuração canônica)
 * 4. Fallback: 4
 */

import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const maxTapsKeys = {
  byStore: (franchiseId: string, storeId: string) =>
    ['store-max-taps', franchiseId, storeId] as const,
};

export function useMaxTaps(franchiseId: string, storeId: string) {
  return useQuery({
    queryKey: maxTapsKeys.byStore(franchiseId, storeId),
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
}
