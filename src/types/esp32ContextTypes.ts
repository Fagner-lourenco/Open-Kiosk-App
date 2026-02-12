import { ConnectionStatus, ConnectionSupervisorStatus } from '@/services/esp32CommunicationService';
import { ESP32Response } from '@/services/esp32SerialService';

// 🆕 Multi-Tap: Status de cada torneira
export interface TapStatus {
    id: number;
    isDispensing: boolean;
    orderId?: string;
    currentCup: number;
    totalCups: number;
    mlDispensed: number;
    targetMl: number;
    flowStarted: boolean;
    progress: number;
}

// 🆕 Multi-Tap: Configuração de cada torneira
export interface TapConfig {
    id: number;
    valvePin: number;
    sensorPin: number;
    pulsosPorLitro: number;
    mlPorSegundo: number;
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
    /** 🆕 Multi-Tap: ID da torneira que está dispensando */
    tapId?: number;
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

export interface ESP32State {
    // Status de conexão
    status: ConnectionStatus;
    supervisorStatus: ConnectionSupervisorStatus;
    isConnecting: boolean;
    lastError: string | null;

    // Dispensação
    isDispensing: boolean;
    currentProgress: ESP32DispensingProgress | null;

    // Configurações do ESP32
    settings: ESP32Settings | null;

    // 🆕 Multi-Tap
    numTaps: number;
    taps: TapStatus[];
    selectedTapId: number;
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
    connect: (device: any) => Promise<boolean>; // ESP32Device type to be imported or generic
    connectUSB: () => Promise<boolean>;
    connectWifi: (ip: string) => Promise<boolean>;
    disconnect: () => Promise<void>;
    reconnectNow: (reason?: string) => Promise<boolean>;

    // 🆕 Força sincronização do status de conexão com o serviço
    refreshConnectionStatus: () => void;

    // Comandos
    sendCommand: (command: string, data?: object) => Promise<boolean>;
    releaseDrink: (orderId: string, mlPerUnit: number, quantity?: number, sizeLabel?: string, tapId?: number) => Promise<boolean>;
    ping: () => Promise<boolean>;
    testValve: (durationMs?: number, tapId?: number) => Promise<boolean>;
    stopDispensing: (tapId?: number) => Promise<boolean>;
    getSettings: () => Promise<boolean>;
    saveCalibration: (pulsosPorLitro: number, mlPorSegundo: number, tapId?: number) => Promise<boolean>;

    // 🆕 Multi-Tap
    setSelectedTapId: (tapId: number) => void;
    getTapStatus: (tapId: number) => TapStatus | undefined;
    refreshTaps: () => Promise<void>;

    // Callbacks para respostas
    addResponseListener: (callback: (response: ESP32Response) => void) => () => void;

    // Logs persistentes
    logs: ESP32LogEntry[];
    addLog: (type: ESP32LogEntry['type'], message: string, json?: ESP32Response) => void;
    clearLogs: () => void;
}

// ===== NOVO: DeviceStatus para UI administrativa =====

export type ConnectionState = 
  | 'unconfigured'    // Nenhum device pareado
  | 'connecting'      // em tentativa (auto-retry)
  | 'online'          // Conectado e respondendo
  | 'offline'         // Pareado mas sem resposta (heartbeat falhou)
  | 'error';          // Erro de configuração ou conexão crítica

export type ConnectionType = 
  | 'none'
  | 'usb'
  | 'ble'
  | 'wifi';

export interface DeviceStatus {
  // Estado principal (UI-facing)
  state: ConnectionState;
  type: ConnectionType;
  
  // Timestamps
  lastSeenAt: Date | null;        // Último heartbeat bem-sucedido
  lastSyncAt: Date | null;        // Última escrita em Firestore
  lastErrorAt: Date | null;       // Último erro registrado
  
  // Hardware Info (pode ser null se state !== 'online')
  firmwareVersion: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  deviceName?: string;
  
  // Mensagem de UI (user-friendly)
  message: string;                // Ex.: "Aguardando conexão USB...", "Online", "Não configurado"
  
