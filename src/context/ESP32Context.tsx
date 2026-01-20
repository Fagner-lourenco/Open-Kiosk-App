/**
 * ESP32Context - Contexto global para gerenciar conexão ESP32
 * 
 * Mantém estado de conexão persistente entre navegações de página.
 * Gerencia heartbeat, auto-reconexão e eventos de conexão.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import esp32Service, { ConnectionStatus, ConnectionType, ESP32Device } from '@/services/esp32CommunicationService';
import esp32Serial, { ESP32Response } from '@/services/esp32SerialService';
import { hardwareStatusService } from '@/services/hardwareStatusService';
import { useToast } from '@/hooks/use-toast';

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface ESP32State {
  // Status de conexão
  status: ConnectionStatus;
  isConnecting: boolean;
  lastError: string | null;
  
  // Dispensação
  isDispensing: boolean;
  currentProgress: ESP32DispensingProgress | null;
  
  // Configurações do ESP32
  settings: ESP32Settings | null;
}

export interface ESP32DispensingProgress {
  orderId: string;
  cup: number;
  totalCups: number;
  ml: number;
  targetMl: number;
  percent: number;
  /** Se o fluxo já começou (usuário abriu a torneira) */
  flowStarted: boolean;
  /** Segundos decorridos desde o início da sessão */
  elapsedSeconds: number;
  /** Segundos restantes até o timeout global */
  remainingSeconds: number;
}

export interface ESP32Settings {
  firmwareVersion: string;
  pulsosPorLitro: number;
  mlPorSegundo: number;
  wifiSsid?: string;
  wifiIp?: string;
  mdnsHostname?: string;
  bleName?: string;
}

// Log de comunicação
export interface ESP32LogEntry {
  id: number;
  timestamp: Date;
  type: 'sent' | 'received' | 'info' | 'error';
  message: string;
  json?: ESP32Response;
}

export interface ESP32ContextValue extends ESP32State {
  // Métodos de conexão
  connect: (device: ESP32Device) => Promise<boolean>;
  connectUSB: () => Promise<boolean>;
  connectWifi: (ip: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  
  // Comandos
  sendCommand: (command: string, data?: object) => Promise<boolean>;
  releaseDrink: (orderId: string, mlPerUnit: number, quantity?: number, sizeLabel?: string) => Promise<boolean>;
  ping: () => Promise<boolean>;
  testValve: (durationMs?: number) => Promise<boolean>;
  stopDispensing: () => Promise<boolean>;
  getSettings: () => Promise<boolean>;
  saveCalibration: (pulsosPorLitro: number, mlPorSegundo: number) => Promise<boolean>;
  
  // Callbacks para respostas
  addResponseListener: (callback: (response: ESP32Response) => void) => () => void;
  
  // Logs persistentes
  logs: ESP32LogEntry[];
  addLog: (type: ESP32LogEntry['type'], message: string, json?: ESP32Response) => void;
  clearLogs: () => void;
}

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
  heartbeatInterval = 15000,
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
  
  const handleESP32Response = useCallback((response: ESP32Response) => {
    console.log('[ESP32Context] Resposta recebida:', response);
    
    // Adicionar ao log persistente
    addLog('received', JSON.stringify(response), response);
    
    // Notificar todos os listeners
    responseListeners.current.forEach(listener => {
      try {
        listener(response);
      } catch (error) {
        console.error('[ESP32Context] Erro em listener:', error);
      }
    });
    
    // Processar tipos específicos
    switch (response.type) {
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
        });
        break;
        
      case 'status':
        if (response.stage === 'completed' || response.stage === 'error') {
          setIsDispensing(false);
          setCurrentProgress(null);
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
    
    // Listener para mudanças de conexão Serial
    const unsubscribeConnection = esp32Serial.onConnectionChange((connected: boolean) => {
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
    sizeLabel: string = 'Padrão'
  ): Promise<boolean> => {
    console.log('[ESP32Context] releaseDrink chamado:', { orderId, mlPerUnit, quantity, sizeLabel });
    console.log('[ESP32Context] Status atual:', status);
    
    // Verificar se está conectado via USB Serial
    const isSerialConnected = esp32Serial.isConnected();
    console.log('[ESP32Context] esp32Serial.isConnected():', isSerialConnected);
    
    // Se não estiver conectado, tentar reconexão automática
    if (!isSerialConnected) {
      console.log('[ESP32Context] Não conectado, tentando reconexão automática...');
      addLog('info', '🔄 Tentando reconectar para dispensar...');
      
      const reconnected = await esp32Serial.tryAutoReconnect();
      
      if (!reconnected) {
        console.error('[ESP32Context] Falha na reconexão automática');
        addLog('error', '❌ Falha na reconexão - ESP32 não conectado');
        toast({
          title: '❌ ESP32 Desconectado',
          description: 'Conecte o ESP32 via USB no painel de administração.',
          variant: 'destructive',
        });
        return false;
      }
      
      console.log('[ESP32Context] ✅ Reconexão automática bem-sucedida');
      addLog('info', '✅ Reconectado automaticamente');
    }
    
    // Agora enviar comando de dispensação via esp32Serial
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
      remainingSeconds: 300, // 5 minutos padrão
    });
    
    addLog('sent', `release_drink: ${orderId} (${mlPerUnit}ml x${quantity})`);
    
    try {
      // Usar esp32Serial diretamente para enviar comando
      const success = await esp32Serial.releaseDrink(orderId, mlPerUnit, quantity, sizeLabel);
      
      if (success) {
        console.log('[ESP32Context] ✅ Comando de dispensação enviado com sucesso');
        addLog('info', '✅ Comando enviado ao ESP32');
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
  }, [status, addLog, toast]);
  
  const ping = useCallback(async (): Promise<boolean> => {
    return esp32Service.ping();
  }, []);
  
  const testValve = useCallback(async (durationMs: number = 1000): Promise<boolean> => {
    // CORRIGIDO: Enviar test_valve diretamente via Serial ou HTTP
    const payload = { action: 'test_valve', duration: durationMs };
    
    if (status.type === 'usb') {
      return esp32Serial.sendCommand(payload as any);
    }
    
    // Via WiFi/BLE
    return esp32Service.sendWifiCommand('test_valve', payload);
  }, [status.type]);
  
  const stopDispensing = useCallback(async (): Promise<boolean> => {
    // Enviar comando para parar (não existe método específico, enviar ping para "interromper")
    // TODO: Implementar stop_dispensing no firmware se necessário
    console.warn('[ESP32Context] stopDispensing não implementado no firmware');
    setIsDispensing(false);
    setCurrentProgress(null);
    return true;
  }, []);
  
  const getSettingsCmd = useCallback(async (): Promise<boolean> => {
    return esp32Service.getSettings();
  }, []);
  
  const saveCalibration = useCallback(async (
    pulsosPorLitro: number,
    mlPorSegundo: number
  ): Promise<boolean> => {
    return esp32Service.saveCalibration(pulsosPorLitro, mlPorSegundo);
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
    
    // Métodos de conexão
    connect,
    connectUSB,
    connectWifi,
    disconnect,
    
    // Comandos
    sendCommand,
    releaseDrink,
    ping,
    testValve,
    stopDispensing,
    getSettings: getSettingsCmd,
    saveCalibration,
    
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
