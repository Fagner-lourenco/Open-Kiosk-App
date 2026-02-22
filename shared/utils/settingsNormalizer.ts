/**
 * ============================================================================
 * Settings Normalizer
 * ============================================================================
 *
 * Pure functions to reconcile legacy Firestore field names to canonical format.
 *
 * Problem: Admin Web historically wrote `kioskMode` and `idleTimeout`,
 * while Kiosk wrote `kioskEnabled` and `attractTimeoutSeconds`.
 * Language values also diverge (`en-US` vs `en`).
 *
 * These normalizers produce canonical output from any combination of
 * legacy + new fields, enabling a gradual migration without breaking reads.
 *
 * @see Plan: hashed-leaping-liskov.md (Phase 1)
 */

import type { AttractVideoConfig } from '../types/store';

// ============================================================================
// Language normalization
// ============================================================================

/**
 * Canonical language type used throughout the app.
 */
export type CanonicalLanguage = 'en' | 'pt-BR';

/**
 * Normalizes language codes from various formats to canonical form.
 *
 * Admin Web historically used 'en-US' / 'es' / 'pt-BR'.
 * Kiosk uses 'en' / 'pt-BR'.
 * Canonical: 'en' | 'pt-BR'.
 *
 * @returns Canonical language or undefined if input is unrecognized/missing
 */
export function normalizeLanguage(lang?: string): CanonicalLanguage | undefined {
  if (!lang) return undefined;
  if (lang === 'en-US' || lang === 'en') return 'en';
  if (lang === 'pt-BR') return 'pt-BR';
  return undefined;
}

// ============================================================================
// Store-level settings normalization
// ============================================================================

/**
 * Raw store document data that may contain legacy or canonical field names.
 * This represents what we might read from Firestore before normalization.
 */
export interface RawStoreData {
  // Canonical fields
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractTimeoutSeconds?: number;
  language?: string;
  attractVideoConfig?: AttractVideoConfig;

  // Allow additional fields to pass through
  [key: string]: unknown;
}

/**
 * Normalized store-level settings with canonical field names only.
 */
export interface NormalizedStoreSettings {
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractTimeoutSeconds?: number;
  language?: CanonicalLanguage;
  attractVideoConfig?: AttractVideoConfig;
}

/**
 * Normalizes store-level settings from a raw Firestore document.
 *
 * All fields are now canonical (legacy fields removed after tablet reset).
 *
 * @param data - Raw store document data
 * @returns Normalized settings with canonical field names only
 */
export function normalizeStoreSettings(data: RawStoreData): NormalizedStoreSettings {
  const result: NormalizedStoreSettings = {};

  // kioskEnabled: direct read
  if (data.kioskEnabled !== undefined) {
    result.kioskEnabled = data.kioskEnabled;
  }

  // attractTimeoutSeconds: direct read
  if (data.attractTimeoutSeconds !== undefined) {
    result.attractTimeoutSeconds = data.attractTimeoutSeconds;
  }

  // attractScreenEnabled: no legacy alias, pass-through
  if (data.attractScreenEnabled !== undefined) {
    result.attractScreenEnabled = data.attractScreenEnabled;
  }

  // language: normalize from various formats
  const normalizedLang = normalizeLanguage(data.language);
  if (normalizedLang !== undefined) {
    result.language = normalizedLang;
  }

  // attractVideoConfig: pass-through (new canonical field)
  if (data.attractVideoConfig !== undefined) {
    result.attractVideoConfig = data.attractVideoConfig;
  }

  return result;
}

// ============================================================================
// Dual-write helpers (for Admin Web transition period)
// ============================================================================

/**
 * Produces a write payload with canonical field names.
 *
 * Legacy dual-write removed — all tablets reset from scratch.
 *
 * @param settings - Settings in canonical format
 * @returns Object with canonical field names
 */
export function toDualWritePayload(settings: NormalizedStoreSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (settings.kioskEnabled !== undefined) {
    payload.kioskEnabled = settings.kioskEnabled;
  }

  if (settings.attractTimeoutSeconds !== undefined) {
    payload.attractTimeoutSeconds = settings.attractTimeoutSeconds;
  }

  if (settings.attractScreenEnabled !== undefined) {
    payload.attractScreenEnabled = settings.attractScreenEnabled;
  }

  if (settings.language !== undefined) {
    payload.language = settings.language;
  }

  if (settings.attractVideoConfig !== undefined) {
    payload.attractVideoConfig = settings.attractVideoConfig;
  }

  return payload;
}
