/**
 * usePlugPagAutoConnect
 *
 * Auto-connects the configured PlugPag terminal on native Android builds.
 * The identifier comes from localStorage and may be a PRO-* device name or a legacy MAC.
 */
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { usePaymentGateway } from '@/context/PaymentGatewayContext';
import { plugpagPaymentService, type PlugPagTerminalState } from '@/services/plugpagPaymentService';
import { getPlugPagDeviceId } from '@/components/TapSettingsSync';

export function usePlugPagAutoConnect() {
  const { gatewayConfig } = usePaymentGateway();
  const attemptedRef = useRef(false);
  const [terminalState, setTerminalState] = useState<PlugPagTerminalState>('idle');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (attemptedRef.current) return;

    const plugpagConfig = gatewayConfig?.providers?.pagbank?.plugpag;
    if (!plugpagConfig?.enabled) return;

    const deviceId = getPlugPagDeviceId();
    if (!deviceId) {
      console.log('[PlugPagAutoConnect] PlugPag habilitado mas sem identificador configurado');
      return;
    }

    attemptedRef.current = true;
    console.log('[PlugPagAutoConnect] Iniciando auto-conexao ao terminal:', deviceId);

    plugpagPaymentService.connect(deviceId).then(connected => {
      if (connected) {
        console.log('[PlugPagAutoConnect] Terminal conectado com sucesso');
      } else {
        console.warn('[PlugPagAutoConnect] Falha na auto-conexao - retry manual necessario');
      }
    }).catch(err => {
      console.error('[PlugPagAutoConnect] Erro na auto-conexao:', err);
    });

    const unsub = plugpagPaymentService.onStateChange((state) => {
      setTerminalState(state);
    });

    return unsub;
  }, [gatewayConfig]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const state = plugpagPaymentService.getState();
        if (state === 'disconnected' || state === 'error') {
          const deviceId = getPlugPagDeviceId();
          if (deviceId) {
            console.log('[PlugPagAutoConnect] App voltou ao foreground, reconectando...');
            plugpagPaymentService.connect(deviceId).catch(() => {});
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [gatewayConfig]);

  return { terminalState };
}
