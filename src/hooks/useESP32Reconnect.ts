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

  /** Número máximo de tentativas (compatibilidade legada, supervisor usa retry contínuo) */
  maxAttempts?: number;

  /** Delay base em ms (compatibilidade legada) */
  baseDelayMs?: number;

  /** Delay máximo em ms (compatibilidade legada) */
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
    onReconnected,
    onReconnectFailed,
    showToasts = true,
  } = options;

  const { toast } = useToast();
  const { t } = useTranslation();

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  const wasConnected = useRef(false);
  // 🔧 FIX Bug #4: Ref para sempre apontar para a versão atual de attemptReconnect sem
  // causar re-registro do listener a cada mudança de isReconnecting.
  const attemptReconnectRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  const attemptReconnect = useCallback(async (): Promise<boolean> => {
    if (isReconnecting) return false;

    // Guard: não competir com o supervisor de conexão se ele já está no processo de reconexão.
    // Evita race condition onde o hook e o supervisor chamam reconnectNow() simultaneamente.
    if (esp32Service.getConnectionSupervisorStatus().state === 'reconnecting') {
      console.log('[useESP32Reconnect] Supervisor já reconectando — ignorando tentativa do hook');
      return false;
    }

    setIsReconnecting(true);
    setAttemptCount(0);

    if (showToasts) {
      toast({
        title: '🔄 ' + t('esp32.reconnecting'),
        description: t('esp32.connectionLost'),
      });
    }

    try {
      const success = await esp32Service.reconnectNow('hook_force_reconnect');

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
          // 🔧 FIX Bug #3: toast de falha distinto (era idêntico ao de início)
          toast({
            title: '⚠️ ' + t('esp32.reconnectFailed'),
            description: t('esp32.connectionLost'),
          });
        }
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
    onReconnected,
    onReconnectFailed,
    showToasts,
    t,
    toast,
  ]);

  // 🔧 FIX Bug #4: Manter ref sempre atual sem dep no useEffect do listener
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect;
  }, [attemptReconnect]);

  // Registrar callback para mudanças de conexão
  useEffect(() => {
    if (!enabled) return;

    const handleConnectionChange = (status: ConnectionStatus) => {
      if (wasConnected.current && !status.connected) {
        // 🔍 DIAG: Logar com timestamp para detectar race com supervisor scheduleReconnect
        console.warn(
          `[useESP32Reconnect][DIAG] Conexão perdida detectada at=${Date.now()}`,
          `status=${JSON.stringify(status)}`,
          `— chamando attemptReconnect via ref (race com supervisor fechada via Bug #1 fix)`
        );
        attemptReconnectRef.current();
      } else if (!wasConnected.current && status.connected) {
        console.log(`[useESP32Reconnect][DIAG] Conexão restaurada at=${Date.now()} type=${status.type}`);
      }

      wasConnected.current = status.connected;
    };

    // Verificar status inicial
    const currentStatus = esp32Service.getConnectionStatus();
    wasConnected.current = currentStatus.connected;

    // Registrar callback — deps:[enabled] apenas, sem attemptReconnect para evitar re-registro
    const unsubscribe = esp32Service.setOnConnectionChange(handleConnectionChange);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [enabled]); // ✔ apenas [enabled]: handleConnectionChange usa ref, sem stale closure

  // Sincronizar estado visual com supervisor global
  useEffect(() => {
    if (!enabled) return;
    return esp32Service.addConnectionSupervisorListener((supervisor) => {
      setAttemptCount(supervisor.attempt);
      setIsReconnecting(supervisor.state === 'reconnecting' || supervisor.state === 'persistent_failure');
      if (supervisor.state === 'persistent_failure') {
        onReconnectFailed?.();
      }
    });
  }, [enabled, onReconnectFailed]);

  return {
    isReconnecting,
    attemptCount,
    forceReconnect: attemptReconnect,
  };
}

export default useESP32Reconnect;
