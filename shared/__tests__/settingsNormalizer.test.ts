/**
 * Tests for shared/utils/settingsNormalizer.ts
 * Pure functions — no mocking needed
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeLanguage,
  normalizeStoreSettings,
  toDualWritePayload,
} from '../utils/settingsNormalizer';

describe('shared/utils/settingsNormalizer', () => {
  describe('normalizeLanguage', () => {
    it('normaliza en-US para en', () => {
      expect(normalizeLanguage('en-US')).toBe('en');
    });
    it('mantém en', () => {
      expect(normalizeLanguage('en')).toBe('en');
    });
    it('mantém pt-BR', () => {
      expect(normalizeLanguage('pt-BR')).toBe('pt-BR');
    });
    it('retorna undefined para valores desconhecidos', () => {
      expect(normalizeLanguage('es')).toBeUndefined();
      expect(normalizeLanguage('')).toBeUndefined();
      expect(normalizeLanguage(undefined)).toBeUndefined();
    });
  });

  describe('normalizeStoreSettings', () => {
    it('lê campos canônicos diretamente', () => {
      const result = normalizeStoreSettings({
        kioskEnabled: true,
        attractTimeoutSeconds: 120,
      });
      expect(result.kioskEnabled).toBe(true);
      expect(result.attractTimeoutSeconds).toBe(120);
    });

    it('normaliza language', () => {
      const result = normalizeStoreSettings({ language: 'en-US' });
      expect(result.language).toBe('en');
    });

    it('preserva attractScreenEnabled', () => {
      const result = normalizeStoreSettings({ attractScreenEnabled: true });
      expect(result.attractScreenEnabled).toBe(true);
    });

    it('preserva attractVideoConfig', () => {
      const cfg = { isEnabled: true, videoUrl: 'https://cdn.example.com/v.mp4' };
      const result = normalizeStoreSettings({ attractVideoConfig: cfg as any });
      expect(result.attractVideoConfig).toEqual(cfg);
    });

    it('retorna objeto vazio para input sem campos relevantes', () => {
      const result = normalizeStoreSettings({ name: 'test' });
      expect(result).toEqual({});
    });
  });

  describe('toDualWritePayload', () => {
    it('escreve apenas campos canônicos', () => {
      const payload = toDualWritePayload({
        kioskEnabled: true,
        attractTimeoutSeconds: 90,
      });
      expect(payload.kioskEnabled).toBe(true);
      expect(payload.attractTimeoutSeconds).toBe(90);
      // Legacy fields no longer written
      expect(payload.kioskMode).toBeUndefined();
      expect(payload.idleTimeout).toBeUndefined();
    });

    it('preserva language e attractScreenEnabled', () => {
      const payload = toDualWritePayload({
        language: 'pt-BR',
        attractScreenEnabled: false,
      });
      expect(payload.language).toBe('pt-BR');
      expect(payload.attractScreenEnabled).toBe(false);
    });
  });
});
