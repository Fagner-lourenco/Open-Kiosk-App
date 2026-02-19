/**
 * ============================================================================
 * useTvDynamicPricing — Hook real-time para preço dinâmico no TV Dashboard
 * ============================================================================
 *
 * Escuta o campo `dynamicPricingConfig` no doc da loja via onSnapshot.
 * Retorna a config e executa o engine para todos os produtos/taps.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tvConfigPath } from '@/lib/pathResolver';
import type { DynamicPricingConfig } from '@shared/types/dynamicPricing';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '@shared/types/dynamicPricing';

function splitPath(path: string) {
  return path.split('/');
}

function docFromPath(path: string) {
  const parts = splitPath(path);
  return doc(db, parts[0], ...parts.slice(1));
}

export interface UseTvDynamicPricingReturn {
  config: DynamicPricingConfig;
  isEnabled: boolean;
  isLoading: boolean;
}

export function useTvDynamicPricing(
  franchiseId: string | null | undefined,
  storeId: string | null | undefined,
): UseTvDynamicPricingReturn {
  const [config, setConfig] = useState<DynamicPricingConfig>({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
  const [isLoading, setIsLoading] = useState(true);
  const unsubRef = useRef<Unsubscribe | null>(null);

  const cleanup = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
  }, []);

  useEffect(() => {
    if (!franchiseId || !storeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // 🔧 FIX AUD-04: Ler de tvConfig/current (acessível por anonymous auth)
    // ao invés do doc da loja (que requer membership)
    const tvRef = docFromPath(tvConfigPath(franchiseId, storeId));
    unsubRef.current = onSnapshot(
      tvRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            ...DEFAULT_DYNAMIC_PRICING_CONFIG,
            ...(data.dynamicPricingConfig || {}),
          });
        } else {
          setConfig({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('[useTvDynamicPricing] error:', err);
        setIsLoading(false);
      },
    );

    return cleanup;
  }, [franchiseId, storeId, cleanup]);

  return {
    config,
    isEnabled: config.enabled && config.rules.length > 0,
    isLoading,
  };
}
