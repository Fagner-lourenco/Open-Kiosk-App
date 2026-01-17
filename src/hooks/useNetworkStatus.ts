/**
 * ============================================
 * useNetworkStatus Hook
 * ============================================
 * 
 * Hook para monitorar status de rede em tempo real.
 * Integra com Capacitor Network plugin quando disponível.
 */

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { addSyncListener, getSyncStatus, SyncStatus } from '@/services/syncService';

export interface NetworkState {
  isOnline: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number;
  rtt?: number;
}

export interface UseNetworkStatusReturn {
  // Estado de rede
  network: NetworkState;
  isOnline: boolean;
  
  // Estado de sincronização
  sync: SyncStatus;
  isSyncing: boolean;
  pendingCount: number;
  
  // Ações
  checkConnection: () => Promise<boolean>;
}

/**
 * Obtém informações de conexão do navegador (Network Information API)
 */
const getNetworkInfo = (): Partial<NetworkState> => {
  if (typeof navigator === 'undefined') {
    return {};
  }

  // @ts-expect-error - Network Information API não está em todos os navegadores
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  if (!connection) {
    return {};
  }

  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
  };
};

/**
 * Hook principal para status de rede
 */
export const useNetworkStatus = (): UseNetworkStatusReturn => {
  const [network, setNetwork] = useState<NetworkState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: 'unknown',
    ...getNetworkInfo(),
  });

  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());

  // Verifica conexão ativa
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const status = await Network.getStatus();
        return status.connected;
      }
      
      // Web: tenta fazer uma requisição leve
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        await fetch('/robots.txt', { 
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeoutId);
        return true;
      } catch {
        clearTimeout(timeoutId);
        return navigator.onLine;
      }
    } catch {
      return navigator.onLine;
    }
  }, []);

  // Listener para Capacitor Network
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let listenerHandle: { remove: () => void } | null = null;

    const setupCapacitorListener = async () => {
      // Estado inicial
      const status = await Network.getStatus();
      updateNetworkState(status);

      // Listener de mudanças
      listenerHandle = await Network.addListener('networkStatusChange', (status) => {
        updateNetworkState(status);
      });
    };

    const updateNetworkState = (status: ConnectionStatus) => {
      setNetwork((prev) => ({
        ...prev,
        isOnline: status.connected,
        connectionType: status.connectionType as NetworkState['connectionType'],
      }));
    };

    setupCapacitorListener();

    return () => {
      listenerHandle?.remove();
    };
  }, []);

  // Listeners para Web
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return;
    }

    const handleOnline = () => {
      setNetwork((prev) => ({
        ...prev,
        isOnline: true,
        ...getNetworkInfo(),
      }));
    };

    const handleOffline = () => {
      setNetwork((prev) => ({
        ...prev,
        isOnline: false,
      }));
    };

    const handleConnectionChange = () => {
      setNetwork((prev) => ({
        ...prev,
        ...getNetworkInfo(),
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Network Information API change event
    // @ts-expect-error - Network Information API
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  // Listener para status de sync
  useEffect(() => {
    const unsubscribe = addSyncListener((status) => {
      setSync(status);
    });

    return unsubscribe;
  }, []);

  return {
    network,
    isOnline: network.isOnline,
    sync,
    isSyncing: sync.isSyncing,
    pendingCount: sync.pendingCount,
    checkConnection,
  };
};

/**
 * Hook simplificado apenas para status online/offline
 */
export const useIsOnline = (): boolean => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let listenerHandle: { remove: () => void } | null = null;

      const setup = async () => {
        const status = await Network.getStatus();
        setIsOnline(status.connected);

        listenerHandle = await Network.addListener('networkStatusChange', (status) => {
          setIsOnline(status.connected);
        });
      };

      setup();

      return () => {
        listenerHandle?.remove();
      };
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

export default useNetworkStatus;
