import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exitKioskMode, enterKioskMode, isInKioskMode } from '@/services/kioskModeService';

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
  registerPlugin: vi.fn(),
}));

describe('kioskModeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exitKioskMode', () => {
    it('retorna true quando não é plataforma nativa', async () => {
      const result = await exitKioskMode();
      expect(result).toBe(true);
    });
  });

  describe('enterKioskMode', () => {
    it('retorna true quando não é plataforma nativa', async () => {
      const result = await enterKioskMode();
      expect(result).toBe(true);
    });
  });

  describe('isInKioskMode', () => {
    it('retorna false quando não é plataforma nativa', async () => {
      const result = await isInKioskMode();
      expect(result).toBe(false);
    });
  });
});
