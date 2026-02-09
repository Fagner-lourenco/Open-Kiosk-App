import { describe, it, expect } from 'vitest';
import {
  normalizeLanguage,
  normalizeStoreSettings,
  toDualWritePayload,
} from '../settingsNormalizer';
import type { AttractVideoConfig } from '../../types/store';

// ============================================================================
// normalizeLanguage
// ============================================================================

describe('normalizeLanguage', () => {
  it('returns undefined for undefined input', () => {
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeLanguage('')).toBeUndefined();
  });

  it('normalizes "en-US" to "en"', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
  });

  it('passes through "en" as-is', () => {
    expect(normalizeLanguage('en')).toBe('en');
  });

  it('passes through "pt-BR" as-is', () => {
    expect(normalizeLanguage('pt-BR')).toBe('pt-BR');
  });

  it('returns undefined for unsupported language "es"', () => {
    expect(normalizeLanguage('es')).toBeUndefined();
  });

  it('returns undefined for unsupported language "fr"', () => {
    expect(normalizeLanguage('fr')).toBeUndefined();
  });
});

// ============================================================================
// normalizeStoreSettings
// ============================================================================

describe('normalizeStoreSettings', () => {
  it('returns empty object for empty input', () => {
    expect(normalizeStoreSettings({})).toEqual({});
  });

  // --- kioskEnabled / kioskMode ---

  it('uses kioskEnabled when only canonical field is present', () => {
    const result = normalizeStoreSettings({ kioskEnabled: true });
    expect(result.kioskEnabled).toBe(true);
  });

  it('uses kioskMode when only legacy field is present', () => {
    const result = normalizeStoreSettings({ kioskMode: false });
    expect(result.kioskEnabled).toBe(false);
  });

  it('prefers kioskEnabled over kioskMode when both are present', () => {
    const result = normalizeStoreSettings({ kioskEnabled: true, kioskMode: false });
    expect(result.kioskEnabled).toBe(true);
  });

  it('falls back to kioskMode when kioskEnabled is undefined', () => {
    const result = normalizeStoreSettings({ kioskEnabled: undefined, kioskMode: true });
    expect(result.kioskEnabled).toBe(true);
  });

  // --- attractTimeoutSeconds / idleTimeout ---

  it('uses attractTimeoutSeconds when only canonical field is present', () => {
    const result = normalizeStoreSettings({ attractTimeoutSeconds: 30 });
    expect(result.attractTimeoutSeconds).toBe(30);
  });

  it('uses idleTimeout when only legacy field is present', () => {
    const result = normalizeStoreSettings({ idleTimeout: 60 });
    expect(result.attractTimeoutSeconds).toBe(60);
  });

  it('prefers attractTimeoutSeconds over idleTimeout when both are present', () => {
    const result = normalizeStoreSettings({
      attractTimeoutSeconds: 30,
      idleTimeout: 60,
    });
    expect(result.attractTimeoutSeconds).toBe(30);
  });

  // --- attractScreenEnabled ---

  it('passes through attractScreenEnabled', () => {
    const result = normalizeStoreSettings({ attractScreenEnabled: false });
    expect(result.attractScreenEnabled).toBe(false);
  });

  it('omits attractScreenEnabled when undefined', () => {
    const result = normalizeStoreSettings({});
    expect(result).not.toHaveProperty('attractScreenEnabled');
  });

  // --- language ---

  it('normalizes language "en-US" to "en"', () => {
    const result = normalizeStoreSettings({ language: 'en-US' });
    expect(result.language).toBe('en');
  });

  it('normalizes language "en" to "en"', () => {
    const result = normalizeStoreSettings({ language: 'en' });
    expect(result.language).toBe('en');
  });

  it('passes through language "pt-BR"', () => {
    const result = normalizeStoreSettings({ language: 'pt-BR' });
    expect(result.language).toBe('pt-BR');
  });

  it('omits language for unsupported values', () => {
    const result = normalizeStoreSettings({ language: 'es' });
    expect(result).not.toHaveProperty('language');
  });

  // --- attractVideoConfig ---

  it('passes through attractVideoConfig when present', () => {
    const videoConfig: AttractVideoConfig = {
      isEnabled: true,
      videoUrl: 'https://cdn.example.com/video.mp4',
      videoOpacity: 0.5,
      videoCoverMode: 'cover',
    };
    const result = normalizeStoreSettings({ attractVideoConfig: videoConfig });
    expect(result.attractVideoConfig).toEqual(videoConfig);
  });

  it('omits attractVideoConfig when undefined', () => {
    const result = normalizeStoreSettings({});
    expect(result).not.toHaveProperty('attractVideoConfig');
  });

  // --- Full reconciliation ---

  it('normalizes a full legacy document correctly', () => {
    const result = normalizeStoreSettings({
      kioskMode: true,
      idleTimeout: 60,
      attractScreenEnabled: true,
      language: 'en-US',
    });
    expect(result).toEqual({
      kioskEnabled: true,
      attractTimeoutSeconds: 60,
      attractScreenEnabled: true,
      language: 'en',
    });
  });

  it('normalizes a full canonical document correctly', () => {
    const videoConfig: AttractVideoConfig = {
      isEnabled: true,
      videoUrl: 'https://cdn.example.com/video.mp4',
    };
    const result = normalizeStoreSettings({
      kioskEnabled: false,
      attractTimeoutSeconds: 45,
      attractScreenEnabled: true,
      language: 'pt-BR',
      attractVideoConfig: videoConfig,
    });
    expect(result).toEqual({
      kioskEnabled: false,
      attractTimeoutSeconds: 45,
      attractScreenEnabled: true,
      language: 'pt-BR',
      attractVideoConfig: videoConfig,
    });
  });

  it('normalizes a mixed legacy+canonical document correctly', () => {
    const result = normalizeStoreSettings({
      kioskEnabled: true,
      kioskMode: false,           // legacy (should be ignored)
      attractTimeoutSeconds: 30,
      idleTimeout: 60,            // legacy (should be ignored)
      attractScreenEnabled: false,
      language: 'en-US',          // legacy format (should normalize to 'en')
    });
    expect(result).toEqual({
      kioskEnabled: true,         // canonical wins
      attractTimeoutSeconds: 30,  // canonical wins
      attractScreenEnabled: false,
      language: 'en',             // normalized
    });
  });

  it('does not include extra fields in output', () => {
    const result = normalizeStoreSettings({
      kioskEnabled: true,
      name: 'My Store',           // unrelated field
      taxPercentage: 18,          // unrelated field
    } as Record<string, unknown>);
    expect(Object.keys(result)).toEqual(['kioskEnabled']);
  });
});

