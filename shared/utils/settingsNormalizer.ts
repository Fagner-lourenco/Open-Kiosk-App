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

  // Legacy fields (Admin Web wrote these)
  kioskMode?: boolean;
  idleTimeout?: number;

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
 * Reconciliation rules (canonical takes precedence over legacy):
 * - `kioskEnabled` ?? `kioskMode`
 * - `attractTimeoutSeconds` ?? `idleTimeout`
 * - `language` → normalizeLanguage()
 * - `attractScreenEnabled` → pass-through
 * - `attractVideoConfig` → pass-through
 *
 * @param data - Raw store document data (may have legacy field names)
 * @returns Normalized settings with canonical field names only
 */
export function normalizeStoreSettings(data: RawStoreData): NormalizedStoreSettings {
  const result: NormalizedStoreSettings = {};

  // kioskEnabled: canonical takes precedence over legacy kioskMode
  const kioskValue = data.kioskEnabled ?? data.kioskMode;
  if (kioskValue !== undefined) {
    result.kioskEnabled = kioskValue;
  }

  // attractTimeoutSeconds: canonical takes precedence over legacy idleTimeout
  const timeoutValue = data.attractTimeoutSeconds ?? data.idleTimeout;
  if (timeoutValue !== undefined) {
    result.attractTimeoutSeconds = timeoutValue;
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
 * Produces a dual-write payload that writes both canonical and legacy field names.
 *
 * During the transition period (Phase 2), Admin Web should use this to ensure
 * that old Kiosk versions still see the legacy field names while new versions
 * read the canonical ones.
 *
 * @param settings - Settings in canonical format
 * @returns Object with both canonical and legacy field names
 */
export function toDualWritePayload(settings: NormalizedStoreSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (settings.kioskEnabled !== undefined) {
    payload.kioskEnabled = settings.kioskEnabled;
    payload.kioskMode = settings.kioskEnabled; // legacy
  }

  if (settings.attractTimeoutSeconds !== undefined) {
    payload.attractTimeoutSeconds = settings.attractTimeoutSeconds;
    payload.idleTimeout = settings.attractTimeoutSeconds; // legacy
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
