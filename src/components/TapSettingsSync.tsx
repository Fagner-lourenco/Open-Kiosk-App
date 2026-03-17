/**
 * TapSettingsSync
 *
 * Syncs the selected tap between localStorage and ESP32Context.
 * Each physical tablet may manage a different tap from the same ESP32.
 *
 * It also syncs the PlugPag terminal identifier configured on the selected tap.
 * The identifier can be a PRO-* device name from Bluetooth pairing or a legacy MAC.
 */
import { useEffect, useRef } from 'react';
import { useESP32 } from '@/context/ESP32Context';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const LOCAL_STORAGE_KEY = 'kiosk_default_tap_id';
const PLUGPAG_DEVICE_ID_KEY = 'kiosk_plugpag_device_id';
const LEGACY_PLUGPAG_MAC_KEY = 'kiosk_plugpag_mac';

export const getDefaultTapId = (): number => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  } catch {
    return 0;
  }
};

export const setDefaultTapId = (tapId: number): void => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, tapId.toString());
  } catch (e) {
    console.error('[TapSettingsSync] Erro ao salvar torneira padrao:', e);
  }
};

/** Returns the configured PlugPag terminal identifier for this tablet. */
export const getPlugPagDeviceId = (): string | null => {
  try {
    return localStorage.getItem(PLUGPAG_DEVICE_ID_KEY) || localStorage.getItem(LEGACY_PLUGPAG_MAC_KEY);
  } catch {
    return null;
  }
};

/** Persists the PlugPag terminal identifier for this tablet. */
export const setPlugPagDeviceId = (deviceId: string | null): void => {
  try {
    if (deviceId) {
      const normalized = deviceId.trim();
      localStorage.setItem(PLUGPAG_DEVICE_ID_KEY, normalized);
      localStorage.setItem(LEGACY_PLUGPAG_MAC_KEY, normalized);
    } else {
      localStorage.removeItem(PLUGPAG_DEVICE_ID_KEY);
      localStorage.removeItem(LEGACY_PLUGPAG_MAC_KEY);
    }
  } catch (e) {
    console.error('[TapSettingsSync] Erro ao salvar identificador PlugPag:', e);
  }
};

/** @deprecated Kept while the app migrates away from MAC-only terminology. */
export const getPlugPagMac = (): string | null => getPlugPagDeviceId();

/** @deprecated Kept while the app migrates away from MAC-only terminology. */
export const setPlugPagMac = (mac: string | null): void => setPlugPagDeviceId(mac);

export const TapSettingsSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedTapId, setSelectedTapId, numTaps } = useESP32();
  const { settings } = useStoreSettings();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;

    const savedTapId = getDefaultTapId();
    const validTapId = numTaps > 0 ? Math.min(savedTapId, numTaps - 1) : savedTapId;

    console.log('[TapSettingsSync] Carregando torneira padrao do localStorage:', validTapId + 1);
    setSelectedTapId(validTapId);
    initializedRef.current = true;
  }, [numTaps, setSelectedTapId]);

  useEffect(() => {
    if (!settings?.taps) return;

    const tapConfig = settings.taps[selectedTapId];
    const configuredDeviceId = tapConfig?.plugpagDeviceId || null;
    const currentDeviceId = getPlugPagDeviceId();

    if (configuredDeviceId !== currentDeviceId) {
      setPlugPagDeviceId(configuredDeviceId);
      if (configuredDeviceId) {
        console.log(
          `[TapSettingsSync] PlugPag sincronizado da torneira ${selectedTapId + 1}: ${configuredDeviceId}`
        );
      } else {
        console.log(`[TapSettingsSync] Torneira ${selectedTapId + 1} sem terminal PlugPag vinculado`);
      }
    } else {
      console.log('[TapSettingsSync] Identificador PlugPag atual:', currentDeviceId || '(nenhum)');
    }
  }, [settings?.taps, selectedTapId]);

  return <>{children}</>;
};
