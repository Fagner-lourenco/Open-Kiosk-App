import { ConnectionStatus } from '@/services/esp32CommunicationService';
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
