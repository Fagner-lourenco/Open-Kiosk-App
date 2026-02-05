/**
 * ESP32Context - Contexto global para gerenciar conexão ESP32
 * 
 * Mantém estado de conexão persistente entre navegações de página.
 * Gerencia heartbeat, auto-reconexão e eventos de conexão.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import esp32Service, { ConnectionStatus, ConnectionType, ESP32Device } from '@/services/esp32CommunicationService';
import esp32Serial, { ESP32Response } from '@/services/esp32SerialService';
import { hardwareStatusService } from '@/services/hardwareStatusService';
import { useToast } from '@/hooks/use-toast';
import {
  TapStatus,
  TapConfig,
  ESP32State,
  ESP32DispensingProgress,
  ESP32Settings,
  ESP32LogEntry,
  ESP32ContextValue,
} from '@/types/esp32ContextTypes';

// ============================================
// CONTEXTO
// ============================================

const ESP32Context = createContext<ESP32ContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

interface ESP32ProviderProps {
  children: React.ReactNode;
  heartbeatInterval?: number;
  autoReconnect?: boolean;
}

export const ESP32Provider: React.FC<ESP32ProviderProps> = ({
  children,
  heartbeatInterval = 60000,  // 🔧 60 segundos (antes: 15s) - reduz spam de ping
  autoReconnect = true,
}) => {
  const { toast } = useToast();

  // Estado
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, type: 'none' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDispensing, setIsDispensing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<ESP32DispensingProgress | null>(null);
  const [settings, setSettings] = useState<ESP32Settings | null>(null);

  // 🆕 Multi-Tap state
  const [numTaps, setNumTaps] = useState<number>(1);
  const [taps, setTaps] = useState<TapStatus[]>([]);
  const [selectedTapId, setSelectedTapId] = useState<number>(0);

  // Logs persistentes
  const [logs, setLogs] = useState<ESP32LogEntry[]>([]);
  const logIdRef = useRef(0);

  // Refs para listeners
  const responseListeners = useRef<Set<(response: ESP32Response) => void>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================
  // FUNÇÕES DE LOG
  // ============================================

  const addLog = useCallback((type: ESP32LogEntry['type'], message: string, json?: ESP32Response) => {
    setLogs(prev => [
      ...prev.slice(-199), // Manter últimos 200 logs
      {
        id: ++logIdRef.current,
        timestamp: new Date(),
        type,
        message,
        json,
      },
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    logIdRef.current = 0;
  }, []);

  // ============================================
  // HANDLERS DE RESPOSTA
  // ============================================

  // 🔧 CORREÇÃO: Ref para rastrear último pong e evitar logs duplicados
  const lastPongTimeRef = useRef<number>(0);

  const handleESP32Response = useCallback((response: ESP32Response) => {
    // 🔧 CORREÇÃO: Filtrar pongs repetidos (menos de 5s entre eles)
    if (response.type === 'pong') {
      const now = Date.now();
      if (now - lastPongTimeRef.current < 5000) {
        // Pong muito recente, não logar (mas ainda processar)
        console.log('[ESP32Context] Pong recebido (não logado - muito frequente)');
        return;
      }
      lastPongTimeRef.current = now;
    }

    console.log('[ESP32Context] Resposta recebida:', response);

    // Adicionar ao log persistente
    addLog('received', JSON.stringify(response), response);

    // 🆕 Multi-Tap: Processar num_taps de QUALQUER resposta que inclua
    if (response.num_taps !== undefined && response.num_taps > 0) {
      console.log('[ESP32Context] 🚰 num_taps detectado:', response.num_taps);
      setNumTaps(response.num_taps);
    }

    // Notificar todos os listeners
    responseListeners.current.forEach(listener => {
      try {
        listener(response);
      } catch (error) {
        console.error('[ESP32Context] Erro em listener:', error);
      }
    });

    // 🆕 CORREÇÃO: Detectar tipo por campos quando 'type' está ausente
    // Isso é necessário porque mensagens BLE podem chegar fragmentadas ou em ordem diferente
    let responseType = response.type;
    if (!responseType) {
      // Detectar tipo por campos característicos
      if (response.percent !== undefined || response.flow_started !== undefined ||
        (response.ml !== undefined && response.target !== undefined)) {
        responseType = 'progress';
        console.log('[ESP32Context] Tipo detectado por campos: progress');
      } else if (response.stage !== undefined) {
        responseType = 'status';
        console.log('[ESP32Context] Tipo detectado por campos: status');
      } else if (response.pulses !== undefined && response.duration_ms !== undefined) {
        responseType = response.ml_calculated !== undefined ? 'flow_test' : 'calibration';
        console.log('[ESP32Context] Tipo detectado por campos:', responseType);
      } else if (response.timestamp !== undefined && Object.keys(response).length <= 2) {
        responseType = 'pong';
        console.log('[ESP32Context] Tipo detectado por campos: pong');
      }
    }

    // Processar tipos específicos
    switch (responseType) {
      case 'progress':
        setIsDispensing(true);
        setCurrentProgress({
          orderId: response.orderId || '',
          cup: response.cup || 1,
          totalCups: response.total_cups || 1,
          ml: response.ml || 0,
          targetMl: response.target || response.target_ml || 0,
          percent: response.percent || 0,
          flowStarted: response.flow_started ?? false,
          elapsedSeconds: response.elapsed_seconds ?? 0,
          remainingSeconds: response.remaining_seconds ?? 300,
          tapId: response.tapId, // 🆕 Multi-Tap: incluir tapId no progresso
        });

        // 🆕 Multi-Tap: Atualizar status do tap específico
        if (response.tapId !== undefined) {
          setTaps(prev => {
            const updated = [...prev];
            const tapIndex = updated.findIndex(t => t.id === response.tapId);
            const tapStatus: TapStatus = {
              id: response.tapId,
              isDispensing: true,
              orderId: response.orderId,
              currentCup: response.cup || 1,
              totalCups: response.total_cups || 1,
              mlDispensed: response.ml || 0,
              targetMl: response.target || response.target_ml || 0,
              flowStarted: response.flow_started ?? false,
              progress: response.percent || 0,
            };
            if (tapIndex >= 0) {
              updated[tapIndex] = tapStatus;
            } else {
              updated.push(tapStatus);
            }
            return updated;
          });
        }
        break;

      case 'status':
        if (response.stage === 'completed' || response.stage === 'error') {
          setIsDispensing(false);
          setCurrentProgress(null);

          // 🆕 Multi-Tap: Atualizar tap como não dispensando
          if (response.tapId !== undefined) {
            setTaps(prev => prev.map(t =>
              t.id === response.tapId
                ? { ...t, isDispensing: false, progress: response.stage === 'completed' ? 100 : t.progress }
                : t
            ));
          }
        }

        // 🆕 Multi-Tap: Processar num_taps do status
        if (response.num_taps !== undefined) {
          setNumTaps(response.num_taps);

          // Atualizar status remoto com info multi-tap
          hardwareStatusService.updateStatus({
            numTaps: response.num_taps,
            hardwareId: response.chip_id || response.hardware_id,
          });
        }

        // 🆕 Multi-Tap: Processar array de taps
        if (response.taps && Array.isArray(response.taps)) {
          const tapsData = response.taps.map((t: Record<string, unknown>) => ({
            id: t.id as number,
            isDispensing: t.isDispensing as boolean ?? false,
            orderId: t.orderId as string | undefined,
            currentCup: t.currentCup as number ?? 0,
            totalCups: t.totalCups as number ?? 0,
            mlDispensed: t.mlDispensed as number ?? 0,
            targetMl: t.targetMl as number ?? 0,
            flowStarted: t.flowStarted as boolean ?? false,
            progress: t.progress as number ?? 0,
          }));
          setTaps(tapsData);

          // Atualizar status remoto com estado dos taps
          hardwareStatusService.updateStatus({
            taps: tapsData.map(t => ({
              id: t.id,
              isDispensing: t.isDispensing,
              orderId: t.orderId,
              progress: t.progress,
            })),
          });
        }
        break;

      // 🆕 Resposta específica de get_taps
      case 'taps_status':
        if (response.num_taps !== undefined) {
          setNumTaps(response.num_taps);
        }
        if (response.taps && Array.isArray(response.taps)) {
          const tapsData = response.taps.map((t: Record<string, unknown>) => ({
            id: t.id as number,
            isDispensing: t.isDispensing as boolean ?? false,
            orderId: t.orderId as string | undefined,
            currentCup: t.currentCup as number ?? 0,
            totalCups: t.totalCups as number ?? 0,
            mlDispensed: t.mlDispensed as number ?? 0,
            targetMl: t.targetMl as number ?? 0,
            flowStarted: t.flowStarted as boolean ?? false,
            progress: t.progress as number ?? 0,
          }));
          setTaps(tapsData);
          console.log('[ESP32Context] 🚰 Taps atualizados:', tapsData);
        }
        break;

      case 'settings':
        setSettings({
          firmwareVersion: response.firmware_version || 'unknown',
          pulsosPorLitro: response.pulsos_por_litro || 450,
          mlPorSegundo: response.ml_por_segundo || 50,
          wifiSsid: response.wifi_ssid,
          wifiIp: response.wifi_ip,
          mdnsHostname: response.mdns_hostname,
          bleName: response.ble_name,
        });
        // Atualizar status remoto com todos os dados do ESP32
        hardwareStatusService.updateStatus({
          firmwareVersion: response.firmware_version,
          esp32Ip: response.wifi_ip,
          macAddress: response.mac,
        });
        break;

      case 'error':
        setLastError(response.message || 'Erro desconhecido');
        if (response.stage === 'error') {
          setIsDispensing(false);
          setCurrentProgress(null);
        }
        break;
    }
  }, []);

  // ============================================
  // GERENCIAMENTO DE CONEXÃO
  // ============================================

  const updateConnectionStatus = useCallback((newStatus: ConnectionStatus) => {
    console.log('[ESP32Context] updateConnectionStatus recebido:', JSON.stringify(newStatus));
    setStatus(newStatus);

    // Persistir status no Firestore para monitoramento remoto (Admin)
    hardwareStatusService.updateStatus({
      esp32Connected: newStatus.connected,
      esp32Type: newStatus.type !== 'none' ? newStatus.type as 'usb' | 'wifi' | 'bluetooth' : undefined,
      esp32Port: newStatus.deviceName,
    });

    if (newStatus.connected) {
      setLastError(null);

      // Iniciar heartbeat local e remoto
      hardwareStatusService.startHeartbeat();

      // Iniciar heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      heartbeatRef.current = setInterval(() => {
        esp32Service.ping().catch(() => {
          console.warn('[ESP32Context] Heartbeat falhou');
        });
      }, heartbeatInterval);
    } else {
      // Parar heartbeat local e remoto
      hardwareStatusService.stopHeartbeat();

      // Parar heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }
  }, [heartbeatInterval]);

  // 🆕 Força sincronização do status de conexão com o serviço
  const refreshConnectionStatus = useCallback(() => {
    const currentStatus = esp32Service.getConnectionStatus();
    console.log('[ESP32Context] refreshConnectionStatus:', JSON.stringify(currentStatus));
    if (currentStatus.connected !== status.connected || currentStatus.type !== status.type) {
      console.log('[ESP32Context] Status diferente, atualizando...');
      updateConnectionStatus(currentStatus);
    }
  }, [status, updateConnectionStatus]);

  // Registrar listener no serviço de comunicação
  useEffect(() => {
    // Listener para mudanças de conexão
    esp32Service.setOnConnectionChange(updateConnectionStatus);

    // Listener para respostas Serial/USB (JSON parsed)
    const unsubscribeMessage = esp32Serial.onMessage(handleESP32Response);

    // Listener para linhas raw (não-JSON)
    const unsubscribeRaw = esp32Serial.onRawLine((line: string) => {
      if (!line.startsWith('{')) {
        addLog('received', line);
      }
    });

    // 🆕 Listener para dados recebidos via Bluetooth
    // NOTA: O serviço agora envia linhas completas (já processou o buffer)
    esp32Service.setOnBleDataReceived((line: string) => {
      console.log('[ESP32Context] BLE linha recebida:', line);

      // Tentar parsear como JSON
      if (line.startsWith('{')) {
        try {
          const json = JSON.parse(line);
          addLog('received', line, json);
          handleESP32Response(json);
        } catch (e) {
          // Não é JSON válido, logar como texto
          console.warn('[ESP32Context] JSON inválido:', line, e);
          addLog('received', line);
        }
      } else if (line.trim()) {
        // Linha de texto normal
        addLog('received', line);
      }
    });

    // 🆕 Listener para dados recebidos via USB OTG nativo (Android)
    // NOTA: O serviço agora envia linhas completas (já processou o buffer)
    esp32Service.setOnUsbDataReceived((line: string) => {
      console.log('[ESP32Context] USB OTG linha recebida:', line);

      // Tentar parsear como JSON
      if (line.startsWith('{')) {
        try {
          const json = JSON.parse(line);
          addLog('received', line, json);
          handleESP32Response(json);
        } catch (e) {
          // Não é JSON válido, logar como texto
          console.warn('[ESP32Context] JSON inválido:', line, e);
          addLog('received', line);
        }
      } else if (line.trim()) {
        // Linha de texto normal
        addLog('received', line);
      }
    });

    // Listener para mudanças de conexão Serial
    const unsubscribeConnection = esp32Serial.onConnectionChange((connected: boolean) => {
      // 🔧 FIX: Sincronizar estado com esp32CommunicationService
      // Isso garante que sendCommand() funcione quando conexão foi feita via esp32Serial
      esp32Service.syncExternalUSBConnection(connected);

      if (connected) {
        addLog('info', '✅ Connected USB Serial');
        // Usar updateConnectionStatus para também persistir no Firestore
        updateConnectionStatus({ connected: true, type: 'usb', deviceName: 'USB Serial' });
      } else {
        addLog('info', '🔌 Disconnected');
        updateConnectionStatus({ connected: false, type: 'none' });
      }
    });

    // Verificar conexão inicial
    const initialStatus = esp32Service.getConnectionStatus();
    if (initialStatus.connected) {
      updateConnectionStatus(initialStatus);
    } else if (autoReconnect) {
      // Tentar reconexão automática USB se não conectado
      // Pequeno delay para garantir que a página carregou
      const reconnectTimer = setTimeout(async () => {
        console.log('[ESP32Context] Tentando reconexão automática USB...');
        addLog('info', '🔄 Tentando reconexão automática...');

        const reconnected = await esp32Serial.tryAutoReconnect();
        if (reconnected) {
          console.log('[ESP32Context] ✅ Reconexão automática bem-sucedida');
          addLog('info', '✅ Reconexão automática bem-sucedida');
          toast({
            title: '✅ Reconectado',
            description: 'ESP32 reconectado automaticamente via USB',
          });
        } else {
          console.log('[ESP32Context] Reconexão automática falhou - conecte manualmente');
          addLog('info', '⚠️ Reconexão automática falhou - conecte manualmente');
        }
      }, 500);

      return () => {
        clearTimeout(reconnectTimer);
        esp32Service.setOnConnectionChange(null);
        esp32Service.setOnBleDataReceived(null);
        esp32Service.setOnUsbDataReceived(null);
        unsubscribeMessage();
        unsubscribeRaw();
        unsubscribeConnection();

        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
        }
      };
    }

    return () => {
      esp32Service.setOnConnectionChange(null);
      esp32Service.setOnBleDataReceived(null);
      esp32Service.setOnUsbDataReceived(null);
      unsubscribeMessage();
      unsubscribeRaw();
      unsubscribeConnection();

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [updateConnectionStatus, handleESP32Response, addLog, autoReconnect, toast]);

  // ============================================
  // MÉTODOS DE CONEXÃO
  // ============================================

  // 🆕 POLLING DE STATUS WiFi DURANTE DISPENSAÇÃO
  // Quando conectado via WiFi, fazer polling de /status para obter progresso
  useEffect(() => {
    if (!isDispensing || status.type !== 'wifi' || !status.connected) {
      return;
    }

    console.log('[ESP32Context] 📶 Iniciando polling WiFi durante dispensação...');

    const pollInterval = setInterval(async () => {
      try {
        // Buscar status via HTTP GET /status
        const response = await fetch('http://192.168.4.1/status', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[ESP32Context] 📶 Polling WiFi resposta:', data);

          // Processar resposta como se viesse de USB/BLE
          handleESP32Response(data);
        } else {
          console.warn('[ESP32Context] 📶 Polling WiFi falhou:', response.status);
        }
      } catch (error) {
        console.warn('[ESP32Context] 📶 Erro no polling WiFi:', error);
      }
    }, 500); // Polling a cada 500ms para feedback em tempo real

    return () => {
      console.log('[ESP32Context] 📶 Parando polling WiFi');
      clearInterval(pollInterval);
    };
  }, [isDispensing, status.type, status.connected, handleESP32Response]);

  const connect = useCallback(async (device: ESP32Device): Promise<boolean> => {
    setIsConnecting(true);
    setLastError(null);

    try {
      let success = false;

      switch (device.type) {
        case 'usb':
          success = await esp32Service.connectUSB();
          break;
        case 'wifi':
          if (device.ipAddress) {
            success = await esp32Service.connectWifi(device.ipAddress);
          }
          break;
        case 'bluetooth':
          success = await esp32Service.connectBluetooth(device.id);
          break;
      }

      if (success) {
        toast({
          title: 'ESP32 Conectado',
          description: `Conectado via ${device.type.toUpperCase()}`,
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão';
      setLastError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const connectUSB = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setLastError(null);

    try {
      const success = await esp32Service.connectUSB();

      if (success) {
        // Iniciar leitura serial
        await esp32Serial.connect();

        toast({
          title: 'ESP32 Conectado',
          description: 'Conectado via USB Serial',
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão USB';
      setLastError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const connectWifi = useCallback(async (ip: string): Promise<boolean> => {
    setIsConnecting(true);
    setLastError(null);

    try {
      const success = await esp32Service.connectWifi(ip);

      if (success) {
        toast({
          title: 'ESP32 Conectado',
          description: `Conectado via WiFi (${ip})`,
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão WiFi';
      setLastError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await esp32Service.disconnect();
      await esp32Serial.disconnect();

      updateConnectionStatus({ connected: false, type: 'none' });
      setIsDispensing(false);
      setCurrentProgress(null);

      toast({
        title: 'Desconectado',
        description: 'ESP32 desconectado',
      });
    } catch (error) {
      console.error('[ESP32Context] Erro ao desconectar:', error);
    }
  }, [toast]);

  // ============================================
  // MÉTODOS DE COMANDO
  // ============================================

  const sendCommand = useCallback(async (command: string, data?: object): Promise<boolean> => {
    return esp32Service.sendCommand(command, data);
  }, []);

  const releaseDrink = useCallback(async (
    orderId: string,
    mlPerUnit: number,
    quantity: number = 1,
    sizeLabel: string = 'Padrão',
    tapId: number = selectedTapId  // 🆕 Multi-Tap: usa tap selecionado por padrão
  ): Promise<boolean> => {
    console.log('[ESP32Context] releaseDrink chamado:', { orderId, mlPerUnit, quantity, sizeLabel, tapId });
    console.log('[ESP32Context] Status atual:', status);

    // 🆕 CORREÇÃO: Verificar conexão baseada no tipo atual (não apenas USB Serial)
    if (!status.connected) {
      console.log('[ESP32Context] Não conectado, tentando reconexão automática...');
      addLog('info', '🔄 Tentando reconectar para dispensar...');

      // Tentar reconexão via protocolo atual ou auto-reconexão
      let reconnected = false;

      // No Web, tentar USB Serial
      if (!Capacitor.isNativePlatform()) {
        reconnected = await esp32Serial.tryAutoReconnect();
      } else {
        // No Android, tentar reconectar via serviço (que usa último tipo conhecido)
        try {
          const lastConnection = esp32Service.getLastConnection();
          if (lastConnection) {
            reconnected = await esp32Service.connect({
              id: lastConnection.deviceId || 'auto',
              name: lastConnection.deviceName || 'ESP32',
              type: lastConnection.type,
              ipAddress: lastConnection.ipAddress,
            });
          }
        } catch (e) {
          console.error('[ESP32Context] Erro ao tentar reconectar:', e);
        }
      }

      if (!reconnected) {
        console.error('[ESP32Context] Falha na reconexão automática');
        addLog('error', '❌ Falha na reconexão - ESP32 não conectado');
        toast({
          title: '❌ ESP32 Desconectado',
          description: 'Conecte o ESP32 (USB, WiFi ou Bluetooth) antes de dispensar.',
          variant: 'destructive',
        });
        return false;
      }

      console.log('[ESP32Context] ✅ Reconexão automática bem-sucedida');
      addLog('info', '✅ Reconectado automaticamente');

      // Atualizar status após reconexão
      setStatus(esp32Service.getConnectionStatus());
    }

    // Preparar UI para dispensação
    setIsDispensing(true);
    setCurrentProgress({
      orderId,
      cup: 1,
      totalCups: quantity,
      ml: 0,
      targetMl: mlPerUnit,
      percent: 0,
      flowStarted: false,
      elapsedSeconds: 0,
      remainingSeconds: 120, // 🔧 v4.0.6: Reduzido para 2 minutos (consistente com firmware)
      tapId,
    });

    addLog('sent', `release_drink: ${orderId} (${mlPerUnit}ml x${quantity}) [Tap ${tapId}]`);

    try {
      // 🆕 CORREÇÃO: Usar esp32Service.sendCommand que detecta automaticamente o tipo de conexão
      // Isso funciona para USB (Web Serial ou OTG nativo), WiFi e Bluetooth
      const success = await esp32Service.sendCommand('release_drink', {
        orderId,
        mlPerUnit,
        quantity,
        sizeLabel,
        tapId,
      });

      if (success) {
        console.log(`[ESP32Context] ✅ Comando de dispensação enviado via ${status.type} (Tap ${tapId})`);
        addLog('info', `✅ Comando enviado via ${status.type} (Tap ${tapId})`);
      } else {
        console.error('[ESP32Context] ❌ Falha ao enviar comando de dispensação');
        addLog('error', '❌ Falha ao enviar comando');
        setIsDispensing(false);
        setCurrentProgress(null);
      }

      return success;
    } catch (error) {
      console.error('[ESP32Context] Erro ao dispensar:', error);
      addLog('error', `Erro: ${error instanceof Error ? error.message : 'Desconhecido'}`);
      setIsDispensing(false);
      setCurrentProgress(null);
      return false;
    }
  }, [status, selectedTapId, addLog, toast]);

  const ping = useCallback(async (): Promise<boolean> => {
    return esp32Service.ping();
  }, []);

  const testValve = useCallback(async (durationMs: number = 1000, tapId: number = selectedTapId): Promise<boolean> => {
    // 🆕 Multi-Tap: Enviar test_valve com tapId
    addLog('sent', `test_valve: ${durationMs}ms [Tap ${tapId}]`);

    // 🆕 CORREÇÃO: Usar sendCommand unificado que detecta automaticamente o tipo de conexão
    return esp32Service.sendCommand('test_valve', { duration: durationMs, tapId });
  }, [selectedTapId, addLog]);

  const stopDispensing = useCallback(async (tapId?: number): Promise<boolean> => {
    // 🆕 Multi-Tap: Enviar stop com tapId opcional
    addLog('sent', tapId !== undefined ? `stop [Tap ${tapId}]` : 'stop [All Taps]');

    // 🆕 CORREÇÃO: Usar sendCommand unificado
    const params = tapId !== undefined ? { tapId } : {};
    await esp32Service.sendCommand('stop', params);

    setIsDispensing(false);
    setCurrentProgress(null);
    return true;
  }, [addLog]);

  const getSettingsCmd = useCallback(async (): Promise<boolean> => {
    return esp32Service.getSettings();
  }, []);

  const saveCalibration = useCallback(async (
    pulsosPorLitro: number,
    mlPorSegundo: number,
    tapId: number = selectedTapId  // 🆕 Multi-Tap
  ): Promise<boolean> => {
    addLog('sent', `save_calibration: ${pulsosPorLitro} pulsos/L, ${mlPorSegundo} ml/s [Tap ${tapId}]`);
    return esp32Service.saveCalibration(pulsosPorLitro, mlPorSegundo, tapId);
  }, [selectedTapId, addLog]);

  // ============================================
  // 🆕 FUNÇÕES MULTI-TAP
  // ============================================

  const getTapStatus = useCallback((tapId: number): TapStatus | undefined => {
    return taps.find(t => t.id === tapId);
  }, [taps]);

  const refreshTaps = useCallback(async (): Promise<void> => {
    // Buscar status de todas as torneiras via comando get_taps ou HTTP /taps
    try {
      // 🔧 FIX: Usar sendCommand unificado que funciona em todos os protocolos
      // Ao invés de fetch hardcoded que só funciona em WiFi
      const success = await esp32Service.sendCommand('get_taps');
      if (!success) {
        console.warn('[ESP32Context] Falha ao enviar comando get_taps');
      }
      // A resposta virá via callback handleESP32Response
    } catch (error) {
      console.warn('[ESP32Context] Erro ao buscar taps:', error);
    }
  }, []);

  // ============================================
  // GERENCIAMENTO DE LISTENERS
  // ============================================

  const addResponseListener = useCallback((callback: (response: ESP32Response) => void): () => void => {
    responseListeners.current.add(callback);
    return () => {
      responseListeners.current.delete(callback);
    };
  }, []);

  // ============================================
  // VALOR DO CONTEXTO
  // ============================================

  const value: ESP32ContextValue = {
    // Estado
    status,
    isConnecting,
    lastError,
    isDispensing,
    currentProgress,
    settings,

    // 🆕 Multi-Tap
    numTaps,
    taps,
    selectedTapId,

    // Métodos de conexão
    connect,
    connectUSB,
    connectWifi,
    disconnect,
    refreshConnectionStatus,

    // Comandos
    sendCommand,
    releaseDrink,
    ping,
    testValve,
    stopDispensing,
    getSettings: getSettingsCmd,
    saveCalibration,

    // 🆕 Multi-Tap methods
    setSelectedTapId,
    getTapStatus,
    refreshTaps,

    // Listeners
    addResponseListener,

    // Logs
    logs,
    addLog,
    clearLogs,
  };

  return (
    <ESP32Context.Provider value={value}>
      {children}
    </ESP32Context.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useESP32 = (): ESP32ContextValue => {
  const context = useContext(ESP32Context);

  if (!context) {
    throw new Error('useESP32 deve ser usado dentro de um ESP32Provider');
  }

  return context;
};

export default ESP32Context;
