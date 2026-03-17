import { Preferences } from '@capacitor/preferences';
import type { StoreSettings } from '@/types/store';
import type { AttractVideoConfig } from '../../shared/types/store';

const BOOTSTRAP_STORAGE_KEY = 'open-kiosk:bootstrap';
const STORE_SETTINGS_STORAGE_KEY = 'storeSettings';
const KIOSK_SELECTED_FRANCHISE_KEY = 'open-kiosk:selectedFranchise';
const KIOSK_SELECTED_STORE_KEY = 'open-kiosk:selectedStore';

type MinimalStoreSettings = Pick<
  StoreSettings,
  | 'storeId'
  | 'franchiseId'
  | 'name'
  | 'currency'
  | 'language'
  | 'taxId'
  | 'taxPercentage'
  | 'firebaseConfig'
  | 'kioskEnabled'
  | 'attractScreenEnabled'
  | 'attractTimeoutSeconds'
  | 'attractVideoConfig'
>;

export interface KioskBootstrapPayload {
  storeId: string;
  franchiseId: string;
  kioskEnabled: boolean;
  attractScreenEnabled: boolean;
  attractTimeoutSeconds: number;
  lastKnownAttractVideoConfig?: AttractVideoConfig | null;
  updatedAt: string;
}

const EMPTY_FIREBASE_CONFIG: StoreSettings['firebaseConfig'] = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

const isBrowserRuntime = (): boolean => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const readJson = <T>(value: string | null | undefined): T | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('[KioskBootstrap] Failed to parse JSON payload:', error);
    return null;
  }
};

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeBootstrap = (
  value: Partial<KioskBootstrapPayload> | null | undefined,
): KioskBootstrapPayload | null => {
  if (!value) {
    return null;
  }

  const storeId = toTrimmedString(value.storeId);
  const franchiseId = toTrimmedString(value.franchiseId);

  if (!storeId || !franchiseId) {
    return null;
  }

  return {
    storeId,
    franchiseId,
    kioskEnabled: value.kioskEnabled ?? true,
    attractScreenEnabled: value.attractScreenEnabled ?? true,
    attractTimeoutSeconds:
      typeof value.attractTimeoutSeconds === 'number' && Number.isFinite(value.attractTimeoutSeconds)
        ? Math.min(Math.max(value.attractTimeoutSeconds, 10), 600)
        : 15,
    lastKnownAttractVideoConfig: value.lastKnownAttractVideoConfig ?? null,
    updatedAt:
      typeof value.updatedAt === 'string' && value.updatedAt.trim()
        ? value.updatedAt
        : new Date().toISOString(),
  };
};

