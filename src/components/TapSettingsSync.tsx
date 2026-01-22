/**
 * TapSettingsSync - Sincroniza torneira padrão do localStorage com ESP32Context
 * 
 * Usa localStorage porque cada tablet físico pode gerenciar uma torneira diferente
 * da mesma ESP32 (ex: Tablet A → Torneira 1, Tablet B → Torneira 2)
 */
import { useEffect, useRef } from 'react';
import { useESP32 } from '@/context/ESP32Context';

const LOCAL_STORAGE_KEY = 'kiosk_default_tap_id';

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

export const TapSettingsSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setSelectedTapId, numTaps } = useESP32();
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

  return <>{children}</>;
};
