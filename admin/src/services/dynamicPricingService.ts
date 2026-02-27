/**
 * ============================================================================
 * Dynamic Pricing Service — CRUD para configuração de preço dinâmico
 * ============================================================================
 *
 * Lê e grava o campo `dynamicPricingConfig` no doc da loja (Store).
 * Path: franchises/{franchiseId}/stores/{storeId}
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { storePath, tvConfigPath } from '@/lib/pathResolver';
import type { DynamicPricingConfig } from '@shared/types/dynamicPricing';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '@shared/types/dynamicPricing';

// ============================================================================
// HELPERS
// ============================================================================

function splitPath(path: string) {
  return path.split('/');
}

function docFromPath(path: string) {
  const parts = splitPath(path);
  return doc(db, parts[0], ...parts.slice(1));
}

// ============================================================================
// READ / WRITE
// ============================================================================

/**
 * Lê a config de preço dinâmico da loja
 */
export async function getDynamicPricingConfig(
  franchiseId: string,
  storeId: string
): Promise<DynamicPricingConfig> {
  const ref = docFromPath(storePath(franchiseId, storeId));
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { ...DEFAULT_DYNAMIC_PRICING_CONFIG };
  }

  const data = snap.data();
  return {
    ...DEFAULT_DYNAMIC_PRICING_CONFIG,
    ...(data.dynamicPricingConfig || {}),
  };
}

/**
 * Atualiza a config de preço dinâmico da loja (merge parcial)
 */
export async function updateDynamicPricingConfig(
  franchiseId: string,
  storeId: string,
  config: DynamicPricingConfig
): Promise<void> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');

  // Validação de limites
  if (config.maxVariationPercent < 1 || config.maxVariationPercent > 50) {
    throw new Error('maxVariationPercent deve estar entre 1 e 50');
  }

  const ref = docFromPath(storePath(franchiseId, storeId));
  const tvRef = docFromPath(tvConfigPath(franchiseId, storeId));

  // Escrita atômica: store + tvConfig no mesmo batch
  const batch = writeBatch(db);

  batch.update(ref, {
    dynamicPricingConfig: config,
    updatedAt: serverTimestamp(),
  });

  // 🔧 FIX AUD-04: Espelhar em tvConfig/current para que o TV Dashboard
  // (anonymous auth) consiga ler sem precisar de membership na loja.
  batch.set(tvRef, {
    dynamicPricingConfig: config,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
}
