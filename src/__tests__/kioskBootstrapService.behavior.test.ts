import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferenceStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferenceStore.get(key) ?? null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferenceStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferenceStore.delete(key);
    }),
  },
}));

import {
  clearKioskBootstrap,
  getStoredKioskBootstrapSnapshot,
  hydrateKioskBootstrapState,
  kioskBootstrapStorageKeys,
  persistKioskBootstrapFromSettings,
} from '@/services/kioskBootstrapService';

describe('kioskBootstrapService', () => {
  beforeEach(async () => {
    preferenceStore.clear();
    localStorage.clear();
    await clearKioskBootstrap();
  });

  it('persiste bootstrap e espelha selecao/storeSettings no localStorage', async () => {
    await persistKioskBootstrapFromSettings({
      storeId: 'store-123',
      franchiseId: 'franchise-abc',
      kioskEnabled: true,
      attractScreenEnabled: true,
      attractTimeoutSeconds: 47,
      attractVideoConfig: {
        isEnabled: true,
        videoUrl: 'https://cdn.example.com/attract.mp4',
      },
    });

    expect(localStorage.getItem(kioskBootstrapStorageKeys.selectedStore)).toBe('store-123');
    expect(localStorage.getItem(kioskBootstrapStorageKeys.selectedFranchise)).toBe('franchise-abc');

    const mirroredSettings = JSON.parse(
      localStorage.getItem(kioskBootstrapStorageKeys.storeSettings) || '{}',
    );
    expect(mirroredSettings).toMatchObject({
      storeId: 'store-123',
      franchiseId: 'franchise-abc',
      kioskEnabled: true,
      attractScreenEnabled: true,
      attractTimeoutSeconds: 47,
    });
    expect(mirroredSettings.attractVideoConfig?.videoUrl).toBe('https://cdn.example.com/attract.mp4');

    const snapshot = getStoredKioskBootstrapSnapshot();
    expect(snapshot).toMatchObject({
      storeId: 'store-123',
      franchiseId: 'franchise-abc',
      kioskEnabled: true,
      attractScreenEnabled: true,
      attractTimeoutSeconds: 47,
    });

    expect(
      JSON.parse(preferenceStore.get(kioskBootstrapStorageKeys.bootstrap) || '{}'),
    ).toMatchObject({
      storeId: 'store-123',
      franchiseId: 'franchise-abc',
    });
  });

  it('rehidrata o bootstrap do Preferences quando o localStorage esta vazio', async () => {
    preferenceStore.set(
      kioskBootstrapStorageKeys.bootstrap,
      JSON.stringify({
        storeId: 'store-pref',
        franchiseId: 'franchise-pref',
        kioskEnabled: true,
        attractScreenEnabled: false,
        attractTimeoutSeconds: 90,
        lastKnownAttractVideoConfig: {
          isEnabled: true,
          videoUrl: 'https://cdn.example.com/pref.mp4',
        },
        updatedAt: '2026-03-17T09:40:00.000Z',
      }),
    );

    const hydrated = await hydrateKioskBootstrapState();

    expect(hydrated).toMatchObject({
      storeId: 'store-pref',
      franchiseId: 'franchise-pref',
      attractScreenEnabled: false,
      attractTimeoutSeconds: 90,
    });

    const mirroredSettings = JSON.parse(
      localStorage.getItem(kioskBootstrapStorageKeys.storeSettings) || '{}',
    );
    expect(mirroredSettings).toMatchObject({
      storeId: 'store-pref',
      franchiseId: 'franchise-pref',
      kioskEnabled: true,
      attractScreenEnabled: false,
      attractTimeoutSeconds: 90,
    });
    expect(mirroredSettings.attractVideoConfig?.videoUrl).toBe('https://cdn.example.com/pref.mp4');
  });
});
