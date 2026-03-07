/**
 * usePlugPagAutoConnect — Hook de auto-conexão do terminal PlugPag no boot do app
 *
 * Quando PlugPag está habilitado na config da loja e um MAC está salvo em localStorage,
 * este hook inicializa o SDK e conecta automaticamente ao terminal via Bluetooth Classic.
 *
 * Uso: Montar uma vez no AppContent (dentro de PaymentGatewayProvider).
 */
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { usePaymentGateway } from '@/context/PaymentGatewayContext';
import { plugpagPaymentService, type PlugPagTerminalState } from '@/services/plugpagPaymentService';
import { getPlugPagMac } from '@/components/TapSettingsSync';

export function usePlugPagAutoConnect() {
  const { gatewayConfig } = usePaymentGateway();
  const attemptedRef = useRef(false);
  const [terminalState, setTerminalState] = useState<PlugPagTerminalState>('idle');

  useEffect(() => {
    // Só roda em plataforma nativa (Android)
    if (!Capacitor.isNativePlatform()) return;
    // Só tenta uma vez
    if (attemptedRef.current) return;

    // Verificar se PlugPag está habilitado
    const plugpagConfig = gatewayConfig?.providers?.pagbank?.plugpag;
    if (!plugpagConfig?.enabled) return;

    // Verificar se há MAC configurado
    const mac = getPlugPagMac();
    if (!mac) {
      console.log('[PlugPagAutoConnect] PlugPag habilitado mas sem MAC configurado');
      return;
    }

    attemptedRef.current = true;
    console.log('[PlugPagAutoConnect] Iniciando auto-conexão ao terminal:', mac);

    // Passar activation code da config (se disponível) para auto-ativação
    const activationCode = plugpagConfig.activationCode || undefined;

    // Inicializar + conectar em background (não bloqueia o boot)
    plugpagPaymentService.connect(mac, activationCode).then(connected => {
      if (connected) {
        console.log('[PlugPagAutoConnect] ✅ Terminal conectado com sucesso');
      } else {
        console.warn('[PlugPagAutoConnect] ⚠️ Falha na auto-conexão — retry manual necessário');
      }
    }).catch(err => {
      console.error('[PlugPagAutoConnect] ❌ Erro na auto-conexão:', err);
    });

    // Listener de estado
    const unsub = plugpagPaymentService.onStateChange((state) => {
      setTerminalState(state);
    });

    return unsub;
  }, [gatewayConfig]);

  // Auto-reconectar quando app volta do background
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const state = plugpagPaymentService.getState();
        if (state === 'disconnected' || state === 'error') {
          const mac = getPlugPagMac();
          if (mac) {
            console.log('[PlugPagAutoConnect] App voltou ao foreground, reconectando...');
            plugpagPaymentService.connect(mac).catch(() => {});
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return { terminalState };
}
