/**
 * Hook para autoconexão ao ESP32
 * 
 * Tenta conectar automaticamente ao iniciar, seguindo ordem de preferência:
 * USB → WiFi → Bluetooth (configurável)
 * 
 * USB é priorizado por ser mais estável e rápido.
 * WiFi requer IP previamente salvo.
 * Bluetooth só funciona automaticamente no Android.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n';
import esp32Service, { ConnectionStatus, ConnectionType } from '@/services/esp32CommunicationService';
import { ESP32ConnectionType } from '@/types/store';

export interface UseESP32AutoConnectOptions {
  /** Habilitar autoconexão (padrão: true) */
  enabled?: boolean;
  
  /** Ordem de preferência (padrão: ['usb', 'wifi', 'bluetooth']) */
  connectionOrder?: ESP32ConnectionType[];
  
  /** Callback quando conectar com sucesso */
  onConnected?: (status: ConnectionStatus) => void;
  
  /** Callback quando falhar */
  onFailed?: () => void;
  
  /** Mostrar toasts (padrão: true) */
  showToasts?: boolean;
}

export interface UseESP32AutoConnectResult {
  /** Se está tentando conectar */
  isAutoConnecting: boolean;
  
  /** Resultado da autoconexão */
  autoConnectResult: 'success' | 'failed' | 'pending' | null;
  
  /** Tipo de conexão estabelecida */
  connectedVia: ConnectionType | null;
  
  /** Tentar autoconexão manualmente */
  retryAutoConnect: () => Promise<void>;
}

export function useESP32AutoConnect(
  options: UseESP32AutoConnectOptions = {}
): UseESP32AutoConnectResult {
  const {
    enabled = true,
    connectionOrder = ['usb', 'wifi', 'bluetooth'],
    onConnected,
    onFailed,
    showToasts = true,
  } = options;

  const { toast } = useToast();
  const { t } = useTranslation();
  
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [autoConnectResult, setAutoConnectResult] = useState<'success' | 'failed' | 'pending' | null>(null);
  const [connectedVia, setConnectedVia] = useState<ConnectionType | null>(null);
  
  const hasAttempted = useRef(false);

  const attemptAutoConnect = useCallback(async () => {
    if (isAutoConnecting) return;
    
    setIsAutoConnecting(true);
    setAutoConnectResult('pending');

    if (showToasts) {
      toast({
        title: '🔌 ' + t('esp32.autoConnecting'),
        description: t('esp32.tryingToConnect'),
      });
    }

    try {
      const result = await esp32Service.autoConnectPreferredOrder(connectionOrder);

      if (result !== 'none') {
        setAutoConnectResult('success');
        setConnectedVia(result);
        
        const status = esp32Service.getConnectionStatus();
        
        if (showToasts) {
          const protocolLabel = result === 'usb' ? 'USB' : result === 'wifi' ? 'WiFi' : 'Bluetooth';
          toast({
            title: '✅ ' + t('esp32.connected'),
            description: t('esp32.autoConnectedVia', { protocol: protocolLabel }),
          });
        }

        onConnected?.(status);
      } else {
        setAutoConnectResult('failed');
        setConnectedVia(null);
        
        if (showToasts) {
          toast({
            title: '⚠️ ' + t('esp32.autoConnectFailed'),
            description: t('esp32.connectManually'),
            variant: 'destructive',
          });
        }

        onFailed?.();
      }
    } catch (error) {
      console.error('[useESP32AutoConnect] Erro:', error);
      setAutoConnectResult('failed');
      setConnectedVia(null);
      onFailed?.();
    } finally {
      setIsAutoConnecting(false);
    }
  }, [connectionOrder, isAutoConnecting, onConnected, onFailed, showToasts, t, toast]);

  // Tentar autoconexão na montagem (uma vez)
  useEffect(() => {
    if (!enabled || hasAttempted.current) return;
    
    hasAttempted.current = true;
    
    // Pequeno delay para garantir que o app está pronto
    const timer = setTimeout(() => {
      attemptAutoConnect();
    }, 1000);

    return () => clearTimeout(timer);
  }, [enabled, attemptAutoConnect]);

  const retryAutoConnect = useCallback(async () => {
    hasAttempted.current = false;
    await attemptAutoConnect();
  }, [attemptAutoConnect]);

  return {
    isAutoConnecting,
    autoConnectResult,
    connectedVia,
    retryAutoConnect,
  };
}

export default useESP32AutoConnect;