const getBootstrapTimestamp = (bootstrap: KioskBootstrapPayload | null): number => {
  if (!bootstrap) {
    return 0;
  }

  const timestamp = Date.parse(bootstrap.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pickFreshestBootstrap = (
  first: KioskBootstrapPayload | null,
  second: KioskBootstrapPayload | null,
): KioskBootstrapPayload | null => {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return getBootstrapTimestamp(second) >= getBootstrapTimestamp(first) ? second : first;
};

const ensureLocalStorageMirror = (bootstrap: KioskBootstrapPayload): MinimalStoreSettings | null => {
  if (!isBrowserRuntime()) {
    return null;
  }

  localStorage.setItem(BOOTSTRAP_STORAGE_KEY, JSON.stringify(bootstrap));
  localStorage.setItem(KIOSK_SELECTED_STORE_KEY, bootstrap.storeId);
  localStorage.setItem(KIOSK_SELECTED_FRANCHISE_KEY, bootstrap.franchiseId);

  const currentSettings = readJson<Partial<StoreSettings>>(localStorage.getItem(STORE_SETTINGS_STORAGE_KEY)) || {};
  const mergedSettings: MinimalStoreSettings = {
    ...currentSettings,
    storeId: bootstrap.storeId,
    franchiseId: bootstrap.franchiseId,
    name:
      typeof currentSettings.name === 'string' && currentSettings.name.trim()
        ? currentSettings.name
        : bootstrap.storeId,
    currency:
      typeof currentSettings.currency === 'string' && currentSettings.currency.trim()
        ? currentSettings.currency
        : 'BRL',
    language: currentSettings.language === 'en' ? 'en' : 'pt-BR',
    taxId: typeof currentSettings.taxId === 'string' ? currentSettings.taxId : '',
    taxPercentage:
      typeof currentSettings.taxPercentage === 'number' && Number.isFinite(currentSettings.taxPercentage)
        ? currentSettings.taxPercentage
        : 0,
    firebaseConfig: {
      ...EMPTY_FIREBASE_CONFIG,
      ...(currentSettings.firebaseConfig || {}),
    },
    kioskEnabled: bootstrap.kioskEnabled,
    attractScreenEnabled: bootstrap.attractScreenEnabled,
    attractTimeoutSeconds: bootstrap.attractTimeoutSeconds,
    attractVideoConfig:
      bootstrap.lastKnownAttractVideoConfig ??
      currentSettings.attractVideoConfig ??
      undefined,
  };

  localStorage.setItem(STORE_SETTINGS_STORAGE_KEY, JSON.stringify(mergedSettings));
  return mergedSettings;
};

export const buildKioskBootstrapFromSettings = (
  settings: Partial<StoreSettings> | null | undefined,
): KioskBootstrapPayload | null => {
  if (!settings) {
    return null;
  }

  return normalizeBootstrap({
    storeId: settings.storeId,
    franchiseId: settings.franchiseId,
    kioskEnabled: settings.kioskEnabled ?? true,
    attractScreenEnabled: settings.attractScreenEnabled ?? true,
    attractTimeoutSeconds: settings.attractTimeoutSeconds ?? 15,
    lastKnownAttractVideoConfig: settings.attractVideoConfig ?? null,
    updatedAt: new Date().toISOString(),
  });
};

export const getStoredKioskBootstrapSnapshot = (): KioskBootstrapPayload | null => {
  if (!isBrowserRuntime()) {
    return null;
  }

  return normalizeBootstrap(readJson<KioskBootstrapPayload>(localStorage.getItem(BOOTSTRAP_STORAGE_KEY)));
};

export const persistKioskBootstrap = async (
  bootstrapInput: Partial<KioskBootstrapPayload> | null | undefined,
): Promise<KioskBootstrapPayload | null> => {
  const bootstrap = normalizeBootstrap(bootstrapInput);
  if (!bootstrap) {
    return null;
  }

  ensureLocalStorageMirror(bootstrap);

  try {
    await Preferences.set({
      key: BOOTSTRAP_STORAGE_KEY,
      value: JSON.stringify(bootstrap),
    });
  } catch (error) {
    console.warn('[KioskBootstrap] Failed to persist bootstrap to Preferences:', error);
  }

  return bootstrap;
};

export const persistKioskBootstrapFromSettings = async (
  settings: Partial<StoreSettings> | null | undefined,
): Promise<KioskBootstrapPayload | null> => persistKioskBootstrap(buildKioskBootstrapFromSettings(settings));

export const hydrateKioskBootstrapState = async (): Promise<KioskBootstrapPayload | null> => {
  const localBootstrap = getStoredKioskBootstrapSnapshot();
  let preferencesBootstrap: KioskBootstrapPayload | null = null;

  try {
    const stored = await Preferences.get({ key: BOOTSTRAP_STORAGE_KEY });
    preferencesBootstrap = normalizeBootstrap(readJson<KioskBootstrapPayload>(stored.value));
  } catch (error) {
    console.warn('[KioskBootstrap] Failed to read bootstrap from Preferences:', error);
  }

  const bootstrap = pickFreshestBootstrap(localBootstrap, preferencesBootstrap);
  if (!bootstrap) {
    return null;
  }

  ensureLocalStorageMirror(bootstrap);

  if (getBootstrapTimestamp(preferencesBootstrap) !== getBootstrapTimestamp(bootstrap)) {
    try {
      await Preferences.set({
        key: BOOTSTRAP_STORAGE_KEY,
        value: JSON.stringify(bootstrap),
      });
    } catch (error) {
      console.warn('[KioskBootstrap] Failed to refresh Preferences mirror:', error);
    }
  }

  return bootstrap;
};

export const clearKioskBootstrap = async (): Promise<void> => {
  if (isBrowserRuntime()) {
    localStorage.removeItem(BOOTSTRAP_STORAGE_KEY);
    localStorage.removeItem(KIOSK_SELECTED_STORE_KEY);
    localStorage.removeItem(KIOSK_SELECTED_FRANCHISE_KEY);
  }

  try {
    await Preferences.remove({ key: BOOTSTRAP_STORAGE_KEY });
  } catch (error) {
    console.warn('[KioskBootstrap] Failed to clear bootstrap from Preferences:', error);
  }
};

export const kioskBootstrapStorageKeys = {
  bootstrap: BOOTSTRAP_STORAGE_KEY,
  storeSettings: STORE_SETTINGS_STORAGE_KEY,
  selectedStore: KIOSK_SELECTED_STORE_KEY,
  selectedFranchise: KIOSK_SELECTED_FRANCHISE_KEY,
};
