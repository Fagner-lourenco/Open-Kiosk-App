/**
 * Hook para reconexão automática ao ESP32
 * 
 * Monitora a conexão e tenta reconectar com backoff exponencial
 * quando detecta queda de conexão.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n';
import esp32Service, { ConnectionStatus } from '@/services/esp32CommunicationService';

export interface UseESP32ReconnectOptions {
  /** Habilitar reconexão automática (padrão: true) */
  enabled?: boolean;

  /** Número máximo de tentativas (padrão: 5) */
  maxAttempts?: number;

  /** Delay base em ms (padrão: 1000) */
  baseDelayMs?: number;

  /** Delay máximo em ms (padrão: 30000) */
  maxDelayMs?: number;

  /** Callback quando reconectar */
  onReconnected?: (status: ConnectionStatus) => void;

  /** Callback quando falhar todas as tentativas */
  onReconnectFailed?: () => void;

  /** Mostrar toasts (padrão: true) */
  showToasts?: boolean;
}

export interface UseESP32ReconnectResult {
  /** Se está tentando reconectar */
  isReconnecting: boolean;

  /** Número de tentativas atuais */
  attemptCount: number;

  /** Forçar reconexão manualmente */
  forceReconnect: () => Promise<boolean>;
}

export function useESP32Reconnect(
  options: UseESP32ReconnectOptions = {}
): UseESP32ReconnectResult {
  const {
    enabled = true,
    maxAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onReconnected,
    onReconnectFailed,
    showToasts = true,
  } = options;

  const { toast } = useToast();
  const { t } = useTranslation();

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  const wasConnected = useRef(false);

  const attemptReconnect = useCallback(async (): Promise<boolean> => {
    if (isReconnecting) return false;

    setIsReconnecting(true);
    setAttemptCount(0);

    if (showToasts) {
      toast({
        title: '🔄 ' + t('esp32.reconnecting'),
        description: t('esp32.connectionLost'),
      });
    }

    try {
      const success = await esp32Service.reconnectWithBackoff(
        maxAttempts,
        baseDelayMs,
        maxDelayMs
      );

      if (success) {
        const status = esp32Service.getConnectionStatus();

        if (showToasts) {
          toast({
            title: '✅ ' + t('esp32.reconnected'),
            description: t('esp32.connectionRestored'),
          });
        }

        onReconnected?.(status);
        wasConnected.current = true;
        return true;
      } else {
        if (showToasts) {
          toast({
            title: '❌ ' + t('esp32.reconnectFailed'),
            description: t('esp32.reconnectFailedDescription', { attempts: maxAttempts }),
            variant: 'destructive',
          });
        }

        onReconnectFailed?.();
        return false;
      }
    } catch (error) {
      console.error('[useESP32Reconnect] Erro:', error);
      onReconnectFailed?.();
      return false;
    } finally {
      setIsReconnecting(false);
    }
  }, [
    isReconnecting,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    onReconnected,
    onReconnectFailed,
    showToasts,
    t,
    toast,
  ]);

  // Registrar callback para mudanças de conexão
  useEffect(() => {
    if (!enabled) return;

    const handleConnectionChange = (status: ConnectionStatus) => {
      if (wasConnected.current && !status.connected) {
        // Conexão perdida - tentar reconectar
        console.log('[useESP32Reconnect] Conexão perdida, tentando reconectar...');
        attemptReconnect();
      }

      wasConnected.current = status.connected;
    };

    // Verificar status inicial
    const currentStatus = esp32Service.getConnectionStatus();
    wasConnected.current = currentStatus.connected;

    // Registrar callback
    const unsubscribe = esp32Service.setOnConnectionChange(handleConnectionChange);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [enabled, attemptReconnect]);

  // Registrar callback para falha de heartbeat
  useEffect(() => {
    if (!enabled) return;

    // O heartbeat é gerenciado pelo painel/componente que inicia a conexão
    // Este hook apenas reage às mudanças de status

  }, [enabled]);

  return {
    isReconnecting,
    attemptCount,
    forceReconnect: attemptReconnect,
  };
}

export default useESP32Reconnect;
