/**
 * ESP32 Dispenser Panel - Painel Unificado de Controle do Dispensador
 * 
 * Este componente fornece:
 * - Conexão multi-protocolo: USB Serial, WiFi (HTTP), Bluetooth (BLE)
 * - Autoconexão com ordem de preferência configurável
 * - Reconexão automática com backoff exponencial
 * - Heartbeat para monitorar conexão
 * - Scan automático de dispositivos na rede e via BLE
 * - Envio de comandos para o ESP32
 * - Recepção e exibição de respostas em tempo real
 * - Testes de válvula e sensor de fluxo
 * - Dispensação de bebidas com progresso ao vivo
 * - Log de comunicação em tempo real
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useESP32AutoConnect } from '@/hooks/useESP32AutoConnect';
import { useESP32Reconnect } from '@/hooks/useESP32Reconnect';
import { useESP32, ESP32LogEntry } from '@/context/ESP32Context';
import {
  Usb,
  Wifi,
  Bluetooth,
  Plug,
  Unplug,
  Beaker,
  Activity,
  Droplet,
  Settings,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Play,
  Square,
  Gauge,
  RefreshCw,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Zap,
} from 'lucide-react';

// Serviços
import esp32Serial, { ESP32Response } from '@/services/esp32SerialService';
import esp32Service, { ESP32Device, ConnectionStatus } from '@/services/esp32CommunicationService';

// ============================================
// TIPOS LOCAIS
// ============================================

type ConnectionProtocol = 'usb' | 'wifi' | 'bluetooth';

// Re-export LogEntry from context for compatibility
type LogEntry = ESP32LogEntry;

interface DispensingState {
  active: boolean;
  orderId: string;
  cup: number;
  totalCups: number;
  ml: number;
  target: number;
  percent: number;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function ESP32DispenserPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const logEndRef = useRef<HTMLDivElement>(null);
  const { settings } = useStoreSettings();
  
  // === USAR CONTEXTO GLOBAL PARA ESTADO PERSISTENTE ===
  const { 
    status: contextStatus, 
    isConnecting: contextIsConnecting,
    logs,
    addLog,
    clearLogs,
    addResponseListener,
  } = useESP32();
  
  // Configurações de autoconexão das settings
  const autoConnectEnabled = settings?.esp32AutoConnect ?? true;
  const connectionOrder = settings?.esp32ConnectionOrder ?? ['usb', 'wifi', 'bluetooth'];
  const heartbeatInterval = settings?.esp32HeartbeatIntervalMs ?? 15000;
  
  // Estados de conexão (sincronizados com contexto)
  const [protocol, setProtocol] = useState<ConnectionProtocol>('usb');
  const isConnected = contextStatus.connected;
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const connectionStatus = contextStatus;
  
  // Estados de scan (WiFi/BLE)
  const [devices, setDevices] = useState<ESP32Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualIp, setManualIp] = useState(settings?.esp32LastWifiIp || '192.168.1.100');
  
  // Estados de operação
  const [isBusy, setIsBusy] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  
  // Estados de dispensação
  const [dispensing, setDispensing] = useState<DispensingState>({
    active: false,
    orderId: '',
    cup: 0,
    totalCups: 0,
    ml: 0,
    target: 0,
    percent: 0,
  });
  
  // Configuração de teste
  const [testMl, setTestMl] = useState(300);
  const [testQuantity, setTestQuantity] = useState(1);
  const [valveDuration, setValveDuration] = useState(2000);
  const [flowDuration, setFlowDuration] = useState(5000);
  
  // Comando manual
  const [manualCommand, setManualCommand] = useState('');
  
  // Nota: logs agora vem do ESP32Context (persistente entre navegações)

  // ============================================
  // HOOKS DE AUTOCONEXÃO E RECONEXÃO
  // ============================================

  // Hook de autoconexão (tenta conectar ao iniciar)
  const { isAutoConnecting, autoConnectResult, connectedVia, retryAutoConnect } = useESP32AutoConnect({
    enabled: autoConnectEnabled,
    connectionOrder,
    onConnected: (status) => {
      // Estado já é atualizado pelo ESP32Context automaticamente
      if (status.type === 'usb') setProtocol('usb');
      else if (status.type === 'wifi') setProtocol('wifi');
      else if (status.type === 'bluetooth') setProtocol('bluetooth');
      
      // Iniciar heartbeat
      esp32Service.startHeartbeat(heartbeatInterval);
    },
    showToasts: true,
  });

  // Hook de reconexão (tenta reconectar quando conexão cair)
  const { isReconnecting, forceReconnect } = useESP32Reconnect({
    enabled: true,
    onReconnected: (status) => {
      // Estado já é atualizado pelo ESP32Context automaticamente
      esp32Service.startHeartbeat(heartbeatInterval);
    },
    onReconnectFailed: () => {
      // Estado já é atualizado pelo ESP32Context automaticamente
    },
    showToasts: true,
  });

  // ============================================
  // UTILITÁRIOS
  // ============================================

  // Nota: addLog e clearLogs agora vêm do ESP32Context

  // Log de status de autoconexão
  useEffect(() => {
    if (autoConnectResult === 'success' && connectedVia) {
      addLog('info', `✅ Autoconexão via ${connectedVia.toUpperCase()}`);
    } else if (autoConnectResult === 'failed') {
      addLog('error', '❌ Autoconexão falhou');
    }
  }, [autoConnectResult, connectedVia, addLog]);

  // ============================================
  // EFEITOS
  // ============================================

  // Verificar suporte ao Web Serial
  useEffect(() => {
    setIsSupported('serial' in navigator);
  }, []);

  // Registrar listener para atualizar protocolo quando conectar via USB
  // NOTA: O processamento de mensagens é feito pelo ESP32Context
  // Este listener apenas atualiza o estado local do protocolo
  useEffect(() => {
    const unsubConnection = esp32Serial.onConnectionChange((connected) => {
      if (connected) {
        setProtocol('usb');
      }
    });

    return () => {
      unsubConnection();
    };
  }, []);

  // REMOVIDO: Listener onMessage duplicado
  // As respostas agora são processadas exclusivamente pelo ESP32Context
  // via handleESP32Response que já está registrado lá

  // Listener para resetar estado de loading quando respostas chegam
  useEffect(() => {
    console.log('[ESP32DispenserPanel] Registrando listener de respostas');
    
    const unsubscribe = addResponseListener((response) => {
      console.log('[ESP32DispenserPanel] Resposta recebida no listener:', response.type);
      
      // Tipos de resposta que indicam fim de operação
      const finishTypes = ['success', 'error', 'pong', 'info', 'flow_test', 'calibration', 'gpio_diagnostic', 'gpio_test', 'settings'];
      
      // Resetar estado de busy quando receber resposta de conclusão
      if (finishTypes.includes(response.type)) {
        console.log('[ESP32DispenserPanel] Resetando isBusy para', response.type);
        setIsBusy(false);
        setCurrentAction(null);
      }
      
      // Status também reseta busy
      if (response.type === 'status') {
        setIsBusy(false);
        if (response.status === 'dispensing') {
          setDispensing({
            active: true,
            orderId: response.orderId || '',
            cup: response.current_cup || 0,
            totalCups: response.total_cups || 0,
            ml: response.ml_dispensed || 0,
            target: response.target_ml || 0,
            percent: response.progress || 0,
          });
        }
      }
      
      // Atualizar progresso de dispensação
      if (response.type === 'progress') {
        setDispensing(prev => ({
          ...prev,
          active: true,
          cup: response.cup || prev.cup,
          ml: response.ml || prev.ml,
          target: response.target || prev.target,
          percent: response.percent || prev.percent,
        }));
      }
      
      // Dispensação concluída
      if (response.stage === 'completed') {
        setDispensing({
          active: false,
          orderId: '',
          cup: 0,
          totalCups: 0,
          ml: 0,
          target: 0,
          percent: 0,
        });
        setIsBusy(false);
        setCurrentAction(null);
        toast({
          title: `🎉 ${t('esp32Dispenser.orderCompleted')}`,
          description: response.message,
        });
      }
      
      // Mostrar toasts para feedback
      switch (response.type) {
        case 'pong':
          toast({
            title: '🏓 Pong!',
            description: `ESP32 ${t('esp32.deviceResponded')} (${response.timestamp}ms)`,
          });
          break;
        case 'success':
          toast({
            title: `✅ ${t('common.success')}`,
            description: response.message,
          });
          break;
        case 'error':
          toast({
            title: `❌ ${t('common.error')}`,
            description: response.message,
            variant: 'destructive',
          });
          break;
        case 'status':
          toast({
            title: `📊 Status ESP32`,
            description: `${response.device || 'ESP32'} - ${response.status || 'ready'}`,
          });
          break;
        case 'flow_test':
          toast({
            title: `💧 ${t('esp32Dispenser.flowTest')}`,
            description: `${response.pulses} pulsos = ${(response as any).ml_calculated?.toFixed(1) || 0}ml`,
          });
          break;
        case 'calibration':
          toast({
            title: `🔧 Calibração`,
            description: `${response.pulses} pulsos em ${response.duration_ms}ms`,
          });
          break;
        case 'gpio_diagnostic':
        case 'gpio_test':
          const results = (response as any).results || {};
          const gpioOk = (response as any).gpio_ok || results.gpio5_valve;
          toast({
            title: gpioOk ? '✅ GPIO OK' : '⚠️ GPIO com problema',
            description: (response as any).recommendation || 'Verifique os logs para detalhes',
            variant: gpioOk ? 'default' : 'destructive',
          });
          break;
      }
    });
    
    return () => unsubscribe();
  }, [addResponseListener, toast, t, setDispensing, setIsBusy, setCurrentAction]);

  // Auto-scroll do log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ============================================
  // FUNÇÕES AUXILIARES DE UI
  // ============================================

  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'bluetooth':
        return <Bluetooth className="w-5 h-5 text-blue-500" />;
      case 'wifi':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'usb':
        return <Usb className="w-5 h-5 text-orange-500" />;
      default:
        return <XCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSignalIcon = (rssi?: number) => {
    if (!rssi) return <Signal className="w-4 h-4 text-gray-400" />;
    if (rssi > -50) return <SignalHigh className="w-4 h-4 text-green-500" />;
    if (rssi > -70) return <SignalMedium className="w-4 h-4 text-yellow-500" />;
    return <SignalLow className="w-4 h-4 text-red-500" />;
  };

  // ============================================
  // AÇÕES DE CONEXÃO - USB
  // ============================================

  const handleConnectUSB = async () => {
    setIsConnecting(true);
    try {
      const success = await esp32Serial.connect();
      if (success) {
        toast({
          title: `✅ ${t('esp32.connected')}`,
          description: t('esp32Dispenser.connectedUsb'),
        });
        setTimeout(() => esp32Serial.ping(), 500);
      } else {
        toast({
          title: `❌ ${t('esp32.connectionFailed')}`,
          description: t('esp32Dispenser.checkUsbPort'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: `❌ ${t('common.error')}`,
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // ============================================
  // AÇÕES DE CONEXÃO - WiFi/BLE
  // ============================================

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);

    try {
      let foundDevices: ESP32Device[] = [];
      
      if (protocol === 'wifi') {
        // Verificar se está no navegador
        if (esp32Service.isWeb()) {
          toast({
            title: '⚠️ ' + t('esp32.limitation'),
            description: t('esp32.wifiScanLimitedBrowser'),
            variant: 'destructive',
          });
          setScanning(false);
          return;
        }
        foundDevices = await esp32Service.scanWifiDevices();
      } else if (protocol === 'bluetooth') {
        foundDevices = await esp32Service.scanBluetoothDevices();
      }
      
      setDevices(foundDevices);

      if (foundDevices.length === 0) {
        toast({
          title: t('common.info'),
          description: protocol === 'bluetooth' 
            ? t('esp32.noBluetoothDevices')
            : t('esp32.noDevicesFound'),
        });
      } else {
        toast({
          title: t('common.success'),
          description: `${foundDevices.length} ${t('esp32.devicesFound').toLowerCase()}`,
        });
      }
    } catch (error: any) {
      console.error('[Scan] Erro:', error);
      toast({
        title: t('common.error'),
        description: error.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleConnectDevice = async (device: ESP32Device) => {
    setIsConnecting(true);

    try {
      const success = await esp32Service.connect(device);

      if (success) {
        // Estado de conexão é atualizado automaticamente pelo ESP32Context
        addLog('info', `✅ ${t('esp32.connected')}: ${device.name}`);
        toast({
          title: t('common.success'),
          description: `${t('esp32.connected')}: ${device.name}`,
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('esp32.connectionFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleManualConnect = async () => {
    if (!manualIp) return;
    setIsConnecting(true);

    // Timeout visual de 10 segundos
    const timeoutId = setTimeout(() => {
      setIsConnecting(false);
      toast({
        title: '⏱️ Timeout',
        description: t('esp32.connectionTimeout'),
        variant: 'destructive',
      });
    }, 10000);

    try {
      const success = await esp32Service.connectWifi(manualIp);
      clearTimeout(timeoutId);

      if (success) {
        // Estado de conexão é atualizado automaticamente pelo ESP32Context
        addLog('info', `✅ ${t('esp32.connected')}: ${manualIp}`);
        toast({
          title: t('common.success'),
          description: `${t('esp32.connected')}: ${manualIp}`,
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('esp32.connectionFailed'),
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('[WiFi] Erro:', error);
      toast({
        title: t('common.error'),
        description: error.message || t('esp32.connectionFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // ============================================
  // DESCONEXÃO UNIFICADA
  // ============================================

  const handleDisconnect = async () => {
    if (protocol === 'usb') {
      await esp32Serial.disconnect();
    } else {
      await esp32Service.disconnect();
    }
    
    // Estado de conexão é atualizado automaticamente pelo ESP32Context
    addLog('info', `🔌 ${t('esp32.disconnected')}`);
    toast({
      title: `🔌 ${t('esp32.disconnected')}`,
      description: t('esp32Dispenser.connectionClosed'),
    });
  };

  // ============================================
  // AÇÕES DE COMANDO - UNIFICADAS
  // ============================================

  const sendCommand = async (action: string, params?: object): Promise<boolean> => {
    try {
      if (protocol === 'usb') {
        const command = { action, ...params } as any;
        addLog('sent', JSON.stringify(command));
        return await esp32Serial.sendCommand(command);
      } else {
        const payload = { action, ...params };
        addLog('sent', JSON.stringify(payload));
        const result = await esp32Service.sendCommand(action, payload);
        
        // Se falhou no WiFi, pode ser problema de CORS
        if (!result && protocol === 'wifi' && esp32Service.isWeb()) {
          addLog('error', t('esp32.corsWarning'));
        }
        return result;
      }
    } catch (error: any) {
      addLog('error', error.message || String(error));
      setIsBusy(false);
      return false;
    }
  };

  const handlePing = async () => {
    if (!isConnected) return;
    setIsBusy(true);
    await sendCommand('ping');
  };

  const handleStatus = async () => {
    if (!isConnected) return;
    setIsBusy(true);
    await sendCommand('status');
    // Timeout de segurança
    setTimeout(() => setIsBusy(false), 5000);
  };

  const handleTestValve = async () => {
    if (!isConnected) return;
    setIsBusy(true);
    setCurrentAction('test_valve');
    await sendCommand('test_valve', { duration: valveDuration });
    
    // Timeout de segurança - resetar após duração + 3s se resposta não chegar
    setTimeout(() => {
      setIsBusy(prev => {
        if (prev) {
          console.warn('[ESP32DispenserPanel] Timeout valve - resetando estado');
          setCurrentAction(null);
          return false;
        }
        return prev;
      });
    }, valveDuration + 3000);
  };

  const handleTestFlow = async () => {
    if (!isConnected) return;
    setIsBusy(true);
    setCurrentAction('test_flow');
    await sendCommand('test_flow', { duration: flowDuration });
    
    // Timeout de segurança - resetar após duração + 3s se resposta não chegar
    setTimeout(() => {
      setIsBusy(prev => {
        if (prev) {
          console.warn('[ESP32DispenserPanel] Timeout de segurança - resetando estado');
          setCurrentAction(null);
          return false;
        }
        return prev;
      });
    }, flowDuration + 3000);
  };

  const handleDispense = async () => {
    if (!isConnected) return;
    const orderId = `TEST-${Date.now()}`;
    setIsBusy(true);
    setCurrentAction('release_drink');
    setDispensing({
      active: true,
      orderId,
      cup: 1,
      totalCups: testQuantity,
      ml: 0,
      target: testMl,
      percent: 0,
    });
    await sendCommand('release_drink', {
      orderId,
      mlPerUnit: testMl,
      quantity: testQuantity,
      sizeLabel: `${t('esp32Dispenser.test')} ${testMl}ml`,
    });
  };

  const handleStop = async () => {
    if (!isConnected) return;
    await sendCommand('stop');
    setDispensing({
      active: false,
      orderId: '',
      cup: 0,
      totalCups: 0,
      ml: 0,
      target: 0,
      percent: 0,
    });
    setIsBusy(false);
    setCurrentAction(null);
  };

  const handleCalibrate = async () => {
    if (!isConnected) return;
    setIsBusy(true);
    setCurrentAction('calibrate');
    
    // Timeout dinâmico: flowDuration + 2s de margem para processamento
    // Isso funciona para qualquer duração de calibração
    const TIMEOUT_MARGIN = 2000; // 2 segundos de margem
    const timeoutDuration = flowDuration + TIMEOUT_MARGIN;
    
    // Registrar listener LOCAL ANTES de enviar comando
    // Garante que o listener está ativo quando a resposta chegar
    const unsubscribeLocal = addResponseListener((response) => {
      if (response.type === 'calibration') {
        console.log('[ESP32DispenserPanel] Resposta de calibração recebida no listener local, resetando isBusy');
        setIsBusy(false);
        setCurrentAction(null);
        clearTimeout(timeoutId);
        unsubscribeLocal();
      }
    });
    
    // Timeout de fallback: se resposta não chegar dentro do tempo esperado
    // Isso evita que o botão fique travado em caso de perda de conexão
    const timeoutId = setTimeout(() => {
      console.warn(`[ESP32DispenserPanel] Timeout na calibração (${timeoutDuration}ms), resetando isBusy`);
      setIsBusy(false);
      setCurrentAction(null);
      unsubscribeLocal();
      toast({
        title: '⏱️ Timeout',
        description: `Calibração não respondeu em ${timeoutDuration}ms (duração: ${flowDuration}ms + ${TIMEOUT_MARGIN}ms)`,
        variant: 'destructive',
      });
    }, timeoutDuration);
    
    try {
      await sendCommand('calibrate', { duration: flowDuration });
    } catch (error) {
      console.error('[ESP32DispenserPanel] Erro ao enviar comando calibrate:', error);
      setIsBusy(false);
      setCurrentAction(null);
      clearTimeout(timeoutId);
      unsubscribeLocal();
      toast({
        title: '❌ Erro',
        description: 'Erro ao enviar comando de calibração',
        variant: 'destructive',
      });
    }
  };

  const handleManualSend = async () => {
    if (!isConnected || !manualCommand.trim()) return;
    addLog('sent', manualCommand);
    
    if (protocol === 'usb') {
      await esp32Serial.sendRaw(manualCommand);
    } else {
      await esp32Service.sendCommand(manualCommand);
    }
    setManualCommand('');
  };

  // ============================================
  // RENDERIZAÇÃO
  // ============================================

  if (!isSupported && protocol === 'usb') {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            {t('esp32Dispenser.browserNotSupported')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">
            {t('esp32Dispenser.webSerialNotSupported')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Seleção de Protocolo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getConnectionIcon(connectionStatus.type)}
              <div>
                <CardTitle className="text-lg">{t('esp32Dispenser.title')}</CardTitle>
                <CardDescription>{t('esp32Dispenser.description')}</CardDescription>
              </div>
            </div>
            <Badge variant={isConnected ? "default" : "secondary"} className="text-sm px-3 py-1">
              {isConnected ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {t('esp32.connected')}
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('esp32.disconnected')}
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs de Protocolo */}
          <Tabs value={protocol} onValueChange={(v) => setProtocol(v as ConnectionProtocol)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="usb" className="flex items-center gap-2">
                <Usb className="w-4 h-4" />
                USB
              </TabsTrigger>
              <TabsTrigger value="wifi" className="flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                WiFi
              </TabsTrigger>
              <TabsTrigger value="bluetooth" className="flex items-center gap-2">
                <Bluetooth className="w-4 h-4" />
                Bluetooth
              </TabsTrigger>
            </TabsList>

            {/* USB Serial */}
            <TabsContent value="usb" className="space-y-4">
              {!isConnected ? (
                <div className="space-y-3">
                  {/* Botão de Reconexão Automática (sem popup) */}
                  <Button 
                    onClick={async () => {
                      setIsConnecting(true);
                      addLog('info', '🔄 Tentando reconexão automática...');
                      try {
                        const success = await esp32Serial.tryAutoReconnect();
                        if (success) {
                          toast({
                            title: '✅ Reconectado',
                            description: 'ESP32 reconectado automaticamente',
                          });
                        } else {
                          toast({
                            title: '⚠️ Sem porta autorizada',
                            description: 'Use "Conectar USB" para selecionar a porta',
                            variant: 'destructive',
                          });
                        }
                      } finally {
                        setIsConnecting(false);
                      }
                    }} 
                    disabled={isConnecting} 
                    variant="outline"
                    className="w-full"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Reconectando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reconectar Automaticamente
                      </>
                    )}
                  </Button>
                  
                  {/* Botão de Conexão Manual (com popup de seleção) */}
                  <Button onClick={handleConnectUSB} disabled={isConnecting} className="w-full">
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('esp32Dispenser.connecting')}
                      </>
                    ) : (
                      <>
                        <Plug className="w-4 h-4 mr-2" />
                        {t('esp32Dispenser.connectUsb')}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    {t('esp32Dispenser.usbHint')}
                  </p>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button onClick={handlePing} variant="outline" disabled={isBusy}>
                    <Activity className="w-4 h-4 mr-2" />
                    Ping
                  </Button>
                  <Button onClick={handleStatus} variant="outline" disabled={isBusy}>
                    <Gauge className="w-4 h-4 mr-2" />
                    Status
                  </Button>
                  <Button onClick={handleDisconnect} variant="destructive">
                    <Unplug className="w-4 h-4 mr-2" />
                    {t('esp32.disconnect')}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* WiFi */}
            <TabsContent value="wifi" className="space-y-4">
              {!isConnected ? (
                <>
                  <Button onClick={handleScan} disabled={scanning} className="w-full">
                    {scanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('esp32.scanning')}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('esp32.scanDevices')}
                      </>
                    )}
                  </Button>

                  {/* Lista de dispositivos WiFi */}
                  {devices.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                      {devices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between p-2 border rounded hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-green-500" />
                            <span className="text-sm">{device.ipAddress || device.name}</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleConnectDevice(device)}
                            disabled={isConnecting}
                          >
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('uart.connect')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Conexão manual IP */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Input
                      placeholder="192.168.1.100"
                      value={manualIp}
                      onChange={(e) => setManualIp(e.target.value)}
                    />
                    <Button onClick={handleManualConnect} disabled={isConnecting || !manualIp}>
                      {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">{t('esp32.enterIp')}</p>
                </>
              ) : (
                <div className="flex gap-3">
                  <Button onClick={handlePing} variant="outline" disabled={isBusy}>
                    <Activity className="w-4 h-4 mr-2" />
                    Ping
                  </Button>
                  <Button onClick={handleStatus} variant="outline" disabled={isBusy}>
                    <Gauge className="w-4 h-4 mr-2" />
                    Status
                  </Button>
                  <Button onClick={handleDisconnect} variant="destructive">
                    <Unplug className="w-4 h-4 mr-2" />
                    {t('esp32.disconnect')}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Bluetooth */}
            <TabsContent value="bluetooth" className="space-y-4">
              {!isConnected ? (
                <>
                  <Button onClick={handleScan} disabled={scanning} className="w-full">
                    {scanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('esp32.scanning')}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('esp32.scanDevices')}
                      </>
                    )}
                  </Button>

                  {/* Lista de dispositivos BLE */}
                  {devices.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                      {devices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between p-2 border rounded hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <Bluetooth className="w-4 h-4 text-blue-500" />
                            <span className="text-sm">{device.name}</span>
                            {getSignalIcon(device.rssi)}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleConnectDevice(device)}
                            disabled={isConnecting}
                          >
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('uart.connect')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 text-center">
                    {t('esp32.tipBluetooth')}
                  </p>
                </>
              ) : (
                <div className="flex gap-3">
                  <Button onClick={handlePing} variant="outline" disabled={isBusy}>
                    <Activity className="w-4 h-4 mr-2" />
                    Ping
                  </Button>
                  <Button onClick={handleStatus} variant="outline" disabled={isBusy}>
                    <Gauge className="w-4 h-4 mr-2" />
                    Status
                  </Button>
                  <Button onClick={handleDisconnect} variant="destructive">
                    <Unplug className="w-4 h-4 mr-2" />
                    {t('esp32.disconnect')}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Progress de Dispensação */}
      {dispensing.active && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Beaker className="w-5 h-5 text-blue-600 animate-pulse" />
                <span className="font-medium">{t('esp32Dispenser.dispensing')}</span>
              </div>
              <Button onClick={handleStop} variant="destructive" size="sm">
                <Square className="w-4 h-4 mr-1" />
                {t('tests.stop')}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('esp32Dispenser.cup')} {dispensing.cup} {t('esp32Dispenser.of')} {dispensing.totalCups}</span>
                <span>{dispensing.ml}ml / {dispensing.target}ml ({dispensing.percent}%)</span>
              </div>
              <Progress value={dispensing.percent} className="h-3" />
              <p className="text-xs text-gray-500">{t('esp32Dispenser.order')}: {dispensing.orderId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Painéis de Controle (só aparecem quando conectado) */}
      {isConnected && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Painel de Dispensação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5" />
              {t('esp32Dispenser.dispensation')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ml">{t('esp32Dispenser.volume')} (ml)</Label>
                <Input
                  id="ml"
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={testMl}
                  onChange={(e) => setTestMl(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="qty">{t('esp32Dispenser.cups')}</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  max={10}
                  value={testQuantity}
                  onChange={(e) => setTestQuantity(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
            
            {/* Presets */}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={() => { setTestMl(200); setTestQuantity(1); }}>
                200ml
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setTestMl(300); setTestQuantity(1); }}>
                300ml
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setTestMl(500); setTestQuantity(1); }}>
                500ml
              </Button>
            </div>

            <Button
              onClick={handleDispense}
              disabled={!isConnected || isBusy || dispensing.active}
              className="w-full"
            >
              {isBusy && currentAction === 'release_drink' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('esp32Dispenser.sending')}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {t('esp32Dispenser.dispense')} {testMl}ml × {testQuantity}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Painel de Testes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t('esp32Dispenser.hardwareTests')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Teste de Válvula */}
            <div className="space-y-2">
              <Label>{t('esp32Dispenser.valveTest')}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={500}
                  max={10000}
                  step={500}
                  value={valveDuration}
                  onChange={(e) => setValveDuration(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-gray-500 self-center">ms</span>
                <Button
                  onClick={handleTestValve}
                  disabled={!isConnected || isBusy}
                  variant="outline"
                  className="flex-1"
                >
                  {isBusy && currentAction === 'test_valve' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Droplet className="w-4 h-4 mr-2" />
                      {t('esp32Dispenser.testValve')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Teste de Fluxo */}
            <div className="space-y-2">
              <Label>{t('esp32Dispenser.flowSensorTest')}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1000}
                  max={30000}
                  step={1000}
                  value={flowDuration}
                  onChange={(e) => setFlowDuration(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-gray-500 self-center">ms</span>
                <Button
                  onClick={handleTestFlow}
                  disabled={!isConnected || isBusy}
                  variant="outline"
                  className="flex-1"
                >
                  {isBusy && currentAction === 'test_flow' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Activity className="w-4 h-4 mr-2" />
                      {t('esp32Dispenser.testFlow')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Calibração */}
            <Button
              onClick={handleCalibrate}
              disabled={!isConnected || isBusy}
              variant="secondary"
              className="w-full"
            >
              {isBusy && currentAction === 'calibrate' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Gauge className="w-4 h-4 mr-2" />
              )}
              {t('esp32Dispenser.calibratePump')} ({flowDuration / 1000}s)
            </Button>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Terminal / Log de Comunicação */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              {t('esp32Dispenser.communicationLog')}
            </CardTitle>
            <div className="flex gap-2">
              <Button onClick={clearLogs} variant="ghost" size="sm">
                <Trash2 className="w-4 h-4 mr-1" />
                {t('esp32Dispenser.clear')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Comando Manual */}
          <div className="flex gap-2">
            <Input
              placeholder='{"action":"ping"}'
              value={manualCommand}
              onChange={(e) => setManualCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSend()}
              className="font-mono text-sm"
            />
            <Button onClick={handleManualSend} disabled={!isConnected || !manualCommand.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* Log */}
          <div className="bg-gray-900 text-gray-100 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <span className="text-gray-500">{t('esp32Dispenser.awaitingCommunication')}</span>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="py-0.5">
                  <span className="text-gray-500">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  {' '}
                  <span className={
                    log.type === 'sent' ? 'text-blue-400' :
                    log.type === 'received' ? 'text-green-400' :
                    log.type === 'error' ? 'text-red-400' :
                    'text-yellow-400'
                  }>
                    {log.type === 'sent' ? '→' : log.type === 'received' ? '←' : '•'}
                  </span>
                  {' '}
                  <span className="break-all">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Dicas de Conexão */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <h4 className="font-semibold text-blue-900 mb-3">💡 {t('esp32.tips')}:</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
            <li><strong>USB:</strong> {t('esp32Dispenser.tipUsbDetail')}</li>
            <li><strong>WiFi:</strong> {t('esp32.tipWifi')}</li>
            <li><strong>Bluetooth:</strong> {t('esp32.tipBluetooth')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default ESP32DispenserPanel;