// ============================================================================
// toDualWritePayload
// ============================================================================

describe('toDualWritePayload', () => {
  it('returns empty object for empty input', () => {
    expect(toDualWritePayload({})).toEqual({});
  });

  it('writes both kioskEnabled and kioskMode', () => {
    const result = toDualWritePayload({ kioskEnabled: true });
    expect(result.kioskEnabled).toBe(true);
    expect(result.kioskMode).toBe(true);
  });

  it('writes both attractTimeoutSeconds and idleTimeout', () => {
    const result = toDualWritePayload({ attractTimeoutSeconds: 45 });
    expect(result.attractTimeoutSeconds).toBe(45);
    expect(result.idleTimeout).toBe(45);
  });

  it('passes through attractScreenEnabled without duplication', () => {
    const result = toDualWritePayload({ attractScreenEnabled: false });
    expect(result.attractScreenEnabled).toBe(false);
    expect(Object.keys(result)).toEqual(['attractScreenEnabled']);
  });

  it('passes through language without duplication', () => {
    const result = toDualWritePayload({ language: 'en' });
    expect(result.language).toBe('en');
    expect(Object.keys(result)).toEqual(['language']);
  });

  it('passes through attractVideoConfig', () => {
    const videoConfig: AttractVideoConfig = {
      isEnabled: true,
      videoUrl: 'https://cdn.example.com/video.mp4',
    };
    const result = toDualWritePayload({ attractVideoConfig: videoConfig });
    expect(result.attractVideoConfig).toEqual(videoConfig);
  });

  it('produces full dual-write payload from all canonical fields', () => {
    const result = toDualWritePayload({
      kioskEnabled: false,
      attractTimeoutSeconds: 60,
      attractScreenEnabled: true,
      language: 'pt-BR',
      attractVideoConfig: { isEnabled: false },
    });
    expect(result).toEqual({
      kioskEnabled: false,
      kioskMode: false,                    // legacy mirror
      attractTimeoutSeconds: 60,
      idleTimeout: 60,                     // legacy mirror
      attractScreenEnabled: true,
      language: 'pt-BR',
      attractVideoConfig: { isEnabled: false },
    });
  });
});
