/**
 * TapSettingsSync - Sincroniza torneira padrão do localStorage com ESP32Context
 * 
 * Usa localStorage porque cada tablet físico pode gerenciar uma torneira diferente
 * da mesma ESP32 (ex: Tablet A → Torneira 1, Tablet B → Torneira 2)
 * 
 * Também sincroniza automaticamente o MAC do terminal PlugPag:
 *   - Admin configura o MAC na torneira (taps[].plugpagDeviceId)
 *   - Quando o tablet seleciona uma torneira, o MAC é copiado para localStorage
 *   - usePlugPagAutoConnect lê do localStorage e conecta ao terminal
 * 
 * Fluxo: Admin → Firestore taps[].plugpagDeviceId → TapSettingsSync → localStorage → PlugPag SDK
 */
import { useEffect, useRef } from 'react';
import { useESP32 } from '@/context/ESP32Context';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const LOCAL_STORAGE_KEY = 'kiosk_default_tap_id';
const PLUGPAG_MAC_KEY = 'kiosk_plugpag_mac';

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
    console.error('[TapSettingsSync] Erro ao salvar torneira padrão:', e);
  }
};

/** Retorna o MAC Bluetooth do terminal PlugPag vinculado a este tablet */
export const getPlugPagMac = (): string | null => {
  try {
    return localStorage.getItem(PLUGPAG_MAC_KEY);
  } catch {
    return null;
  }
};

/** Salva o MAC Bluetooth do terminal PlugPag vinculado a este tablet */
export const setPlugPagMac = (mac: string | null): void => {
  try {
    if (mac) {
      localStorage.setItem(PLUGPAG_MAC_KEY, mac.toUpperCase());
    } else {
      localStorage.removeItem(PLUGPAG_MAC_KEY);
    }
  } catch (e) {
    console.error('[TapSettingsSync] Erro ao salvar MAC PlugPag:', e);
  }
};

export const TapSettingsSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedTapId, setSelectedTapId, numTaps } = useESP32();
  const { settings } = useStoreSettings();
  const initializedRef = useRef(false);

  // Carregar torneira padrão do localStorage na inicialização
  useEffect(() => {
    if (initializedRef.current) return;
    
    const savedTapId = getDefaultTapId();
    
    // Garantir que o tapId salvo é válido para o número de torneiras disponíveis
    const validTapId = numTaps > 0 ? Math.min(savedTapId, numTaps - 1) : savedTapId;
    
    console.log('[TapSettingsSync] Carregando torneira padrão do localStorage:', validTapId + 1);
    setSelectedTapId(validTapId);
    initializedRef.current = true;
  }, [numTaps, setSelectedTapId]);

  // Auto-sync: copiar plugpagDeviceId da torneira selecionada para localStorage
  // Isso garante que o MAC configurado no admin chega ao tablet automaticamente
  useEffect(() => {
    if (!settings?.taps) return;

    const tapConfig = settings.taps[selectedTapId];
    const configuredMac = tapConfig?.plugpagDeviceId || null;
    const currentMac = getPlugPagMac();

    // Só atualiza se mudou (evita loops e logs desnecessários)
    if (configuredMac !== currentMac) {
      setPlugPagMac(configuredMac);
      if (configuredMac) {
        console.log(`[TapSettingsSync] ✅ MAC PlugPag sincronizado da torneira ${selectedTapId + 1}: ${configuredMac}`);
      } else {
        console.log(`[TapSettingsSync] Torneira ${selectedTapId + 1} sem terminal PlugPag vinculado`);
      }
    } else {
      console.log('[TapSettingsSync] MAC PlugPag vinculado:', currentMac || '(nenhum)');
    }
  }, [settings?.taps, selectedTapId]);

  return <>{children}</>;
};