  // Debug
  lastError?: string;
  connectionAttempts?: number;
}

// Helper para calcular minutos passados
function getMinutesAgo(date: Date): number {
  if (!date) return 0;
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

// ===== CONVERSOR: Firestore data → DeviceStatus =====
/**
 * Mapeia dados do Firestore (flat ou nested) para estado UI consistente.
 * Aceita AMBOS os formatos (Kiosk flat + Admin nested).
 * Retorna sempre um DeviceStatus com estado único.
 */
export function mapFirestoreToDeviceStatus(data: any): DeviceStatus {
  // Se data é null, undefined ou {}
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return {
      state: 'unconfigured',
      type: 'none',
      lastSeenAt: null,
      lastSyncAt: null,
      lastErrorAt: null,
      firmwareVersion: null,
      macAddress: null,
      ipAddress: null,
      message: 'Dispositivo não configurado. Escaneie QR ou conecte USB.',
      lastError: undefined
    };
  }

  // Normalizar dados de ambos os formatos
  // Formato 1 (Kiosk/hardwareStatusService - flat): esp32Connected, esp32Ip, macAddress
  // Formato 2 (Admin/StoreSettingsTab - nested): esp32.isConnected, esp32.ipAddress
  const isConnected = data.isConnected ?? data.esp32Connected ?? false;
  const connectionType = data.type ?? data.esp32Type ?? 'wifi';
  const ipAddress = data.ipAddress ?? data.esp32Ip;
  const lastSeenRaw = data.lastSeenAt ?? data.lastSeen ?? data.lastHeartbeat;
  const lastSeen = lastSeenRaw instanceof Date ? lastSeenRaw : (lastSeenRaw?.toDate?.() ?? null);
  const lastError = data.lastError ?? null;

  const hasSignal = Boolean(
    isConnected ||
    lastSeen ||
    data.firmwareVersion ||
    data.macAddress ||
    ipAddress ||
    lastError
  );

  if (!hasSignal) {
    return {
      state: 'unconfigured',
      type: 'none',
      lastSeenAt: null,
      lastSyncAt: null,
      lastErrorAt: null,
      firmwareVersion: null,
      macAddress: null,
      ipAddress: null,
      message: 'Dispositivo não configurado. Escaneie QR ou conecte USB.',
      lastError: undefined
    };
  }

  // Se esp32Connected === true
  if (isConnected === true) {
    return {
      state: 'online',
      type: (connectionType as ConnectionType) || 'wifi',
      lastSeenAt: lastSeen,
      lastSyncAt: new Date(), // Firestore read time (aproximado)
      lastErrorAt: null,
      firmwareVersion: data.firmwareVersion ?? null,
      macAddress: data.macAddress ?? null,
      ipAddress: ipAddress ?? null,
      message: `Online • ${String(connectionType).toUpperCase()}`,
      lastError: lastError ?? undefined
    };
  }

  // Se foi conectado antes mas agora está offline (>1min sem heartbeat)
  if (lastSeen instanceof Date && lastSeen < new Date(Date.now() - 60_000)) {
    return {
      state: 'offline',
      type: (connectionType as ConnectionType) || 'wifi',
      lastSeenAt: lastSeen,
      lastSyncAt: new Date(),
      lastErrorAt: lastError && new Date(),
      firmwareVersion: data.firmwareVersion ?? null,  // Mantém dados antigos
      macAddress: data.macAddress ?? null,
      ipAddress: ipAddress ?? null,
      message: `Offline (último visto há ${getMinutesAgo(lastSeen)}min)`,
      lastError: lastError ?? undefined
    };
  }

  // Conectando (tentativa em andamento ou estado indeterminado)
  return {
    state: 'connecting',
    type: (connectionType as ConnectionType) || 'wifi',
    lastSeenAt: lastSeen,
    lastSyncAt: new Date(),
    lastErrorAt: null,
    firmwareVersion: null,
    macAddress: null,
    ipAddress: null,
    message: 'Conectando...',
    lastError: lastError ?? undefined
  };
}
