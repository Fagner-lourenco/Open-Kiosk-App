import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import esp32Serial from './esp32SerialService';  // ðŸ”§ FIX: Fallback para USB Web Serial
import type { ESP32Response } from './esp32SerialService';
import { TapConfig } from '@/types/store';
import { systemLogService } from './systemLogService';
import { buildLocalHttpUrl } from '@/utils/localNetworkGuard';

// Plugin USB Serial para Android (capacitor-usb-serial-plugin)
// ImportaÃ§Ã£o dinÃ¢mica para nÃ£o quebrar na web
let UsbSerial: any = null;
let usbSerialLoadPromise: Promise<void> | null = null;
const ensureUsbSerialPluginLoaded = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform() || UsbSerial) {
    return;
  }

  if (usbSerialLoadPromise) {
    return usbSerialLoadPromise;
  }

  usbSerialLoadPromise = import('capacitor-usb-serial-plugin')
    .then((module) => {
      UsbSerial = module.UsbSerial;
      console.log('[ESP32] Plugin USB Serial carregado com sucesso');
    })
    .catch((error) => {
      console.warn('[ESP32] Plugin USB Serial nÃ£o disponÃ­vel:', error);
    })
    .finally(() => {
      usbSerialLoadPromise = null;
    });

  return usbSerialLoadPromise;
};
const getUsbSerialPlugin = () => UsbSerial;

type USBPluginListenerHandle = { remove: () => Promise<void> };

interface NativeUSBDeviceDescriptor {
  deviceId: number;
  vendorId: number;
  productId: number;
  productName: string;
  portNum: number;
}

class USBNativeConnectionError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'USBNativeConnectionError';
    this.code = code;
    this.details = details;
  }
}

// UUIDs padrÃ£o para ESP32 BLE
const ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const ESP32_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Configurações do dispositivo ESP32 (DEVE COINCIDIR COM firmware.ino)
// Exportadas para uso em outros componentes
export const ESP32_DEVICE_NAME = 'Kiosk_Bier';      // Nome BLE do ESP32
export const ESP32_WIFI_SSID = 'Kiosk_Bier';        // SSID do Access Point WiFi
// 🔒 TODO Bug-22 (CWE-798): WiFi password is hardcoded here AND in firmware.ino.
// Should be moved to per-store Firestore config (e.g., stores/{storeId}/deviceConfig)
// and provisioned to firmware via NVS at setup time. Low urgency since WiFi AP is
// local-only (direct-connect), but should be addressed before multi-tenant deployments.
export const ESP32_WIFI_PASSWORD = 'bier2026';      // Senha do WiFi (para referência)

// ðŸ†• ConfiguraÃ§Ã£o dinÃ¢mica de IP WiFi (permite override)
let ESP32_DEFAULT_IP = '192.168.4.1';               // IP padrÃ£o do Access Point (configurÃ¡vel)

/**
 * ðŸ†• Permite configurar o IP padrÃ£o do ESP32 em runtime
 * Ãštil para setups com subnets diferentes
 */
export const setESP32WiFiIP = (ip: string): void => {
  ESP32_DEFAULT_IP = ip;
  console.log(`[ESP32Config] WiFi IP atualizado para: ${ip}`);
  localStorage.setItem('esp32_wifi_ip', ip);
}

/**
 * Carrega IP do WiFi do storage na inicializaÃ§Ã£o
 */
export const loadESP32WiFiIP = (): string => {
  const savedIP = localStorage.getItem('esp32_wifi_ip');
  if (savedIP) {
    ESP32_DEFAULT_IP = savedIP;
    console.log(`[ESP32Config] WiFi IP carregado do storage: ${savedIP}`);
  }
  return ESP32_DEFAULT_IP;
}

/**
 * Getter para acessar IP atual
 */
export const getESP32WiFiIP = (): string => {
  return ESP32_DEFAULT_IP;
}

// Chave de persistÃªncia para Ãºltima conexÃ£o
const LAST_CONNECTION_KEY = 'esp32_last_connection';

// Baudrate padrÃ£o (115200 conforme firmware v2.0)
const DEFAULT_BAUDRATE = 115200;

// ConfiguraÃ§Ã£o de heartbeat (melhores prÃ¡ticas)
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;  // 15 segundos
const HEARTBEAT_FAIL_THRESHOLD = 3;           // 3 falhas = desconexÃ£o
const SUPERVISOR_HEALTHCHECK_INTERVAL_MS = 12000;  // 12s (era 7s — reduzido para economizar rádio BLE e evitar kill da MIUI)
const SUPERVISOR_HEALTHCHECK_FAIL_THRESHOLD = 3;   // 3 falhas = 36s sem resposta antes de dropar
// KIO-14 fix: increased base delay and reduced attempts to prevent reconnect storm
const SUPERVISOR_BASE_DELAY_MS = 2000;
const SUPERVISOR_MAX_DELAY_MS = 60000;
const SUPERVISOR_BACKOFF_JITTER_RATIO = 0.35;
const SUPERVISOR_PERSISTENT_FAILURE_ATTEMPTS = 10;
const SUPERVISOR_PERSISTENT_FAILURE_DELAY_MS = 300000; // 5 min entre tentativas após persistent_failure
const RECONNECT_NOW_COOLDOWN_MS = 5000; // Cooldown entre chamadas de reconnectNow
const USB_NATIVE_CONNECT_TIMEOUT_MS = 8000;
const USB_ENUMERATION_TIMEOUT_MS = 3000;
const USB_ERROR_COOLDOWN_MS = 3000; // Cooldown após erro USB antes de tentar reconectar
// 🔧 FIX Bug #12: Aumentado de 6s para 18s para cobrir dialog de permissão USB Android (MIUI: até 15s).
// Sem isso, quando o USB connect demora mais que 6s, o callback BLE de desconexão intencional
// dispara dentro da janela e inicia reconexão BLE concorrente com o USB já em andamento.
const BLE_DISCONNECT_SUPPRESS_MS = 18000; // Janela para ignorar callback BLE após disconnect intencional
const ESP32_USB_VENDOR_IDS = new Set<number>([
  0x303A, // Espressif
  0x10C4, // Silicon Labs (CP210x)
  0x1A86, // QinHeng (CH340)
  0x0403, // FTDI
]);

// Interface para Web Serial API (compatibilidade)
interface WebSerial {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
}

// Helper para acessar Web Serial API de forma type-safe
const getWebSerial = (): WebSerial | undefined => {
  if ('serial' in navigator) {
    return (navigator as unknown as { serial: WebSerial }).serial;
  }
  return undefined;
};

export type ConnectionType = 'bluetooth' | 'wifi' | 'usb' | 'none';

// Interface para persistÃªncia de Ãºltima conexÃ£o
export interface LastConnectionInfo {
  type: ConnectionType;
  deviceId?: string;
  ipAddress?: string;
  deviceName?: string;
  timestamp: number;
}

export interface ESP32Device {
  id: string;
  name: string;
  type: ConnectionType;
  rssi?: number;
  ipAddress?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  type: ConnectionType;
  deviceName?: string;
  deviceId?: string;
}

export interface ConnectionSupervisorStatus {
  active: boolean;
  state: 'idle' | 'connected' | 'reconnecting' | 'persistent_failure';
  attempt: number;
  nextDelayMs: number;
  reason: string;
  lastOkAt: number | null;
  consecutiveHealthFailures: number;
  transport: ConnectionType;
  deviceId?: string;
}

// Callback para eventos de conexÃ£o
export type ConnectionEventCallback = (status: ConnectionStatus) => void;
export type HeartbeatFailCallback = (consecutiveFailures: number) => void;
export type ConnectionSupervisorCallback = (status: ConnectionSupervisorStatus) => void;

class ESP32CommunicationService {
  private connectionStatus: ConnectionStatus = {
    connected: false,
    type: 'none',
  };

  private connectedDevice: ESP32Device | null = null;
  private esp32IpAddress: string = '';
  private serialPort: SerialPort | null = null;

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatFailCount: number = 0;
  private onHeartbeatFail: HeartbeatFailCallback | null = null;

  // Evento de conexÃ£o
  private connectionListeners: Set<ConnectionEventCallback> = new Set();

  // ðŸ†• Callbacks para dados recebidos via BLE
  private bleDataListeners: Set<(data: string) => void> = new Set();

  // ðŸ†• Callbacks para dados recebidos via USB OTG nativo
  private usbDataListeners: Set<(data: string) => void> = new Set();

  // ðŸ†• Buffer para reconstruir mensagens BLE fragmentadas
  private bleReceiveBuffer: string = '';
  private usbReceiveBuffer: string = '';

  // ðŸ†• Flag para inicializaÃ§Ã£o idempotente do BleClient (WEB)
  private bleInitialized: boolean = false;

  // Supervisor de conexÃ£o (singleton, transport-agnostic)
  private supervisorStatus: ConnectionSupervisorStatus = {
    active: false,
    state: 'idle',
    attempt: 0,
    nextDelayMs: 0,
    reason: 'idle',
    lastOkAt: null,
    consecutiveHealthFailures: 0,
    transport: 'none',
    deviceId: undefined,
  };
  private supervisorListeners: Set<ConnectionSupervisorCallback> = new Set();
  private supervisorHealthInterval: ReturnType<typeof setInterval> | null = null;
  private supervisorReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private supervisorReconnectInFlight: boolean = false;
  private manualDisconnectRequested: boolean = false;
  private serialMessageUnsubscribe: (() => void) | null = null;
  private pendingPingWaiters: Set<(ok: boolean) => void> = new Set();
  private lastInboundAt: number | null = null;
  // 🔧 FIX: Flag para pausar healthcheck durante dispensação ativa
  // Durante dispense, o ESP32 pode não responder a pings a tempo,
  // causando false-positive healthcheck failures e reconexão BLE indesejada.
  private dispensingInProgress: boolean = false;
  private nativeUsbListenersReady: boolean = false;
  private nativeUsbListenerHandles: USBPluginListenerHandle[] = [];
  private nativeUsbReadCallbackRegistered: boolean = false;
  private nativeUsbConnectPromise: Promise<boolean> | null = null;
  private lastNativeUsbAttachAt: number = 0;
  private connectionOrder: ConnectionType[] = ['usb', 'wifi', 'bluetooth'];
  private usbPollTimer: ReturnType<typeof setInterval> | null = null;
  private lastUsbPollDeviceCount: number = 0;
  private earlyUsbInitDone: boolean = false;
  private lastUsbErrorAt: number = 0;
  private usbPromotionInFlight: boolean = false;
  private suppressBleDisconnectUntil: number = 0;

  // ============================================
  // UTILITÃRIOS
  // ============================================

  /**
   * ðŸ”§ v4.0.7: Extrai JSONs completos de um buffer (suporta aninhamento + strings)
   * A regex simples /\{[^{}]*\}/g nÃ£o funciona com JSON aninhado.
   * Esta funÃ§Ã£o usa contagem de chaves para encontrar objetos completos,
   * ignorando {} que estÃ£o dentro de strings JSON.
   * 
   * FIX: Adicionado tracking de estado de string e escape para evitar
   * contar {} dentro de valores como {"msg":"Motor {tap0} falhou"}
   */
  private extractCompleteJsons(buffer: string): { jsons: string[]; remainder: string } {
    const jsons: string[] = [];
    let depth = 0;
    let start = -1;
    let lastEnd = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];

      // Tratamento de escape: se o char anterior era \, ignorar este char
      if (escape) {
        escape = false;
        continue;
      }

      // Se estamos dentro de uma string e encontramos \, o prÃ³ximo char Ã© escaped
      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      // Toggle de estado de string ao encontrar " (nÃ£o escaped)
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // Se estamos dentro de uma string, ignorar {} 
      if (inString) continue;

      // Contagem de profundidade de objetos JSON
      if (char === '{') {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        // 🔧 FIX R10-67: Resetar depth se cair abaixo de 0 (byte espúrio)
        if (depth < 0) {
          depth = 0;
          lastEnd = i + 1; // Avançar remainder para descartar lixo
          start = -1;
        } else if (depth === 0 && start !== -1) {
          const jsonStr = buffer.substring(start, i + 1);
          // Verificar se Ã© JSON vÃ¡lido antes de adicionar
          try {
            JSON.parse(jsonStr);
            jsons.push(jsonStr);
            lastEnd = i + 1;
          } catch {
            // NÃ£o Ã© JSON vÃ¡lido, ignorar este bloco
            console.warn('[BLE] Bloco JSON invÃ¡lido ignorado:', jsonStr.substring(0, 30));
          }
          start = -1;
        }
      }
    }

    // Remainder Ã© tudo apÃ³s o Ãºltimo JSON completo encontrado
    const remainder = buffer.substring(lastEnd);

    return { jsons, remainder };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new USBNativeConnectionError(code, message));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeoutId);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private errorToString(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  private isApiMismatchError(error: unknown): boolean {
    const message = this.errorToString(error).toLowerCase();
    return (
      message.includes('unimplemented') ||
      message.includes('not implemented') ||
      message.includes('not a function') ||
      message.includes('does not exist') ||
      message.includes('no plugin method') ||
      message.includes('undefined') ||
      message.includes('could not find plugin') ||
      message.includes('open call timeout') ||
      message.includes('enumeration timeout')
    );
  }

  private normalizeNativeUSBDevice(deviceLike: any, fallbackPort: number = 0): NativeUSBDeviceDescriptor | null {
    if (!deviceLike) return null;

    const source = deviceLike.device ?? deviceLike;
    const rawDeviceId = source.deviceId ?? source.did ?? source.id;
    const deviceId = Number(rawDeviceId);

    if (!Number.isFinite(deviceId)) {
      return null;
    }

    const vendorId = Number(source.vendorId ?? source.vid ?? 0);
    const productId = Number(source.productId ?? source.pid ?? 0);
    const productName = String(source.productName ?? source.name ?? 'USB Device');
    const portNum = Number(deviceLike.port ?? source.portNum ?? fallbackPort ?? 0);

    return {
      deviceId,
      vendorId: Number.isFinite(vendorId) ? vendorId : 0,
      productId: Number.isFinite(productId) ? productId : 0,
      productName,
      portNum: Number.isFinite(portNum) ? portNum : 0,
    };
  }

  private extractNativeUSBDevices(result: any): NativeUSBDeviceDescriptor[] {
    const rawDevices = Array.isArray(result?.devices) ? result.devices : [];
    const devices = rawDevices
      .map((entry: any) => this.normalizeNativeUSBDevice(entry, Number(entry?.port ?? 0)))
      .filter((entry: NativeUSBDeviceDescriptor | null): entry is NativeUSBDeviceDescriptor => entry !== null);
    return devices;
  }

  private selectPreferredNativeUSBDevice(devices: NativeUSBDeviceDescriptor[]): NativeUSBDeviceDescriptor | null {
    if (devices.length === 0) return null;
    return devices.find((device) => ESP32_USB_VENDOR_IDS.has(device.vendorId)) ?? devices[0];
  }

  private logNativeUSBDevices(context: string, devices: NativeUSBDeviceDescriptor[]): void {
    const payload = {
      context,
      count: devices.length,
      devices: devices.map((device) => ({
        deviceId: device.deviceId,
        vendorId: device.vendorId,
        productId: device.productId,
        productName: device.productName,
        portNum: device.portNum,
      })),
    };
    console.log('[USB OTG][devices]', JSON.stringify(payload));
  }

  /**
   * Registra listener USB via caminho SÍNCRONO do Capacitor (window.Capacitor.addListener).
   * Isso bypassa o proxy ESM assíncrono de registerPlugin() que causa race conditions.
   * O JSExport.java auto-gera este caminho, que chama cap.nativeCallback diretamente.
   */
  private addNativeUSBListenerSync(
    eventName: string,
    listener: (payload: any) => void
  ): USBPluginListenerHandle | null {
    try {
      const cap = (window as any).Capacitor;
      if (!cap) {
        console.warn('[USB OTG] window.Capacitor não disponível');
        return null;
      }

      // Caminho A (SÍNCRONO): window.Capacitor.addListener('UsbSerial', eventName, callback)
      // Este é o caminho gerado pelo JSExport.java que chama cap.nativeCallback() diretamente
      if (typeof cap.addListener === 'function') {
        const callbackHandle = cap.addListener('UsbSerial', eventName, listener);
        console.log(`[USB OTG] Listener "${eventName}" registrado via Capacitor.addListener (sync), callbackId:`, callbackHandle);
        return {
          remove: async () => {
            try {
              const resolvedHandle = await Promise.resolve(callbackHandle);
              if (resolvedHandle && typeof resolvedHandle.remove === 'function') {
                await resolvedHandle.remove();
                return;
              }

              if (
                typeof cap.removeListener === 'function' &&
                (typeof callbackHandle === 'string' || typeof callbackHandle === 'number')
              ) {
                cap.removeListener('UsbSerial', callbackHandle);
              }
            } catch (e) {
              console.warn(`[USB OTG] Erro ao remover listener "${eventName}":`, e);
            }
          }
        };
      }

      // Fallback: tentar via window.Capacitor.Plugins.UsbSerial.addListener
      const pluginProxy = cap.Plugins?.UsbSerial;
      if (pluginProxy && typeof pluginProxy.addListener === 'function') {
        const result = pluginProxy.addListener(eventName, listener);
        console.log(`[USB OTG] Listener "${eventName}" registrado via Capacitor.Plugins.UsbSerial`);
        return {
          remove: async () => {
            try {
              const handle = await Promise.resolve(result);
              if (handle && typeof handle.remove === 'function') {
                await handle.remove();
              }
            } catch (e) {
              console.warn(`[USB OTG] Erro ao remover listener "${eventName}":`, e);
            }
          }
        };
      }

      console.warn(`[USB OTG] Nenhum caminho de registro disponível para "${eventName}"`);
      return null;
    } catch (error) {
      console.warn(`[USB OTG] Falha ao registrar listener "${eventName}":`, error);
      return null;
    }
  }

  private handleNativeUSBChunk(chunk: string): void {
    if (!chunk) return;
    console.log('[USB OTG] Chunk recebido (' + chunk.length + ' bytes)');

    this.usbReceiveBuffer += chunk;

    const lines = this.usbReceiveBuffer.split('\n');
    this.usbReceiveBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      this.observeInboundPayload(trimmed);
      if (trimmed && this.usbDataListeners.size > 0) {
        console.log('[USB OTG] Linha completa:', trimmed);
        this.usbDataListeners.forEach(listener => {
          try {
            listener(trimmed);
          } catch (error) {
            console.error('[USB OTG] Erro em listener de dados:', error);
          }
        });
      }
    }

    if (this.usbReceiveBuffer.length > 2048) {
      console.warn('[ESP32][USB] Buffer muito grande (' + this.usbReceiveBuffer.length + ' bytes), tentando extrair JSONs...');
      const { jsons, remainder } = this.extractCompleteJsons(this.usbReceiveBuffer);
      for (const json of jsons) {
        this.usbDataListeners.forEach(listener => {
          try {
            listener(json);
          } catch (error) {
            console.error('[ESP32][USB] Erro em listener (recovery):', error);
          }
        });
      }

      if (remainder.length > 2048) {
        console.warn('[ESP32][USB] Descartando remainder excessivo:', remainder.length);
        this.usbReceiveBuffer = '';
      } else {
        this.usbReceiveBuffer = remainder;
      }
    }
  }

  private async ensureNativeUSBPluginListeners(plugin?: any): Promise<void> {
    if (!this.isAndroid() || this.nativeUsbListenersReady) return;

    // Verificar se window.Capacitor está disponível (necessário para caminho síncrono)
    const cap = (window as any).Capacitor;
    if (!cap) {
      console.warn('[USB] window.Capacitor não disponível — adiando registro de listeners');
      return;
    }

    this.nativeUsbListenersReady = true;
    console.log('[USB] Registrando listeners nativos via caminho SÍNCRONO (attached/detached/data/error)...');

    // Diagnóstico: listar PluginHeaders disponíveis
    try {
      const headers = cap.PluginHeaders;
      const usbHeader = headers?.find?.((h: any) => h.name === 'UsbSerial');
      console.log('[USB] PluginHeaders UsbSerial:', JSON.stringify(usbHeader ?? 'NÃO ENCONTRADO'));
      console.log('[USB] Capacitor.Plugins.UsbSerial disponível:', !!cap.Plugins?.UsbSerial);
      console.log('[USB] Capacitor.addListener disponível:', typeof cap.addListener);
    } catch (e) {
      console.warn('[USB] Erro ao verificar PluginHeaders:', e);
    }

    const attachedHandle = this.addNativeUSBListenerSync('attached', (payload: any) => {
      const device = this.normalizeNativeUSBDevice(payload);
      console.log('[USB] attached — dispositivo detectado:', JSON.stringify(device ?? payload));

      const now = Date.now();
      if (now - this.lastNativeUsbAttachAt < 1200) return;
      this.lastNativeUsbAttachAt = now;

      // Promover USB: desconectar transporte inferior (BLE/WiFi) e conectar USB
      void this.promoteUSBTransport().catch((error) => {
        console.warn('[USB] Auto-connect após attach falhou:', error);
      });
    });
    if (attachedHandle) {
      this.nativeUsbListenerHandles.push(attachedHandle);
      console.log('[USB] ✅ Listener "attached" registrado com sucesso (SYNC)');
    } else {
      console.warn('[USB] ⚠️ Falha ao registrar listener "attached"');
    }

    const detachedHandle = this.addNativeUSBListenerSync('detached', (payload: any) => {
      const device = this.normalizeNativeUSBDevice(payload);
      console.log('[USB] detached — dispositivo removido:', JSON.stringify(device ?? payload));

      if (this.connectionStatus.type === 'usb' && this.connectionStatus.connected) {
        console.log('[ESP32Supervisor] transport_switch — USB desconectado, iniciando fallback');
        this.handleConnectionDropped('usb_native_detached');
      }
    });
    if (detachedHandle) {
      this.nativeUsbListenerHandles.push(detachedHandle);
      console.log('[USB] ✅ Listener "detached" registrado com sucesso (SYNC)');
    } else {
      console.warn('[USB] ⚠️ Falha ao registrar listener "detached"');
    }

    const dataHandle = this.addNativeUSBListenerSync('data', (payload: any) => {
      const chunk = typeof payload?.data === 'string'
        ? payload.data
        : typeof payload?.value === 'string'
          ? payload.value
          : '';
      this.handleNativeUSBChunk(chunk);
    });
    if (dataHandle) {
      this.nativeUsbListenerHandles.push(dataHandle);
    } else if (!this.nativeUsbReadCallbackRegistered) {
      // Fallback: tentar registerReadCallback via plugin ESM se disponível
      const esmPlugin = plugin || getUsbSerialPlugin();
      if (esmPlugin && typeof esmPlugin.registerReadCallback === 'function') {
        try {
          await esmPlugin.registerReadCallback((payload: { value: string }) => {
            this.handleNativeUSBChunk(payload?.value || '');
          });
          this.nativeUsbReadCallbackRegistered = true;
        } catch (error) {
          console.warn('[USB OTG] registerReadCallback falhou:', error);
        }
      }
    }

    const errorHandle = this.addNativeUSBListenerSync('error', (payload: any) => {
      const errorMessage = typeof payload?.error === 'string'
        ? payload.error
        : JSON.stringify(payload);
      console.error('[USB OTG] EVENT error:', errorMessage);

      // Debounce: evitar loops error→reconnect→error rápidos
      const now = Date.now();
      if (now - this.lastUsbErrorAt < USB_ERROR_COOLDOWN_MS) {
        console.log(`[USB] Error event ignorado (cooldown ${USB_ERROR_COOLDOWN_MS}ms)`);
        return;
      }
      this.lastUsbErrorAt = now;

      if (this.connectionStatus.type === 'usb' && this.connectionStatus.connected) {
        this.handleConnectionDropped('usb_native_error_event');
      }
    });
    if (errorHandle) this.nativeUsbListenerHandles.push(errorHandle);

    console.log('[USB] Todos os listeners nativos registrados via caminho SÍNCRONO. Verificando dispositivos já conectados...');
    // Verificar se já existe um dispositivo USB conectado que foi perdido
    // durante a janela de race condition (antes dos listeners estarem prontos)
    // Para isso SIM precisamos do plugin ESM (para chamar connectedDevices/getDevices)
    const esmPlugin = plugin || getUsbSerialPlugin();
    if (esmPlugin) {
      void this.checkForAlreadyAttachedUSBDevice(esmPlugin);
    } else {
      // Plugin ESM ainda não carregou — agendar verificação quando carregar
      ensureUsbSerialPluginLoaded()
        .then(() => {
          const p = getUsbSerialPlugin();
          if (p) void this.checkForAlreadyAttachedUSBDevice(p);
        })
        .catch(() => { /* polling vai cobrir */ });
    }
  }

  /**
   * Verifica se já existe um dispositivo USB conectado após registro dos listeners.
   * Resolve a race condition onde o evento 'attached' dispara antes dos listeners JS.
   */
  private async checkForAlreadyAttachedUSBDevice(plugin: any): Promise<void> {
    try {
      const devices = await this.fetchNativeUSBDevices(plugin);
      if (devices.length > 0) {
        console.log(`[USB] ${devices.length} dispositivo(s) já conectado(s) detectado(s) pós-registro de listeners`);
        this.logNativeUSBDevices('post_listener_probe', devices);

        // Se não estamos conectados via USB, tentar promover
        if (!this.connectionStatus.connected || this.connectionStatus.type !== 'usb') {
          console.log('[USB] Dispositivo USB encontrado — tentando promover transporte');
          await this.promoteUSBTransport();
        }
      } else {
        console.log('[USB] Nenhum dispositivo USB conectado no momento');
      }
    } catch (error) {
      console.warn('[USB] Falha ao verificar dispositivos já conectados:', error);
    }
  }

  /**
   * Inicia polling periódico para detectar dispositivos USB.
   * Funciona como backup dos event listeners (attached/detached) para garantir
   * detecção mesmo quando os listeners nativos falham.
   */
  private startUSBDevicePolling(): void {
    if (this.usbPollTimer || !this.isAndroid()) return;

    const USB_POLL_INTERVAL_MS = 3000; // Verificar a cada 3 segundos
    console.log(`[USB] Iniciando polling de dispositivos USB a cada ${USB_POLL_INTERVAL_MS}ms`);

    this.usbPollTimer = setInterval(async () => {
      try {
        await ensureUsbSerialPluginLoaded();
        const plugin = getUsbSerialPlugin();
        if (!plugin) return;

        const devices = await this.fetchNativeUSBDevices(plugin);
        const currentCount = devices.length;

        // Dispositivo USB surgiu (não existia antes)
        if (currentCount > 0 && this.lastUsbPollDeviceCount === 0) {
          console.log(`[USB][Poll] Dispositivo USB detectado via polling (${currentCount} dispositivo(s))`);
          this.logNativeUSBDevices('usb_poll_detected', devices);

          // Se não estamos conectados via USB, promover
          if (!this.connectionStatus.connected || this.connectionStatus.type !== 'usb') {
            console.log('[USB][Poll] Promovendo USB como transporte...');
            await this.promoteUSBTransport();
          }
        }

        // Dispositivo USB removido (existia antes mas não mais)
        if (currentCount === 0 && this.lastUsbPollDeviceCount > 0) {
          console.log('[USB][Poll] Dispositivo USB removido (detectado via polling)');
          if (this.connectionStatus.type === 'usb' && this.connectionStatus.connected) {
            this.handleConnectionDropped('usb_poll_detached');
          }
        }

        this.lastUsbPollDeviceCount = currentCount;
      } catch (error) {
        // Silencioso — polling é backup, não deve poluir logs
      }
    }, USB_POLL_INTERVAL_MS);
  }

  /**
   * Para o polling de dispositivos USB.
   */
  private stopUSBDevicePolling(): void {
    if (this.usbPollTimer) {
      clearInterval(this.usbPollTimer);
      this.usbPollTimer = null;
      console.log('[USB] Polling de dispositivos USB parado');
    }
  }

  /**
   * Promove USB como transporte ativo, desconectando transportes inferiores (BLE/WiFi)
   * se necessário. Garante exclusividade: USB > BLE > WiFi.
   */
  private async promoteUSBTransport(): Promise<boolean> {
    // Guard contra chamadas concorrentes (attached + poll + checkForAlreadyAttached)
    if (this.usbPromotionInFlight) {
      console.log('[USB] promoteUSBTransport já em andamento, ignorando chamada duplicada');
      return false;
    }

    // Se já está conectado via USB, nada a fazer
    if (this.connectionStatus.connected && this.connectionStatus.type === 'usb') {
      console.log('[USB] Já conectado via USB, ignorando promoção');
      return true;
    }

    // Cooldown após erro USB recente
    const timeSinceError = Date.now() - this.lastUsbErrorAt;
    if (this.lastUsbErrorAt > 0 && timeSinceError < USB_ERROR_COOLDOWN_MS) {
      console.log(`[USB] Cooldown ativo (${USB_ERROR_COOLDOWN_MS - timeSinceError}ms restantes), ignorando promoção`);
      return false;
    }

    this.usbPromotionInFlight = true;
    try {

      // Se USB não está na lista de prioridade, não promover
      const order = this.connectionOrder || ['usb', 'wifi', 'bluetooth'];
      if (!order.includes('usb')) {
        console.log('[USB] USB não está na ordem de prioridade, ignorando promoção');
        return false;
      }

      // USB tem maior prioridade que o transporte atual?
      const usbPriority = order.indexOf('usb');
      const currentType = this.connectionStatus.type;
      if (this.connectionStatus.connected && currentType !== 'none') {
        const currentPriority = order.indexOf(currentType);
        // currentPriority == -1 (não encontrado) ou > usbPriority → USB tem prioridade
        if (currentPriority !== -1 && currentPriority <= usbPriority) {
          console.log(`[USB] Transporte atual (${currentType}) tem prioridade igual ou maior que USB, ignorando`);
          return false;
        }

        // Desconectar transporte atual para promover USB
        console.log(`[ESP32Supervisor] transport_switch — desconectando ${currentType} para promover USB`);
        this.manualDisconnectRequested = false; // Não é manual, é promoção
        await this.disconnectCurrentTransportOnly();
      }

      const success = await this.connectUSBNative(USB_NATIVE_CONNECT_TIMEOUT_MS);
      if (success) {
        console.log('[USB] connect_success — USB promovido como transporte ativo');
        this.logSupervisor('transport_switch', { from: currentType, to: 'usb', reason: 'usb_promotion' });
        return true;
      }
      // 🔒 FIX Bug-21: If USB connect fails after disconnecting the previous transport,
      // the device is left with no transport and no recovery. Schedule a reconnect
      // so the supervisor can re-establish connectivity via any available transport.
      console.warn('[USB] connect_fail — falha ao conectar USB, scheduling reconnect');
      this.scheduleReconnect('usb_promotion_failed', true);
      return false;

    } catch (error) {
      console.warn('[USB] connect_fail — erro ao conectar USB:', error);
      // 🔒 FIX Bug-21: Also schedule reconnect on exception path
      this.scheduleReconnect('usb_promotion_error', true);
      return false;
    } finally {
      this.usbPromotionInFlight = false;
    }
  }

  /**
   * Desconecta o transporte atual sem marcar como disconnect manual.
   * Usado internamente para promoção de transporte (ex: BLE→USB).
   */
  private async disconnectCurrentTransportOnly(): Promise<void> {
    this.stopHeartbeat();
    this.stopSupervisorHealthCheck();

    if (
      this.connectionStatus.type === 'bluetooth' &&
      this.connectionStatus.deviceId
    ) {
      try {
        this.suppressBleDisconnectUntil = Date.now() + BLE_DISCONNECT_SUPPRESS_MS;
        await BleClient.disconnect(this.connectionStatus.deviceId);
        console.log('[ESP32Supervisor] BLE desconectado para promoção de transporte');
      } catch (error) {
        console.warn('[ESP32Supervisor] Erro ao desconectar BLE para promoção:', error);
      }
    }

    if (this.connectionStatus.type === 'wifi') {
      console.log('[ESP32Supervisor] WiFi desconectado para promoção de transporte');
    }

    this.connectionStatus = { connected: false, type: 'none' };
    this.connectedDevice = null;
    this.notifyConnectionChange();
  }

  private async fetchNativeUSBDevices(plugin: any): Promise<NativeUSBDeviceDescriptor[]> {
    try {
      const result = await this.withTimeout(
        Promise.resolve(plugin.connectedDevices()),
        USB_ENUMERATION_TIMEOUT_MS,
        'USB_ENUMERATION_TIMEOUT',
        '[USB OTG] Enumeration timeout em connectedDevices'
      );
      return this.extractNativeUSBDevices(result);
    } catch (error) {
      if (!this.isApiMismatchError(error)) {
        throw error;
      }

      const fallbackResult = await this.withTimeout(
        Promise.resolve(plugin.getDevices()),
        USB_ENUMERATION_TIMEOUT_MS,
        'USB_ENUMERATION_TIMEOUT',
        '[USB OTG] Enumeration timeout em getDevices'
      );
      return this.extractNativeUSBDevices(fallbackResult);
    }
  }

  // ============================================
  // DETECÃ‡ÃƒO DE PLATAFORMA
  // ============================================

  isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  isWeb(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  /**
   * Inicialização precoce: registra listeners USB nativos ANTES do React montar.
   * Chamado imediatamente quando o singleton é criado (module load time).
   * Isso garante que eventos 'attached'/'detached' do plugin nativo sejam capturados
   * mesmo se dispararem antes do ESP32Context montar.
   */
  initEarlyUSBListeners(): void {
    if (this.earlyUsbInitDone || !this.isAndroid()) return;
    this.earlyUsbInitDone = true;

    console.log('[USB] Inicialização precoce: registrando listeners USB via caminho SÍNCRONO...');

    // CRÍTICO: NÃO esperar ensureUsbSerialPluginLoaded()!
    // Registrar listeners via window.Capacitor.addListener DIRETAMENTE.
    // Isso funciona porque o JSExport auto-gera os bindings síncronos
    // que já estão disponíveis quando o WebView carrega.
    try {
      // ensureNativeUSBPluginListeners agora usa window.Capacitor.addListener (sync)
      // e NÃO requer o plugin ESM para registrar listeners
      void this.ensureNativeUSBPluginListeners();
      console.log('[USB] ✅ Listeners USB registrados na inicialização precoce (SYNC)');
    } catch (error) {
      console.warn('[USB] Falha na inicialização precoce:', error);
    }

    // Iniciar polling como backup — sempre, independente dos listeners
    this.startUSBDevicePolling();

    // Carregar plugin ESM em background (necessário para connectedDevices, open, write, etc.)
    ensureUsbSerialPluginLoaded().catch((error) => {
      console.warn('[USB] Falha ao carregar plugin ESM em background:', error);
    });
  }

  // ============================================
  // PERSISTÃŠNCIA DE CONEXÃƒO
  // ============================================

  /**
   * Salva informaÃ§Ãµes da Ãºltima conexÃ£o bem-sucedida
   */
  setLastConnection(info: Omit<LastConnectionInfo, 'timestamp'>): void {
    const data: LastConnectionInfo = {
      ...info,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(LAST_CONNECTION_KEY, JSON.stringify(data));
      console.log('[ESP32] Ãšltima conexÃ£o salva:', data);
    } catch (error) {
      console.warn('[ESP32] Erro ao salvar Ãºltima conexÃ£o:', error);
    }
  }

  /**
   * Recupera informaÃ§Ãµes da Ãºltima conexÃ£o
   */
  getLastConnection(): LastConnectionInfo | null {
    try {
      const data = localStorage.getItem(LAST_CONNECTION_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('[ESP32] Erro ao ler Ãºltima conexÃ£o:', error);
    }
    return null;
  }

  /**
   * Limpa informaÃ§Ãµes de Ãºltima conexÃ£o
   */
  clearLastConnection(): void {
    try {
      localStorage.removeItem(LAST_CONNECTION_KEY);
      console.log('[ESP32] Ãšltima conexÃ£o removida');
    } catch (error) {
      console.warn('[ESP32] Erro ao limpar Ãºltima conexÃ£o:', error);
    }
  }

  // ============================================
  // CALLBACK DE EVENTOS
  // ============================================

  /**
   * Registra callback para mudanÃ§as de conexÃ£o
   * @returns FunÃ§Ã£o para remover o listener
   */
  setOnConnectionChange(callback: ConnectionEventCallback | null): (() => void) | void {
    if (!callback) return;
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  /**
   * Adiciona listener para mudanÃ§as de conexÃ£o
   */
  addConnectionListener(callback: ConnectionEventCallback): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  /**
   * ðŸ†• Registra callback para dados recebidos via BLE
   * @returns FunÃ§Ã£o para remover o listener
   */
  setOnBleDataReceived(callback: ((data: string) => void) | null): (() => void) | void {
    if (!callback) return;
    this.bleDataListeners.add(callback);
    return () => this.bleDataListeners.delete(callback);
  }

  /**
   * ðŸ†• Adiciona listener para dados BLE
   */
  addBleDataListener(callback: (data: string) => void): () => void {
    this.bleDataListeners.add(callback);
    return () => this.bleDataListeners.delete(callback);
  }

  /**
   * ðŸ†• Registra callback para dados recebidos via USB OTG
   * @returns FunÃ§Ã£o para remover o listener
   */
  setOnUsbDataReceived(callback: ((data: string) => void) | null): (() => void) | void {
    if (!callback) return;
    this.usbDataListeners.add(callback);
    return () => this.usbDataListeners.delete(callback);
  }

  /**
   * ðŸ†• Adiciona listener para dados USB OTG
   */
  addUsbDataListener(callback: (data: string) => void): () => void {
    this.usbDataListeners.add(callback);
    return () => this.usbDataListeners.delete(callback);
  }

  /**
   * Notifica mudanÃ§a de conexÃ£o
   */
  private notifyConnectionChange(): void {
    console.log('[ESP32Service] notifyConnectionChange chamado, status:', JSON.stringify(this.connectionStatus));
    console.log(`[ESP32Service] Notificando ${this.connectionListeners.size} listeners`);

    this.connectionListeners.forEach(listener => {
      try {
        listener(this.connectionStatus);
      } catch (error) {
        console.error('[ESP32Service] Erro em listener de conexÃ£o:', error);
      }
    });
  }

  addConnectionSupervisorListener(callback: ConnectionSupervisorCallback): () => void {
    this.supervisorListeners.add(callback);
    callback(this.supervisorStatus);
    return () => this.supervisorListeners.delete(callback);
  }

  getConnectionSupervisorStatus(): ConnectionSupervisorStatus {
    return this.supervisorStatus;
  }

  /**
   * Define a ordem de prioridade de conexão usada pelo supervisor.
   */
  setConnectionOrder(order: ConnectionType[]): void {
    this.connectionOrder = order;
    console.log('[Supervisor] connectionOrder atualizado:', order);
  }

  activateConnectionSupervisor(autoReconnect: boolean = true): void {
    this.ensureSerialInboundObserver();
    this.updateSupervisorStatus({ active: true });

    if (this.connectionStatus.connected) {
      this.handleConnectionEstablished('supervisor_activate');
      return;
    }

    this.stopSupervisorHealthCheck();

    if (this.isAndroid()) {
      // CRÍTICO: Registrar listeners USB ANTES de tentar autoConnect
      // para evitar race condition onde 'attached' dispara antes dos listeners JS
      console.log('[ESP32Supervisor] Inicializando listeners USB nativos (caminho SÍNCRONO)...');
      // Registrar listeners via caminho síncrono — NÃO depende do plugin ESM
      try {
        void this.ensureNativeUSBPluginListeners();
        console.log('[ESP32Supervisor] Listeners USB registrados (SYNC)');
      } catch (error) {
        console.warn('[USB] Falha ao inicializar listeners nativos:', error);
      }
      // Iniciar polling USB como backup dos event listeners
      this.startUSBDevicePolling();
      if (autoReconnect && !this.connectionStatus.connected) {
        this.scheduleReconnect('supervisor_activate', true);
      }
    } else {
      if (autoReconnect) {
        this.scheduleReconnect('supervisor_activate', true);
      }
    }
  }

  deactivateConnectionSupervisor(reason: string = 'manual_deactivate'): void {
    this.clearSupervisorReconnectTimer();
    this.stopSupervisorHealthCheck();
    this.stopUSBDevicePolling();
    this.resolvePendingPingWaiters(false);
    this.updateSupervisorStatus({
      active: false,
      state: 'idle',
      attempt: 0,
      nextDelayMs: 0,
      reason,
      consecutiveHealthFailures: 0,
      transport: this.connectionStatus.type,
      deviceId: this.connectionStatus.deviceId,
    });
  }

  private lastReconnectNowAt = 0;

  async reconnectNow(reason: string = 'manual_reconnect_now'): Promise<boolean> {
    // Guard: se já está em voo ou dentro do cooldown, não duplicar
    if (this.supervisorReconnectInFlight) {
      console.log(`[ESP32Supervisor][DIAG] reconnectNow BLOQUEADO (inFlight) reason=${reason} at=${Date.now()}`);
      return false;
    }
    const now = Date.now();
    if (now - this.lastReconnectNowAt < RECONNECT_NOW_COOLDOWN_MS) {
      console.log(`[ESP32Supervisor][DIAG] reconnectNow BLOQUEADO (cooldown ${now - this.lastReconnectNowAt}ms) reason=${reason}`);
      return false;
    }
    console.warn(`[ESP32Supervisor][DIAG] reconnectNow EXECUTANDO reason=${reason} at=${now} attempt=${this.supervisorStatus.attempt}`);
    this.lastReconnectNowAt = now;

    this.manualDisconnectRequested = false;
    this.updateSupervisorStatus({
      active: true,
      state: 'reconnecting',
      reason,
      nextDelayMs: 0,
      attempt: Math.max(1, this.supervisorStatus.attempt + 1),
    });

    this.clearSupervisorReconnectTimer();
    return this.runReconnectAttempt(reason);
  }

  private notifySupervisorStatus(): void {
    this.supervisorListeners.forEach((listener) => {
      try {
        listener(this.supervisorStatus);
      } catch (error) {
        console.error('[ESP32Supervisor] Erro em listener:', error);
      }
    });
  }

  private updateSupervisorStatus(patch: Partial<ConnectionSupervisorStatus>): void {
    this.supervisorStatus = {
      ...this.supervisorStatus,
      ...patch,
    };
    this.notifySupervisorStatus();
  }

  private logSupervisor(event: string, extra: Record<string, unknown> = {}): void {
    const payload = {
      event,
      transport: this.supervisorStatus.transport,
      deviceId: this.supervisorStatus.deviceId || this.connectionStatus.deviceId || 'unknown',
      attempt: this.supervisorStatus.attempt,
      reason: this.supervisorStatus.reason,
      lastOkAt: this.supervisorStatus.lastOkAt,
      ...extra,
    };
    console.log('[ESP32Supervisor]', JSON.stringify(payload));
  }

  private ensureSerialInboundObserver(): void {
    if (this.serialMessageUnsubscribe) return;

    this.serialMessageUnsubscribe = esp32Serial.onMessage((message) => {
      this.observeInboundPayload(message);
    });
  }

  private resolvePendingPingWaiters(ok: boolean): void {
    if (this.pendingPingWaiters.size === 0) return;

    this.pendingPingWaiters.forEach((waiter) => {
      try {
        waiter(ok);
      } catch (error) {
        console.error('[ESP32Supervisor] Erro em ping waiter:', error);
      }
    });
    this.pendingPingWaiters.clear();
  }

  private notifyInboundHealthSignal(source: string): void {
    this.lastInboundAt = Date.now();
    this.logSupervisor('inbound_signal', { source });
    this.resolvePendingPingWaiters(true);
  }

  private observeInboundPayload(payload: string | ESP32Response): void {
    if (typeof payload === 'string') {
      const line = payload.trim();
      if (!line) return;
      this.notifyInboundHealthSignal('raw_line');
      return;
    }

    if (payload && typeof payload === 'object') {
      this.notifyInboundHealthSignal('json_message');
    }
  }

  private startSupervisorHealthCheck(): void {
    if (this.supervisorHealthInterval) {
      clearInterval(this.supervisorHealthInterval);
    }

    console.log(`[ESP32Supervisor][DIAG] startSupervisorHealthCheck interval=${SUPERVISOR_HEALTHCHECK_INTERVAL_MS}ms threshold=${SUPERVISOR_HEALTHCHECK_FAIL_THRESHOLD} at=${Date.now()}`);
    this.supervisorHealthInterval = setInterval(async () => {
      if (!this.supervisorStatus.active || !this.connectionStatus.connected) {
        return;
      }

      const tickAt = Date.now();
      const sinceLastInbound = this.lastInboundAt ? (tickAt - this.lastInboundAt) : -1;

      // 🔧 FIX: Skip healthcheck ping during active dispensation
      // The ESP32 is busy with solenoid/flow control and may not reply to pings in time.
      // During multi-cup dispense, the 3s gap between cups (LED success 1s + wait 2s)
      // could cause 2 consecutive healthcheck failures → false disconnect → BLE reconnect.
      // Instead, trust inbound data: if we received anything in the last 10s, consider healthy.
      if (this.dispensingInProgress) {
        const recentInboundMs = this.lastInboundAt ? (tickAt - this.lastInboundAt) : Number.POSITIVE_INFINITY;
        if (recentInboundMs <= 30000) {
          // Got data from ESP32 recently — connection is fine, skip ping
          // 🔧 FIX Bug #16: Ampliado de 15s para 30s (era 10s nas versões anteriores).
          // Em dispensers lentos ou com MIUI agressivo (CPU throttle), o ESP32 pode levar >15s
          // entre envios de progress, causando false-disconnect durante dispense ativo.
          this.markConnectionHealthy('healthcheck_skip_dispensing');
          return;
        }
        // No data for 10s during dispense — something is truly wrong, proceed with normal check
        console.warn('[ESP32Supervisor] Dispensing but no ESP32 data for', Math.round(recentInboundMs / 1000), 's — checking connection...');
      }

      // 🔍 DIAG: Logar cada tick do healthcheck com resultado
      const pingStart = Date.now();
      const healthy = await this.verifyConnection(2500);
      const pingDuration = Date.now() - pingStart;
      console.log(
        `[ESP32Supervisor][DIAG] healthcheck tick=${tickAt}`,
        `healthy=${healthy}`,
        `pingMs=${pingDuration}`,
        `sinceLastInbound=${sinceLastInbound}ms`,
        `failures=${this.supervisorStatus.consecutiveHealthFailures}`,
        `transport=${this.connectionStatus.type}`
      );

      if (healthy) {
        this.markConnectionHealthy('healthcheck_ok');
        return;
      }

      const nextFailures = this.supervisorStatus.consecutiveHealthFailures + 1;
      this.updateSupervisorStatus({ consecutiveHealthFailures: nextFailures });
      this.logSupervisor('healthcheck_failed', { consecutiveHealthFailures: nextFailures });

      if (nextFailures >= SUPERVISOR_HEALTHCHECK_FAIL_THRESHOLD) {
        this.handleConnectionDropped('healthcheck_threshold_reached');
      }
    }, SUPERVISOR_HEALTHCHECK_INTERVAL_MS);
  }

  private stopSupervisorHealthCheck(): void {
    if (this.supervisorHealthInterval) {
      clearInterval(this.supervisorHealthInterval);
      this.supervisorHealthInterval = null;
    }
  }

  private markConnectionHealthy(reason: string): void {
    this.updateSupervisorStatus({
      state: 'connected',
      attempt: 0,
      nextDelayMs: 0,
      reason,
      lastOkAt: Date.now(),
      consecutiveHealthFailures: 0,
      transport: this.connectionStatus.type,
      deviceId: this.connectionStatus.deviceId,
    });
  }

  private clearSupervisorReconnectTimer(): void {
    if (this.supervisorReconnectTimer) {
      clearTimeout(this.supervisorReconnectTimer);
      this.supervisorReconnectTimer = null;
    }
  }

  private computeReconnectDelay(attempt: number): number {
    const expDelay = Math.min(
      SUPERVISOR_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)),
      SUPERVISOR_MAX_DELAY_MS
    );
    const jitter = expDelay * SUPERVISOR_BACKOFF_JITTER_RATIO * Math.random();
    return Math.floor(expDelay + jitter);
  }

  private scheduleReconnect(reason: string, immediate: boolean = false): void {
    if (!this.supervisorStatus.active || this.manualDisconnectRequested) {
      console.log(`[ESP32Supervisor][DIAG] scheduleReconnect ABORTADO (inactive/manual) reason=${reason}`);
      return;
    }
    if (this.connectionStatus.connected || this.supervisorReconnectInFlight || this.supervisorReconnectTimer) {
      console.log(`[ESP32Supervisor][DIAG] scheduleReconnect BLOQUEADO reason=${reason} connected=${this.connectionStatus.connected} inFlight=${this.supervisorReconnectInFlight} hasTimer=${!!this.supervisorReconnectTimer}`);
      return;
    }

    const nextAttempt = Math.max(1, this.supervisorStatus.attempt + 1);
    const isPersistentFailure = nextAttempt >= SUPERVISOR_PERSISTENT_FAILURE_ATTEMPTS;
    // Após persistent_failure: delay longo de 5 min em vez de backoff normal
    const nextDelayMs = immediate ? 0 
      : isPersistentFailure ? SUPERVISOR_PERSISTENT_FAILURE_DELAY_MS 
      : this.computeReconnectDelay(nextAttempt);
    const nextState = isPersistentFailure
      ? 'persistent_failure'
      : 'reconnecting';

    this.updateSupervisorStatus({
      state: nextState,
      reason,
      attempt: nextAttempt,
      nextDelayMs,
      transport: this.connectionStatus.type,
      deviceId: this.connectionStatus.deviceId,
    });

    this.logSupervisor('reconnect_scheduled', { nextDelayMs });

    this.supervisorReconnectTimer = setTimeout(() => {
      this.supervisorReconnectTimer = null;
      void this.runReconnectAttempt(reason);
    }, nextDelayMs);
  }

  private async runReconnectAttempt(reason: string): Promise<boolean> {
    if (this.supervisorReconnectInFlight) {
      return false;
    }

    this.supervisorReconnectInFlight = true;
    this.clearSupervisorReconnectTimer();
    this.updateSupervisorStatus({ state: 'reconnecting', reason, nextDelayMs: 0 });
    this.logSupervisor('reconnect_attempt_start');

    try {
      const lastConnection = this.getLastConnection();

      // 1) Tentar reconectar à última conexão conhecida
      if (lastConnection) {
        const success = await this.tryReconnectLastConnection(lastConnection);
        if (success) {
          this.logSupervisor('reconnect_attempt_success');
          return true;
        }
        this.logSupervisor('reconnect_last_failed_trying_order');
      } else {
        this.logSupervisor('reconnect_missing_last_connection_trying_order');
      }

      // 2) Fallback: tentar na ordem de prioridade configurada
      //    Na web, se última conexão foi USB, pular WiFi/BLE (inúteis e lentos)
      let effectiveOrder = this.connectionOrder;
      if (this.isWeb() && lastConnection?.type === 'usb') {
        effectiveOrder = effectiveOrder.filter(t => t === 'usb');
      }
      const result = await this.autoConnectPreferredOrder(effectiveOrder);
      if (result !== 'none') {
        this.logSupervisor('reconnect_preferred_order_success', { transport: result });
        return true;
      }

      this.logSupervisor('reconnect_attempt_failed');
      this.scheduleReconnect('attempt_failed', false);
      return false;
    } catch (error) {
      this.logSupervisor('reconnect_attempt_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.scheduleReconnect('attempt_error', false);
      return false;
    } finally {
      this.supervisorReconnectInFlight = false;
    }
  }

  private async tryReconnectLastConnection(lastConnection: LastConnectionInfo): Promise<boolean> {
    switch (lastConnection.type) {
      case 'usb': {
        if (this.isAndroid()) {
          return this.autoConnectUSBNative();
        }
        const webReconnect = await esp32Serial.tryAutoReconnect();
        if (webReconnect) return true;
        return this.autoConnectUSBIfAuthorized();
      }
      case 'wifi': {
        if (!lastConnection.ipAddress) return false;
        return this.connectWifi(lastConnection.ipAddress);
      }
      case 'bluetooth': {
        if (lastConnection.deviceId) {
          const byId = await this.connectBluetooth(lastConnection.deviceId, lastConnection.deviceName);
          if (byId) return true;
        }
        if (this.isAndroid()) {
          return this.autoConnectBluetoothByName(lastConnection.deviceName || ESP32_DEVICE_NAME);
        }
        return false;
      }
      default:
        return false;
    }
  }

  private handleConnectionEstablished(reason: string): void {
    // 🔍 DIAG: Logar reconexão com tempo total
    const establishedAt = Date.now();
    console.warn(
      `[ESP32][DIAG] handleConnectionEstablished reason=${reason}`,
      `at=${establishedAt}`,
      `type=${this.connectionStatus.type}`,
      `device=${this.connectionStatus.deviceName}`,
      `attempt=${this.supervisorStatus.attempt}`
    );
    this.manualDisconnectRequested = false;
    this.clearSupervisorReconnectTimer();
    this.markConnectionHealthy(reason);
    this.startSupervisorHealthCheck();
    this.logSupervisor('connection_established');
  }

  private handleConnectionDropped(reason: string): void {
    const droppedAt = Date.now();
    // 🔍 DIAG: Marcar flag ANTES de notifyConnectionChange para detectar race com useESP32Reconnect
    const wasInFlight = this.supervisorReconnectInFlight;
    console.warn(
      `[ESP32][DIAG] handleConnectionDropped reason=${reason}`,
      `at=${droppedAt}`,
      `wasConnected=${this.connectionStatus.connected}`,
      `type=${this.connectionStatus.type}`,
      `inFlight=${wasInFlight}`,
      `attempt=${this.supervisorStatus.attempt}`
    );

    this.stopHeartbeat();
    this.stopSupervisorHealthCheck();
    this.resolvePendingPingWaiters(false);
    systemLogService.warn('esp32', `Conexão perdida: ${reason}`);

    // 🔧 FIX Bug #1: Atualizar estado do supervisor ANTES de notifyConnectionChange().
    // O hook useESP32Reconnect checava supervisor.state imediatamente após o evento de
    // conexão disparado pelo notify — mas o estado só era atualizado para 'reconnecting'
    // DEPOIS do notify. O guard do hook passava sempre (state ainda era 'idle'), causando
    // chamadas duplas de reconnectNow() do hook + supervisor simultaneamente.
    // Agora o hook lê state:'reconnecting' e seu guard bloqueia a tentativa duplicada.
    if (!this.manualDisconnectRequested) {
      this.updateSupervisorStatus({
        state: 'reconnecting',
        consecutiveHealthFailures: 0,
        transport: 'none',
        deviceId: undefined,
      });
    }

    if (this.connectionStatus.type !== 'none' || this.connectionStatus.connected) {
      this.connectionStatus = { connected: false, type: 'none' };
      this.connectedDevice = null;
      this.notifyConnectionChange(); // hook agora vê state:'reconnecting' — guard funciona
    }

    if (this.manualDisconnectRequested) {
      this.updateSupervisorStatus({
        state: 'idle',
        reason,
        attempt: 0,
        nextDelayMs: 0,
        transport: 'none',
        deviceId: undefined,
        consecutiveHealthFailures: 0,
      });
      this.logSupervisor('connection_dropped_manual');
      return;
    }

    // Atualizar reason e demais campos (state/'reconnecting' + transport/deviceId já atualizados acima)
    this.updateSupervisorStatus({ reason });
    this.logSupervisor('connection_dropped');
    // 🔍 DIAG: Logar se scheduleReconnect vai de fato agendar (ou se guard vai bloquear)
    console.log(`[ESP32][DIAG] about to scheduleReconnect: connected=${this.connectionStatus.connected} inFlight=${this.supervisorReconnectInFlight} hasTimer=${!!this.supervisorReconnectTimer}`);
    this.scheduleReconnect(reason, true);
  }

  // ============================================
  // HEARTBEAT (MONITORAMENTO DE CONEXÃƒO)
  // ============================================

  /**
   * Inicia heartbeat para monitorar conexÃ£o
   * @param intervalMs Intervalo entre pings (padrÃ£o: 15s)
   * @param onFail Callback quando heartbeat falhar N vezes consecutivas
   */
  startHeartbeat(
    intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
    onFail?: HeartbeatFailCallback
  ): void {
    this.stopHeartbeat(); // Limpar intervalo anterior
    this.heartbeatFailCount = 0;
    this.onHeartbeatFail = onFail || null;

    console.log(`[Heartbeat] Iniciando com intervalo de ${intervalMs}ms`);

    this.heartbeatInterval = setInterval(async () => {
      if (!this.connectionStatus.connected) {
        console.log('[Heartbeat] NÃ£o conectado, parando heartbeat');
        this.stopHeartbeat();
        return;
      }

      try {
        const success = await this.ping();
        if (success) {
          this.heartbeatFailCount = 0;
          console.log('[Heartbeat] Ping OK');
        } else {
          this.heartbeatFailCount++;
          console.warn(`[Heartbeat] Ping falhou (${this.heartbeatFailCount}/${HEARTBEAT_FAIL_THRESHOLD})`);
        }
      } catch (error) {
        this.heartbeatFailCount++;
        console.warn(`[Heartbeat] Erro no ping (${this.heartbeatFailCount}/${HEARTBEAT_FAIL_THRESHOLD}):`, error);
      }

      // Verificar limite de falhas
      if (this.heartbeatFailCount >= HEARTBEAT_FAIL_THRESHOLD) {
        console.error('[Heartbeat] Limite de falhas atingido, conexÃ£o considerada perdida');
        systemLogService.error('esp32', `Heartbeat limite atingido: ${this.heartbeatFailCount} falhas consecutivas`);

        // Notificar callback
        if (this.onHeartbeatFail) {
          this.onHeartbeatFail(this.heartbeatFailCount);
        }

        this.handleConnectionDropped('legacy_heartbeat_threshold');
      }
    }, intervalMs);
  }

  /**
   * Para o heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[Heartbeat] Parado');
    }
    this.heartbeatFailCount = 0;
  }

  // ============================================
  // AUTOCONEXÃƒO
  // ============================================

  /**
   * Tenta conectar via USB usando portas previamente autorizadas (sem gesto)
   * @returns true se conectou com sucesso
   */
  async autoConnectUSBIfAuthorized(): Promise<boolean> {
    const webSerial = getWebSerial();
    if (!webSerial) {
      console.log('[AutoConnect USB] Web Serial API nÃ£o disponÃ­vel');
      return false;
    }

    try {
      const ports = await webSerial.getPorts();
      if (ports.length === 0) {
        console.log('[AutoConnect USB] Nenhuma porta previamente autorizada');
        return false;
      }

      console.log(`[AutoConnect USB] ${ports.length} porta(s) autorizada(s) encontrada(s)`);

      // Tentar a primeira porta disponÃ­vel
      const port = ports[0];
      await port.open({ baudRate: DEFAULT_BAUDRATE });

      this.serialPort = port;
      this.connectionStatus = {
        connected: true,
        type: 'usb',
        deviceId: 'usb-serial',
        deviceName: 'USB Serial (Auto)',
      };

      // Salvar conexÃ£o
      this.setLastConnection({
        type: 'usb',
        deviceId: 'usb-serial',
        deviceName: 'USB Serial (Auto)',
      });

      this.notifyConnectionChange();
      this.handleConnectionEstablished('auto_connect_usb_authorized');
      console.log('[AutoConnect USB] Conectado com sucesso');
      return true;
    } catch (error) {
      console.warn('[AutoConnect USB] Falha ao conectar:', error);
      return false;
    }
  }

  /**
   * Tenta conectar na ordem de preferÃªncia especificada
   * @param order Array com ordem de preferÃªncia (ex: ['usb', 'wifi', 'bluetooth'])
   * @returns Tipo de conexÃ£o estabelecida ou 'none' se falhou
   */
  async autoConnectPreferredOrder(
    order: ConnectionType[] = ['usb', 'wifi', 'bluetooth']
  ): Promise<ConnectionType> {
    console.log('[AutoConnect] Tentando ordem:', order);
    const lastConnection = this.getLastConnection();

    for (const protocol of order) {
      console.log(`[AutoConnect] Tentando ${protocol}...`);

      try {
        let success = false;

        switch (protocol) {
          case 'usb':
            // No Android, usar USB OTG nativo; na web, usar Web Serial
            if (Capacitor.isNativePlatform()) {
              success = await this.autoConnectUSBNative();
            } else {
              success = await this.autoConnectUSBIfAuthorized();
            }
            break;

          case 'wifi':
            // ðŸ†• Tentar IP salvo OU IP padrÃ£o do ESP32
            const wifiIp = lastConnection?.ipAddress || ESP32_DEFAULT_IP;
            console.log(`[AutoConnect WiFi] Tentando IP: ${wifiIp}`);
            success = await this.connectWifi(wifiIp);
            break;

          case 'bluetooth':
            // ðŸ†• BLE auto-connect: tentar por deviceId salvo OU scan por nome
            if (this.isAndroid()) {
              if (lastConnection?.deviceId && lastConnection.type === 'bluetooth') {
                // Tentar reconectar ao dispositivo salvo
                console.log('[AutoConnect BLE] Tentando deviceId salvo:', lastConnection.deviceId);
                success = await this.connectBluetooth(lastConnection.deviceId, lastConnection.deviceName);
              }

              if (!success) {
                // ðŸ†• Fallback: Scan e conectar pelo nome "Kiosk_Bier"
                console.log(`[AutoConnect BLE] Procurando dispositivo "${ESP32_DEVICE_NAME}"...`);
                success = await this.autoConnectBluetoothByName(ESP32_DEVICE_NAME);
              }
            } else if (this.isWeb()) {
              console.log('[AutoConnect BLE] Requer gesto do usuÃ¡rio no navegador');
            }
            break;
        }

        if (success) {
          console.log(`[AutoConnect] Sucesso via ${protocol}`);
          return protocol;
        }
      } catch (error) {
        console.warn(`[AutoConnect] Falha em ${protocol}:`, error);
      }
    }

    console.log('[AutoConnect] Nenhum protocolo conseguiu conectar');
    return 'none';
  }

  /**
   * Tenta reconectar ao Ãºltimo dispositivo com backoff exponencial
   * @param maxAttempts Numero maximo de tentativas (padrao: 0 = infinito)
   * @param baseDelayMs Delay base em ms (padrÃ£o: 1000)
   * @param maxDelayMs Delay mÃ¡ximo em ms (padrÃ£o: 30000)
   */
  async reconnectWithBackoff(
    maxAttempts: number = 0,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
  ): Promise<boolean> {
    const lastConnection = this.getLastConnection();
    if (!lastConnection) {
      console.warn('[Reconnect] Nenhuma conexÃ£o anterior salva');
      return false;
    }

    const infinite = maxAttempts <= 0;
    const attemptsLabel = infinite ? 'infinito' : String(maxAttempts);
    console.log(`[Reconnect] Tentando reconectar a ${lastConnection.type} (max ${attemptsLabel} tentativas)`);

    let attempt = 1;
    while (infinite || attempt <= maxAttempts) {
      const baseDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.floor(baseDelay * SUPERVISOR_BACKOFF_JITTER_RATIO * Math.random());
      const delay = baseDelay + jitter;
      console.log(`[Reconnect] Tentativa ${attempt}/${attemptsLabel} (delay: ${delay}ms)`);

      try {
        const success = await this.tryReconnectLastConnection(lastConnection);
        if (success) {
          console.log(`[Reconnect] Sucesso na tentativa ${attempt}`);
          return true;
        }
      } catch (error) {
        console.warn(`[Reconnect] Tentativa ${attempt} falhou:`, error);
      }

      if (!infinite && attempt >= maxAttempts) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }

    console.error(`[Reconnect] Falha apÃ³s ${attemptsLabel} tentativas`);
    return false;
  }

  // ============================================
  // BLUETOOTH LOW ENERGY (BLE)
  // ============================================

  /**
   * Inicializa Bluetooth (verifica permissÃµes no Android)
   */
  async initBluetooth(): Promise<boolean> {
    try {
      // Inicializar BLE com opÃ§Ãµes especÃ­ficas para Android
      await BleClient.initialize({
        androidNeverForLocation: false, // Precisa de localizaÃ§Ã£o para scan BLE no Android
      });
      console.log('[BLE] Inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao inicializar:', error);
      return false;
    }
  }

  /**
   * ðŸ†• Auto-conecta ao Bluetooth procurando pelo nome do dispositivo
   * Usa as configuraÃ§Ãµes conhecidas: nome "Kiosk_Bier"
   * @param deviceName Nome do dispositivo para procurar (padrÃ£o: Kiosk_Bier)
   * @param timeout Tempo mÃ¡ximo de scan em ms
   */
  async autoConnectBluetoothByName(deviceName: string = ESP32_DEVICE_NAME, timeout: number = 8000): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[AutoConnect BLE] DisponÃ­vel apenas em plataformas nativas');
      return false;
    }

    try {
      console.log(`[AutoConnect BLE] Inicializando scan para "${deviceName}"...`);

      // Inicializar BLE
      await BleClient.initialize({
        androidNeverForLocation: false,
      });

      // VariÃ¡vel para armazenar o dispositivo encontrado
      let foundDevice: ESP32Device | null = null;

      // Scan por dispositivos
      console.log('[AutoConnect BLE] Iniciando scan...');

      await BleClient.requestLEScan(
        { allowDuplicates: false },
        (result) => {
          const name = result.device.name || '';
          console.log(`[AutoConnect BLE] Encontrado: "${name}" (${result.device.deviceId})`);

          // Procurar pelo nome exato ou parcial
          if (name.toLowerCase().includes(deviceName.toLowerCase()) ||
            name.toLowerCase().includes('kiosk') ||
            name.toLowerCase().includes('bier')) {
            if (!foundDevice) {
              foundDevice = {
                id: result.device.deviceId,
                name: name,
                type: 'bluetooth',
                rssi: result.rssi,
              };
              console.log(`[AutoConnect BLE] âœ… Dispositivo alvo encontrado: ${name}`);
            }
          }
        }
      );

      // Aguardar scan ou parar se encontrou
      const startTime = Date.now();
      while (!foundDevice && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await BleClient.stopLEScan();
      console.log('[AutoConnect BLE] Scan finalizado');

      if (foundDevice) {
        console.log(`[AutoConnect BLE] Tentando conectar a ${foundDevice.name}...`);
        const success = await this.connectBluetooth(foundDevice.id, foundDevice.name);

        if (success) {
          console.log('[AutoConnect BLE] âœ… Conectado com sucesso!');
          return true;
        }
      }

      console.log('[AutoConnect BLE] Nenhum dispositivo compatÃ­vel encontrado');
      return false;

    } catch (error) {
      console.error('[AutoConnect BLE] Erro:', error);
      return false;
    }
  }

  /**
   * ðŸ”§ Inicializa BleClient de forma idempotente (evita mÃºltiplas inicializaÃ§Ãµes)
   * NecessÃ¡rio no WEB para popular o mapa interno do BleClient
   */
  private async ensureBleInitialized(): Promise<boolean> {
    if (this.bleInitialized) {
      return true;
    }
    try {
      await BleClient.initialize({
        androidNeverForLocation: false,
      });
      this.bleInitialized = true;
      console.log('[BLE] âœ… BleClient inicializado (idempotente)');
      return true;
    } catch (error) {
      console.error('[BLE] âŒ Falha ao inicializar BleClient:', error);
      return false;
    }
  }

  /**
   * Escaneia dispositivos Bluetooth
   * ðŸ”§ CORREÃ‡ÃƒO WEB: Agora usa BleClient.requestDevice() no navegador
   * para garantir que o dispositivo entre no mapa interno do BleClient.
   * Isso evita o erro "Device not found" ao conectar.
   */
  async scanBluetoothDevices(timeout: number = 5000): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];

    try {
      // Verificar se estÃ¡ no navegador web
      if (this.isWeb()) {
        // ðŸ”§ CORREÃ‡ÃƒO: Inicializar BleClient primeiro (idempotente)
        const initialized = await this.ensureBleInitialized();
        if (!initialized) {
          console.warn('[BLE WEB] BleClient nÃ£o inicializado, abortando scan');
          return devices;
        }

        // ðŸ”§ CORREÃ‡ÃƒO: Usar BleClient.requestDevice() ao invÃ©s de navigator.bluetooth
        // Isso garante que o dispositivo seja adicionado ao mapa interno do BleClient
        try {
          console.log('[BLE WEB] Abrindo picker via BleClient.requestDevice()...');
          const device = await BleClient.requestDevice({
            services: [ESP32_SERVICE_UUID],
            namePrefix: 'Kiosk',
            optionalServices: [ESP32_SERVICE_UUID],
          });

          if (device && device.deviceId) {
            devices.push({
              id: device.deviceId,
              name: device.name || 'ESP32 Bluetooth',
              type: 'bluetooth',
            });
            console.log('[BLE WEB] âœ… Dispositivo selecionado:', device.name, '| deviceId:', device.deviceId);
          }
        } catch (pickerError: any) {
          // UsuÃ¡rio cancelou o picker ou erro
          if (pickerError.message?.includes('cancelled') || pickerError.message?.includes('NotFoundError') || pickerError.name === 'NotFoundError') {
            console.log('[BLE WEB] âš ï¸ Picker cancelado pelo usuÃ¡rio');
          } else {
            console.warn('[BLE WEB] âŒ Erro no picker:', pickerError);
          }
        }
        return devices;
      }

      // No Android/nativo, usar Capacitor BLE
      console.log('[BLE] Iniciando scan no Android...');

      // Inicializar BLE com permissÃµes
      await BleClient.initialize({
        androidNeverForLocation: false,
      });

      // ðŸ†• ESTRATÃ‰GIA: Fazer scan SEM filtro de UUID para encontrar todos os dispositivos BLE
      // Depois filtramos por nome (mais confiÃ¡vel com dispositivos com PIN)
      console.log('[BLE] Iniciando scan geral (sem filtro UUID)...');
      console.log('[BLE] Procurando dispositivos com nome contendo: kiosk, esp32, bier');

      await BleClient.requestLEScan(
        {
          allowDuplicates: false,
          // ðŸ†• NÃƒO filtrar por serviÃ§o UUID - dispositivos com PIN podem nÃ£o anunciar
        },
        (result) => {
          const deviceName = result.device.name || '';
          const deviceId = result.device.deviceId;

          // Log TODOS os dispositivos encontrados (para debug)
          if (deviceName) {
            console.log(`[BLE] Dispositivo: "${deviceName}" (${deviceId}) RSSI: ${result.rssi}`);
          }

          // Filtrar por nome que contenha "Kiosk", "ESP32" ou "Bier"
          const nameLower = deviceName.toLowerCase();
          if (nameLower.includes('kiosk') ||
            nameLower.includes('esp32') ||
            nameLower.includes('bier')) {
            const device: ESP32Device = {
              id: deviceId,
              name: deviceName,
              type: 'bluetooth',
              rssi: result.rssi,
            };

            if (!devices.find((d) => d.id === device.id)) {
              devices.push(device);
              console.log(`[BLE] âœ… ENCONTRADO: "${deviceName}" (${deviceId}) RSSI: ${result.rssi}`);
            }
          }
        }
      );

      // Aguardar scan (tempo maior para dispositivos com PIN)
      await new Promise((resolve) => setTimeout(resolve, timeout));
      await BleClient.stopLEScan();

      console.log(`[BLE] Scan finalizado. ${devices.length} dispositivo(s) compatÃ­vel(is) encontrado(s).`);
      return devices;
    } catch (error) {
      console.error('[BLE] Erro no scan:', error);
      return devices;
    }
  }

  /**
   * Conecta via Bluetooth
   * ðŸ”§ WEB FIX: Garante inicializaÃ§Ã£o e popula mapa via getDevices/requestDevice
   * ðŸ†• Configura notifications para receber respostas do ESP32
   */
  async connectBluetooth(deviceId: string, deviceName?: string): Promise<boolean> {
    try {
      const bleReady = await this.ensureBleInitialized();
      if (!bleReady) {
        console.error('[BLE] Failed to initialize BleClient before connect');
        return false;
      }
      // ðŸ”§ CORREÃ‡ÃƒO WEB: Inicializar BleClient e garantir dispositivo no mapa
      if (this.isWeb()) {
        const initialized = await this.ensureBleInitialized();
        if (!initialized) {
          console.error('[BLE WEB] âŒ Falha ao inicializar BleClient');
          return false;
        }

        // Tentar repopular o mapa interno com o deviceId salvo
        if (deviceId) {
          console.log('[BLE WEB] ðŸ” Tentando getDevices({ deviceIds: ["' + deviceId + '"] })...');
          try {
            const knownDevices = await BleClient.getDevices([deviceId]);
            console.log('[BLE WEB] getDevices retornou:', knownDevices.length, 'dispositivo(s)');

            if (knownDevices.length === 0) {
              // Dispositivo nÃ£o estÃ¡ no mapa, precisa de requestDevice
              console.log('[BLE WEB] âš ï¸ Dispositivo nÃ£o encontrado no mapa, abrindo picker...');
              try {
                const device = await BleClient.requestDevice({
                  services: [ESP32_SERVICE_UUID],
                  namePrefix: 'Kiosk',
                  optionalServices: [ESP32_SERVICE_UUID],
                });
                if (device && device.deviceId) {
                  deviceId = device.deviceId;
                  deviceName = device.name || deviceName;
                  console.log('[BLE WEB] âœ… Novo dispositivo selecionado:', deviceName, '| deviceId:', deviceId);
                } else {
                  console.log('[BLE WEB] âŒ Nenhum dispositivo selecionado');
                  return false;
                }
              } catch (pickerError: any) {
                if (pickerError.message?.includes('cancelled') || pickerError.name === 'NotFoundError') {
                  console.log('[BLE WEB] âš ï¸ Picker cancelado, nÃ£o tentando conectar');
                } else {
                  console.error('[BLE WEB] âŒ Erro no picker:', pickerError);
                }
                return false;
              }
            } else {
              console.log('[BLE WEB] âœ… Dispositivo encontrado no mapa via getDevices');
            }
          } catch (getDevicesError) {
            console.warn('[BLE WEB] getDevices falhou, tentando requestDevice:', getDevicesError);
            try {
              const device = await BleClient.requestDevice({
                services: [ESP32_SERVICE_UUID],
                namePrefix: 'Kiosk',
                optionalServices: [ESP32_SERVICE_UUID],
              });
              if (device && device.deviceId) {
                deviceId = device.deviceId;
                deviceName = device.name || deviceName;
                console.log('[BLE WEB] âœ… Dispositivo via fallback requestDevice:', deviceName);
              } else {
                return false;
              }
            } catch (pickerError: any) {
              if (pickerError.message?.includes('cancelled') || pickerError.name === 'NotFoundError') {
                console.log('[BLE WEB] âš ï¸ Picker cancelado');
              } else {
                console.error('[BLE WEB] âŒ Erro no picker:', pickerError);
              }
              return false;
            }
          }
        } else {
          // Sem deviceId, precisa de requestDevice
          console.log('[BLE WEB] Sem deviceId salvo, abrindo picker...');
          try {
            const device = await BleClient.requestDevice({
              services: [ESP32_SERVICE_UUID],
              namePrefix: 'Kiosk',
              optionalServices: [ESP32_SERVICE_UUID],
            });
            if (device && device.deviceId) {
              deviceId = device.deviceId;
              deviceName = device.name || 'ESP32 Bluetooth';
              console.log('[BLE WEB] âœ… Dispositivo selecionado:', deviceName, '| deviceId:', deviceId);
            } else {
              console.log('[BLE WEB] âŒ Nenhum dispositivo selecionado');
              return false;
            }
          } catch (pickerError: any) {
            if (pickerError.message?.includes('cancelled') || pickerError.name === 'NotFoundError') {
              console.log('[BLE WEB] âš ï¸ Picker cancelado');
            } else {
              console.error('[BLE WEB] âŒ Erro no picker:', pickerError);
            }
            return false;
          }
        }
      }

      console.log('[BLE] ðŸ”Œ Conectando ao deviceId:', deviceId);
      await BleClient.connect(deviceId, (disconnectedDeviceId) => {
        if (Date.now() < this.suppressBleDisconnectUntil) {
          console.log('[BLE] Callback de desconexão ignorado (promoção USB):', disconnectedDeviceId);
          return;
        }
        console.log('[BLE] Dispositivo desconectado:', disconnectedDeviceId);
        this.handleConnectionDropped('ble_disconnect_callback');
      });

      // ðŸ†• CORREÃ‡ÃƒO: Solicitar MTU maior para evitar fragmentaÃ§Ã£o de JSON
      // O MTU padrÃ£o do BLE Ã© ~23 bytes, mas nossos JSONs podem ter 150+ bytes
      try {
        const bleClientAny = BleClient as any;
        if (typeof bleClientAny.requestMtu === 'function') {
          const mtu = await bleClientAny.requestMtu(deviceId, 512);
          console.log('[BLE] MTU negociado:', mtu);
        } else {
          console.warn('[BLE] requestMtu nÃ£o disponÃ­vel nesta versÃ£o do plugin');
        }
      } catch (mtuError) {
        console.warn('[BLE] NÃ£o foi possÃ­vel aumentar MTU (continuando com padrÃ£o):', mtuError);
      }

      // ðŸ†• Limpar buffer ao conectar
      this.bleReceiveBuffer = '';

      // ðŸ†• Configurar notifications para receber respostas do ESP32
      try {
        await BleClient.startNotifications(
          deviceId,
          ESP32_SERVICE_UUID,
          ESP32_CHARACTERISTIC_UUID,
          (value: DataView) => {
            // Decodificar dados recebidos
            const decoder = new TextDecoder();
            const chunk = decoder.decode(value.buffer);
            console.log('[BLE] Chunk recebido (' + chunk.length + ' bytes):', chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''));

            // ðŸ†• Adicionar ao buffer e processar linhas completas
            this.bleReceiveBuffer += chunk;

            // Processar linhas completas (terminadas em \n)
            const lines = this.bleReceiveBuffer.split('\n');
            // Manter Ãºltima linha incompleta no buffer
            this.bleReceiveBuffer = lines.pop() || '';

            // Processar cada linha completa
            for (const line of lines) {
              const trimmed = line.trim();
              this.observeInboundPayload(trimmed);
              if (trimmed && this.bleDataListeners.size > 0) {
                console.log('[BLE] Linha completa:', trimmed);
                this.bleDataListeners.forEach(listener => {
                  try {
                    listener(trimmed);
                  } catch (error) {
                    console.error('[BLE] Erro em listener de dados:', error);
                  }
                });
              }
            }

            // ðŸ”§ CORREÃ‡ÃƒO v4.0.6: Se o buffer ficou muito grande, processar parcialmente
            // usando parser que suporta JSON aninhado
            if (this.bleReceiveBuffer.length > 4096) {
              console.warn('[BLE] Buffer muito grande (' + this.bleReceiveBuffer.length + '), tentando processar...');

              // ðŸ”§ v4.0.6: Extrair JSONs completos (suporta aninhamento)
              const extractedJsons = this.extractCompleteJsons(this.bleReceiveBuffer);

              if (extractedJsons.jsons.length > 0) {
                for (const jsonStr of extractedJsons.jsons) {
                  if (this.bleDataListeners.size > 0) {
                    console.log('[BLE] JSON extraÃ­do do buffer grande:', jsonStr.substring(0, 50));
                    this.bleDataListeners.forEach(listener => {
                      try {
                        listener(jsonStr);
                      } catch (error) {
                        console.error('[BLE] Erro em listener de dados:', error);
                      }
                    });
                  }
                }
                // Manter apenas o resto do buffer apÃ³s os JSONs extraÃ­dos
                this.bleReceiveBuffer = extractedJsons.remainder;
              } else {
                // Se nÃ£o encontrou JSON, manter apenas os Ãºltimos 1KB
                console.warn('[BLE] Nenhum JSON encontrado, truncando buffer para 1KB');
                this.bleReceiveBuffer = this.bleReceiveBuffer.substring(this.bleReceiveBuffer.length - 1024);
              }
            }
          }
        );
        console.log('[BLE] Notifications configuradas com sucesso');
      } catch (notifyError) {
        console.warn('[BLE] NÃ£o foi possÃ­vel configurar notifications:', notifyError);
        // Continuar mesmo sem notifications (alguns ESP32 nÃ£o suportam)
      }

      this.connectionStatus = {
        connected: true,
        type: 'bluetooth',
        deviceId: deviceId,
        deviceName: deviceName || 'ESP32 Bluetooth',
      };

      // Salvar Ãºltima conexÃ£o
      this.setLastConnection({
        type: 'bluetooth',
        deviceId: deviceId,
        deviceName: deviceName || 'ESP32 Bluetooth',
      });

      this.notifyConnectionChange();
      this.handleConnectionEstablished('connect_bluetooth_success');
      console.log('[BLE] Conectado ao dispositivo:', deviceId);
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao conectar:', error);
      systemLogService.error('esp32', `Erro conexão BLE: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Envia comando via Bluetooth
   */
  async sendBluetoothCommand(command: string): Promise<boolean> {
    if (
      !this.connectionStatus.connected ||
      this.connectionStatus.type !== 'bluetooth'
    ) {
      console.error('[BLE] NÃ£o conectado');
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command + '\n');

      await BleClient.write(
        this.connectionStatus.deviceId!,
        ESP32_SERVICE_UUID,
        ESP32_CHARACTERISTIC_UUID,
        new DataView(data.buffer)
      );

      console.log('[BLE] Comando enviado:', command);
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao enviar comando:', error);
      systemLogService.error('esp32', `Erro envio BLE: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // ============================================
  // USB SERIAL (WEB SERIAL API)
  // ============================================

  /**
   * Verifica se Web Serial API estÃ¡ disponÃ­vel
   */
  hasWebSerialAPI(): boolean {
    return getWebSerial() !== undefined;
  }

  /**
   * Lista portas USB disponÃ­veis
   * Tenta Web Serial API primeiro, depois fallback
   */
  async scanUSBDevices(): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];
    const webSerial = getWebSerial();

    if (webSerial) {
      try {
        const ports = await webSerial.getPorts();

        ports.forEach((port: SerialPort, index: number) => {
          devices.push({
            id: `usb-${index}`,
            name: `Porta USB ${index + 1}`,
            type: 'usb',
          });
        });

        console.log('[USB] Portas Web Serial encontradas:', ports.length);
      } catch (error) {
        console.warn('[USB] Erro ao listar Web Serial:', error);
      }
    } else {
      console.log('[USB] Web Serial API nÃ£o disponÃ­vel - tente conectar um dispositivo USB');
    }

    // No Android com Capacitor, o USB Ã© detectado via permissÃµes
    if (this.isAndroid()) {
      devices.push({
        id: 'android-usb',
        name: 'ConexÃ£o USB Android (OTG)',
        type: 'usb',
      });
      console.log('[USB] Dispositivo USB Android adicionado');
    }

    return devices;
  }

  /**
   * Conecta via USB Serial
   * No Android, redireciona para connectUSBNative() (plugin Capacitor)
   * Na Web, usa Web Serial API (navigator.serial)
   * @param baudRate Baudrate (padrÃ£o: 115200 conforme firmware v2.0)
   */
  async connectUSB(baudRate: number = DEFAULT_BAUDRATE): Promise<boolean> {
    // ðŸ”§ FIX: No Android, redirecionar para implementaÃ§Ã£o nativa (USB OTG)
    if (this.isAndroid()) {
      console.log('[ESP32][USB] Plataforma Android detectada, usando connectUSBNative()');
      return this.connectUSBNative();
    }

    // ðŸ”§ FIX C1+H1: Na Web, delegar para esp32SerialService (fonte Ãºnica de verdade)
    // Isso evita split-brain de estado (duas portas abertas) e garante leitura contÃ­nua.
    console.log('[ESP32][USB] Plataforma Web, delegando para esp32SerialService.connect()');
    try {
      const success = await esp32Serial.connect();
      if (success) {
        // Sincronizar estado do CommunicationService com a conexÃ£o do SerialService
        this.connectionStatus = {
          connected: true,
          type: 'usb',
          deviceId: 'usb-serial',
          deviceName: 'USB Serial (Web)',
        };

        this.setLastConnection({
          type: 'usb',
          deviceId: 'usb-serial',
          deviceName: 'USB Serial (Web)',
        });

        this.notifyConnectionChange();
        this.handleConnectionEstablished('connect_usb_web_success');
        console.log('[ESP32][USB] Conectado via Web Serial (delegado a esp32SerialService)');
      }
      return success;
    } catch (error) {
      console.error('[ESP32][USB] Erro ao conectar via Web Serial:', error);
      return false;
    }
  }

  /**
   * Envia comando via USB Serial
   * ðŸ”§ FIX: Usa esp32Serial como fallback quando serialPort local nÃ£o estÃ¡ disponÃ­vel
   */
  async sendUSBCommand(command: string): Promise<boolean> {
    // ðŸ”§ FIX: Se serialPort local nÃ£o estÃ¡ disponÃ­vel, usar esp32Serial (conectado via ESP32Context)
    if ((!this.serialPort || !this.serialPort.writable) && esp32Serial.isConnected()) {
      console.log('[USB] Usando esp32Serial como fallback para enviar comando');
      return esp32Serial.sendRaw(command);
    }

    if (!this.serialPort || !this.serialPort.writable) {
      console.error('[USB] Porta nÃ£o aberta e esp32Serial nÃ£o conectado');
      return false;
    }

    const writer = this.serialPort.writable.getWriter();
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command + '\n');

      await writer.write(data);

      console.log('[USB] Comando enviado:', command);
      return true;
    } catch (error) {
      console.error('[USB] Erro ao enviar:', error);
      systemLogService.error('serial', `Erro envio USB: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      // Garantir que o lock seja sempre liberado
      writer.releaseLock();
    }
  }

  /**
   * LÃª dados da porta USB
   */
  async readUSBData(): Promise<string | null> {
    if (!this.serialPort || !this.serialPort.readable) {
      return null;
    }

    const reader = this.serialPort.readable.getReader();
    try {
      const { value } = await reader.read();

      if (value) {
        const decoder = new TextDecoder();
        return decoder.decode(value);
      }
      return null;
    } catch (error) {
      console.error('[USB] Erro ao ler dados:', error);
      return null;
    } finally {
      // Garantir que o lock seja sempre liberado
      reader.releaseLock();
    }
  }

  // ============================================
  // WIFI (HTTP)
  // ============================================

  /**
   * Configura IP do ESP32 para conexÃ£o WiFi
   */
  setESP32IpAddress(ip: string): void {
    this.esp32IpAddress = ip;
    console.log('[WiFi] IP do ESP32 configurado:', ip);
  }

  /**
   * Escaneia rede para encontrar ESP32
   * Processa em batches para nÃ£o travar a UI
   * NOTA: No navegador, CORS bloqueia requests diretos. 
   * Funciona melhor no Android nativo ou com CORS habilitado no ESP32.
   */
  async scanWifiDevices(baseIp: string = '192.168.1'): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];

    // No navegador web, CORS impede scan de rede
    // Apenas mostrar mensagem informativa
    if (this.isWeb()) {
      console.warn('[WiFi] Scan de rede limitado no navegador devido a CORS.');
      console.log('[WiFi] Use conexÃ£o manual com IP ou execute no app Android.');
      // Retornar lista vazia - usuÃ¡rio deve usar conexÃ£o manual
      return devices;
    }

    const BATCH_SIZE = 25; // Processa 25 IPs por vez
    const TIMEOUT_PER_IP = 300; // 300ms timeout por IP

    // Processar em batches para nÃ£o sobrecarregar
    for (let batch = 0; batch < Math.ceil(254 / BATCH_SIZE); batch++) {
      const startIp = batch * BATCH_SIZE + 1;
      const endIp = Math.min(startIp + BATCH_SIZE - 1, 254);
      const batchPromises: Promise<void>[] = [];

      for (let i = startIp; i <= endIp; i++) {
        const ip = `${baseIp}.${i}`;
        const promise = this.checkESP32AtIp(ip, TIMEOUT_PER_IP)
          .then((isESP32) => {
            if (isESP32) {
              devices.push({
                id: ip,
                name: `ESP32 @ ${ip}`,
                type: 'wifi',
                ipAddress: ip,
              });
            }
          })
          .catch(() => { }); // Ignorar erros de conexÃ£o

        batchPromises.push(promise);
      }

      // Aguardar batch com timeout global de 5s
      await Promise.race([
        Promise.all(batchPromises),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      // Se jÃ¡ encontrou algum dispositivo, retornar mais cedo
      if (devices.length > 0 && batch > 2) {
        console.log('[WiFi] Dispositivo encontrado, interrompendo scan');
        break;
      }
    }

    return devices;
  }

  /**
   * Verifica se hÃ¡ ESP32 em um IP especÃ­fico
   * NOTA: No navegador, CORS pode bloquear. Funciona no Android nativo.
   */
  private async checkESP32AtIp(ip: string, timeoutMs: number = 500): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(buildLocalHttpUrl(ip, '/status'), {
        method: 'GET',
        signal: controller.signal,
        // Tentar sem CORS primeiro (retorna opaque response mas nÃ£o erro)
        mode: this.isWeb() ? 'no-cors' : 'cors',
      });

      clearTimeout(timeout);

      // No modo no-cors, nÃ£o podemos ler o corpo, mas se nÃ£o deu erro, pode ser um dispositivo
      if (this.isWeb()) {
        // Apenas verificar se nÃ£o houve erro de rede
        return response.type === 'opaque' || response.ok;
      }

      if (response.ok) {
        const data = await response.json();
        return data.device === 'ESP32' || data.type === 'kiosk-controller';
      }
      return false;
    } catch {
      return false;
    }
  }

  // ============================================
  // CONEXÃƒO USB OTG NATIVA (ANDROID)
  // ============================================

  /**
   * Tenta auto-conectar via USB OTG nativo (sem interaÃ§Ã£o do usuÃ¡rio)
   * Usado pelo hook de autoconexÃ£o
   * @returns true se conectou com sucesso
   */
  async autoConnectUSBNative(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[AutoConnect USB OTG] NÃ£o Ã© plataforma nativa');
      return false;
    }

    try {
      await ensureUsbSerialPluginLoaded();
      const plugin = getUsbSerialPlugin();
      if (!plugin) {
        console.log('[AutoConnect USB OTG] Plugin nÃ£o disponÃ­vel');
        return false;
      }

      await this.ensureNativeUSBPluginListeners(plugin);

      const devices = await this.fetchNativeUSBDevices(plugin);
      this.logNativeUSBDevices('auto_connect_probe', devices);
      if (devices.length === 0) {
        console.log('[AutoConnect USB OTG] Nenhum dispositivo USB encontrado');
        return false;
      }

      console.log(`[AutoConnect USB OTG] ${devices.length} dispositivo(s) encontrado(s)`);

      return await this.connectUSBNative(USB_NATIVE_CONNECT_TIMEOUT_MS);
    } catch (error) {
      console.warn('[AutoConnect USB OTG] Falha:', error);
      return false;
    }
  }

  /**
   * Conecta via USB OTG nativo no Android usando capacitor-usb-serial-plugin
   * @returns true se conectou com sucesso
   */
  async connectUSBNative(timeoutMs: number = USB_NATIVE_CONNECT_TIMEOUT_MS): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.warn('[USB OTG] Disponível apenas em plataformas nativas (Android/iOS)');
      return false;
    }

    // Cooldown após erro USB recente — aguardar antes de tentar reconectar
    const timeSinceError = Date.now() - this.lastUsbErrorAt;
    if (this.lastUsbErrorAt > 0 && timeSinceError < USB_ERROR_COOLDOWN_MS) {
      console.log(`[USB OTG] Cooldown ativo (${USB_ERROR_COOLDOWN_MS - timeSinceError}ms restantes)`);
      return false;
    }

    if (this.nativeUsbConnectPromise) {
      return this.nativeUsbConnectPromise;
    }

    this.nativeUsbConnectPromise = (async () => {
      try {
        // 🔧 FIX Bug #11: Usar disconnectCurrentTransportOnly() em vez de disconnect().
        // disconnect() seta manualDisconnectRequested=true — se o USB connect falhar
        // em seguida, o supervisor nunca mais tenta reconexão automática (bloqueado).
        // disconnectCurrentTransportOnly() encerra o transporte sem tocar no flag.
        if (this.connectionStatus.connected && this.connectionStatus.type !== 'usb') {
          console.log(`[USB OTG] Desconectando transporte atual (${this.connectionStatus.type}) antes de conectar USB`);
          await this.disconnectCurrentTransportOnly();
        }

        await ensureUsbSerialPluginLoaded();
        const plugin = getUsbSerialPlugin();
        if (!plugin) {
          throw new USBNativeConnectionError(
            'USB_PLUGIN_UNAVAILABLE',
            'Plugin USB Serial nÃ£o instalado ou nÃ£o compatÃ­vel'
          );
        }

        await this.ensureNativeUSBPluginListeners(plugin);

        console.log('[USB OTG] Buscando dispositivos USB...');
        const devices = await this.fetchNativeUSBDevices(plugin);
        this.logNativeUSBDevices('connect_attempt', devices);

        if (devices.length === 0) {
          throw new USBNativeConnectionError(
            'USB_NO_DEVICE',
            'Nenhum dispositivo USB encontrado para conexÃ£o'
          );
        }

        const targetDevice = this.selectPreferredNativeUSBDevice(devices);
        if (!targetDevice) {
          throw new USBNativeConnectionError('USB_NO_DEVICE', 'Nenhum dispositivo USB elegÃ­vel encontrado');
        }

        const devicesBeforeOpen = await this.fetchNativeUSBDevices(plugin);
        const targetStillPresent = devicesBeforeOpen.some((device) => (
          device.deviceId === targetDevice.deviceId &&
          device.portNum === targetDevice.portNum
        ));
        if (!targetStillPresent) {
          throw new USBNativeConnectionError(
            'USB_NO_DEVICE',
            '[USB OTG] Dispositivo removido antes de iniciar openSerial'
          );
        }

        console.log('[USB OTG] open/connect iniciado:', JSON.stringify({
          deviceId: targetDevice.deviceId,
          vendorId: targetDevice.vendorId,
          productId: targetDevice.productId,
          productName: targetDevice.productName,
          portNum: targetDevice.portNum,
        }));

        let resolveConnected: () => void = () => { };
        let rejectConnected: (error: Error) => void = () => { };
        const connectedPromise = new Promise<void>((resolve, reject) => {
          resolveConnected = resolve;
          rejectConnected = reject;
        });

        let isSettled = false;
        const settleConnected = (fn: () => void) => {
          if (isSettled) return;
          isSettled = true;
          fn();
        };

        const timeoutId = setTimeout(() => {
          settleConnected(() => rejectConnected(
            new USBNativeConnectionError(
              'USB_OPEN_TIMEOUT',
              `[USB OTG] Timeout (${timeoutMs}ms) aguardando permissÃ£o/abertura de porta`
            )
          ));
        }, timeoutMs);

        const tempHandles: USBPluginListenerHandle[] = [];
        try {
          const connectedHandle = this.addNativeUSBListenerSync('connected', (payload: any) => {
            const connectedDevice = this.normalizeNativeUSBDevice(payload);
            console.log('[USB OTG] EVENT connected:', JSON.stringify(connectedDevice ?? payload));

            if (connectedDevice && connectedDevice.deviceId !== targetDevice.deviceId) {
              return;
            }

            settleConnected(() => resolveConnected());
          });
          if (connectedHandle) tempHandles.push(connectedHandle);

          const errorHandle = this.addNativeUSBListenerSync('error', (payload: any) => {
            const errorMessage = typeof payload?.error === 'string'
              ? payload.error
              : JSON.stringify(payload);
            settleConnected(() => rejectConnected(
              new USBNativeConnectionError(
                'USB_OPEN_FAILED',
                `[USB OTG] Erro durante abertura: ${errorMessage}`,
                payload
              )
            ));
          });
          if (errorHandle) tempHandles.push(errorHandle);

          const openSerialOptions = {
            deviceId: targetDevice.deviceId,
            portNum: targetDevice.portNum,
            baudRate: DEFAULT_BAUDRATE,
            dataBits: 8,
            stopBits: 1,
            parity: 0,
          };

          let openResult: any;
          try {
            openResult = await this.withTimeout(
              Promise.resolve(plugin.openSerial(openSerialOptions)),
              timeoutMs,
              'USB_OPEN_TIMEOUT',
              '[USB OTG] Open call timeout em openSerial'
            );
          } catch (error) {
            if (!this.isApiMismatchError(error)) {
              throw error;
            }
            openResult = await this.withTimeout(
              Promise.resolve(plugin.open({
                deviceId: targetDevice.deviceId,
                baudRate: DEFAULT_BAUDRATE,
                dataBits: 8,
                stopBits: 1,
                parity: 0,
              })),
              timeoutMs,
              'USB_OPEN_TIMEOUT',
              '[USB OTG] Open call timeout em open'
            );
          }

          const openSucceeded = (
            openResult === undefined ||
            openResult === null ||
            openResult.success === undefined ||
            Boolean(openResult.success)
          );
          if (!openSucceeded) {
            throw new USBNativeConnectionError(
              'USB_OPEN_FAILED',
              '[USB OTG] Plugin retornou falha ao abrir porta',
              openResult
            );
          }

          if (tempHandles.length > 0) {
            await connectedPromise;
          }
        } finally {
          clearTimeout(timeoutId);
          await Promise.all(tempHandles.map((handle) => handle.remove().catch(() => undefined)));
        }

        // Limpar buffer ao conectar
        this.usbReceiveBuffer = '';

        this.connectionStatus = {
          connected: true,
          type: 'usb',
          deviceId: String(targetDevice.deviceId),
          deviceName: `USB OTG (${targetDevice.productName || 'ESP32'})`,
        };

        this.connectedDevice = {
          id: String(targetDevice.deviceId),
          name: `USB OTG (${targetDevice.productName || 'ESP32'})`,
          type: 'usb',
        };

        this.setLastConnection({
          type: 'usb',
          deviceId: String(targetDevice.deviceId),
          deviceName: `USB OTG (${targetDevice.productName || 'ESP32'})`,
        });

        this.notifyConnectionChange();
        this.handleConnectionEstablished('connect_usb_native_success');
        console.log('[USB OTG] Conectado com sucesso ao ESP32');
        return true;
      } catch (error) {
        // Marcar timestamp de erro para ativar cooldown
        this.lastUsbErrorAt = Date.now();

        const message = this.errorToString(error);
        const lowered = message.toLowerCase();
        const typedError = error instanceof USBNativeConnectionError
          ? error
          : new USBNativeConnectionError(
            lowered.includes('permission') ? 'USB_PERMISSION_DENIED'
              : lowered.includes('device not found') ? 'USB_NO_DEVICE'
                : lowered.includes('connectionfailed:devicenotfound') ? 'USB_NO_DEVICE'
                  : lowered.includes('timeout') ? 'USB_OPEN_TIMEOUT'
                    : lowered.includes('driver') ? 'USB_NO_DRIVER'
                      : 'USB_OPEN_FAILED',
            message,
            error
          );

        console.error('[USB OTG] Erro ao conectar:', {
          code: typedError.code,
          message: typedError.message,
          stack: typedError.stack,
          details: typedError.details,
        });
        throw typedError;
      }
    })();

    try {
      return await this.nativeUsbConnectPromise;
    } finally {
      this.nativeUsbConnectPromise = null;
    }
  }

  /**
   * Lista dispositivos USB disponÃ­veis no Android
   * @returns Array de dispositivos USB
   */
  async listUSBNativeDevices(): Promise<ESP32Device[]> {
    if (!Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      await ensureUsbSerialPluginLoaded();
      const plugin = getUsbSerialPlugin();
      if (!plugin) return [];

      const devices = await this.fetchNativeUSBDevices(plugin);
      this.logNativeUSBDevices('list_devices', devices);
      return devices.map((device) => ({
        id: String(device.deviceId),
        name: device.productName || `USB Device (${device.vendorId}:${device.productId})`,
        type: 'usb' as ConnectionType,
      }));
    } catch (error) {
      console.error('[USB OTG] Erro ao listar dispositivos:', error);
      return [];
    }
  }

  /**
   * Envia comando via USB OTG nativo
   * @param command - Comando a enviar (serÃ¡ convertido para JSON)
   */
  async sendUSBNativeCommand(command: string | object): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || this.connectionStatus.type !== 'usb') {
      console.warn('[USB OTG] NÃ£o conectado via USB nativo');
      return false;
    }

    try {
      await ensureUsbSerialPluginLoaded();
      const plugin = getUsbSerialPlugin();
      if (!plugin) return false;

      const data = typeof command === 'string'
        ? command
        : JSON.stringify(command);

      console.log('[USB OTG] write iniciado:', JSON.stringify({ bytes: data.length }));

      try {
        await this.withTimeout(
          Promise.resolve(plugin.writeSerial({ data: data + '\n' })),
          3000,
          'USB_WRITE_TIMEOUT',
          '[USB OTG] Timeout em writeSerial'
        );
      } catch (error) {
        if (!this.isApiMismatchError(error)) {
          throw error;
        }

        await this.withTimeout(
          Promise.resolve(plugin.write({ value: data + '\n' })),
          3000,
          'USB_WRITE_TIMEOUT',
          '[USB OTG] Timeout em write'
        );
      }

      console.log('[USB OTG] write concluÃ­do');
      return true;
    } catch (error) {
      const message = this.errorToString(error);
      const code = message.toLowerCase().includes('timeout') ? 'USB_WRITE_TIMEOUT' : 'USB_WRITE_FAILED';
      console.error('[USB OTG] Erro ao enviar comando:', {
        code,
        message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      systemLogService.error('serial', `Erro USB OTG: ${code} - ${message}`);
      return false;
    }
  }

  // ============================================
  // CONEXÃƒO WIFI
  // ============================================

  /**
   * Conecta via WiFi
   * NOTA: No navegador, CORS pode impedir verificaÃ§Ã£o. 
   * Assumimos conexÃ£o e deixamos falhar nos comandos.
   */
  async connectWifi(ipAddress: string): Promise<boolean> {
    const TIMEOUT_MS = 5000;

    try {
      // 🔧 PR2: Desconectar transporte anterior se estiver conectado em outro tipo
      if (this.connectionStatus.connected && this.connectionStatus.type !== 'wifi') {
        console.log(`[WiFi] Desconectando transporte atual (${this.connectionStatus.type}) antes de conectar WiFi`);
        await this.disconnect();
      }

      this.esp32IpAddress = ipAddress;

      console.log(`[WiFi] Tentando conectar ao ESP32 em ${ipAddress}...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      // No Android nativo, usar mode 'cors' normal (nÃ£o tem restriÃ§Ã£o CORS)
      // Na web, usar 'no-cors' porque CORS bloqueia
      const fetchMode = this.isWeb() ? 'no-cors' : 'cors';

      console.log(`[WiFi] Usando modo fetch: ${fetchMode} (plataforma: ${Capacitor.getPlatform()})`);

      // Tentar verificar conexÃ£o
      const response = await fetch(buildLocalHttpUrl(ipAddress, '/status'), {
        method: 'GET',
        signal: controller.signal,
        mode: fetchMode,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeout);

      console.log(`[WiFi] Resposta recebida: status=${response.status}, type=${response.type}`);

      // No navegador com no-cors, nÃ£o podemos verificar resposta (opaque)
      // No Android nativo, podemos verificar normalmente
      let isConnected = false;

      if (this.isWeb()) {
        // Na web, opaque response significa que chegou (mas nÃ£o podemos ler)
        isConnected = response.type === 'opaque' || response.ok;
      } else {
        // No Android, verificar resposta normalmente
        isConnected = response.ok;

        if (response.ok) {
          try {
            const data = await response.json();
            console.log('[WiFi] Dados do ESP32:', data);
          } catch (e) {
            console.log('[WiFi] Resposta nÃ£o Ã© JSON, mas conexÃ£o OK');
          }
        }
      }

      if (isConnected) {
        this.connectionStatus = {
          connected: true,
          type: 'wifi',
          deviceId: ipAddress,
          deviceName: `ESP32 @ ${ipAddress}`,
        };

        this.connectedDevice = {
          id: ipAddress,
          name: `ESP32 @ ${ipAddress}`,
          type: 'wifi',
          ipAddress: ipAddress,
        };

        // Salvar Ãºltima conexÃ£o
        this.setLastConnection({
          type: 'wifi',
          ipAddress: ipAddress,
          deviceName: `ESP32 @ ${ipAddress}`,
        });

        this.notifyConnectionChange();
        this.handleConnectionEstablished('connect_wifi_success');
        console.log('[WiFi] Conectado ao ESP32:', ipAddress);
        return true;
      }

      console.warn('[WiFi] ESP32 nÃ£o respondeu em:', ipAddress);
      return false;
    } catch (error: any) {
      // Timeout ou erro de rede
      if (error.name === 'AbortError') {
        console.error('[WiFi] Timeout ao conectar:', ipAddress);
      } else {
        console.error('[WiFi] Erro ao conectar:', error.message || error);
      }
      systemLogService.error('esp32', `Erro conexão WiFi: ${error.name === 'AbortError' ? 'timeout' : (error.message || String(error))}`, { ipAddress });
      return false;
    }
  }

  /**
   * Envia comando via WiFi (HTTP POST)
   * @param action - Nome da aÃ§Ã£o (deve corresponder ao firmware: ping, release_drink, etc.)
   * @param data - Dados adicionais para o comando
   */
  async sendWifiCommand(
    action: string,
    data?: object
  ): Promise<boolean> {
    if (!this.esp32IpAddress) {
      console.error('[WiFi] IP do ESP32 nÃ£o configurado');
      return false;
    }

    // KIO-15 fix: AbortController with 8s timeout to prevent hanging on unreachable ESP32
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(buildLocalHttpUrl(this.esp32IpAddress, '/command'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...data,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[WiFi] Comando enviado:', action, '| Resposta:', result);
        return true;
      }

      console.error('[WiFi] Erro na resposta:', response.status);
      return false;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('[WiFi] Timeout (8s) ao enviar comando:', action);
      } else {
        console.error('[WiFi] Erro ao enviar comando:', error);
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ============================================
  // INTERFACE UNIFICADA
  // ============================================

  /**
   * Retorna status da conexÃ£o atual
   */
  getConnectionStatus(): ConnectionStatus {
    // ðŸ”§ FIX: Se connectionStatus local Ã© 'none' mas esp32Serial estÃ¡ conectado,
    // retornar o estado real da conexÃ£o USB
    if (this.connectionStatus.type === 'none' && esp32Serial.isConnected()) {
      return {
        connected: true,
        type: 'usb',
        deviceName: 'ESP32 (Web Serial)',
      };
    }
    return this.connectionStatus;
  }

  /**
   * ðŸ”§ Sincroniza estado de conexÃ£o USB quando esp32Serial conecta externamente.
   * Deve ser chamado pelo ESP32Context quando esp32Serial.onConnectionChange dispara.
   * Isso garante que sendCommand() funcione mesmo quando a conexÃ£o foi feita pelo esp32Serial.
   */
  syncExternalUSBConnection(connected: boolean): void {
    if (connected && esp32Serial.isConnected()) {
      console.log('[ESP32Service] Sincronizando conexÃ£o USB externa (esp32Serial)');
      this.connectionStatus = {
        connected: true,
        type: 'usb',
        deviceName: 'ESP32 (Web Serial)',
      };
      this.connectedDevice = {
        id: 'web-serial',
        name: 'ESP32 (Web Serial)',
        type: 'usb',
      };
      // Salvar como Ãºltima conexÃ£o
      this.setLastConnection({
        type: 'usb',
        deviceId: 'web-serial',
        deviceName: 'ESP32 (Web Serial)',
      });
      this.notifyConnectionChange();
      this.handleConnectionEstablished('sync_external_usb_connected');
    } else if (!connected && this.connectionStatus.type === 'usb') {
      console.log('[ESP32Service] DesconexÃ£o USB externa detectada');
      this.handleConnectionDropped('sync_external_usb_disconnected');
    }
  }

  /**
   * Escaneia todos os tipos de dispositivos
   */
  async scanAllDevices(): Promise<ESP32Device[]> {
    const allDevices: ESP32Device[] = [];

    // Scan Bluetooth
    if (this.isAndroid()) {
      try {
        const bleDevices = await this.scanBluetoothDevices();
        allDevices.push(...bleDevices);
      } catch (error) {
        console.warn('[Scan] Bluetooth nÃ£o disponÃ­vel:', error);
      }
    }

    // Scan USB (Web Serial API)
    try {
      const usbDevices = await this.scanUSBDevices();
      allDevices.push(...usbDevices);
    } catch (error) {
      console.warn('[Scan] USB nÃ£o disponÃ­vel:', error);
    }

    // Scan WiFi
    try {
      const wifiDevices = await this.scanWifiDevices();
      allDevices.push(...wifiDevices);
    } catch (error) {
      console.warn('[Scan] WiFi scan falhou:', error);
    }

    return allDevices;
  }

  /**
   * Conecta a um dispositivo (auto-detecta tipo)
   */
  async connect(device: ESP32Device): Promise<boolean> {
    switch (device.type) {
      case 'bluetooth':
        return this.connectBluetooth(device.id);
      case 'wifi':
        return this.connectWifi(device.ipAddress || device.id);
      case 'usb':
        // Usar driver nativo no Android, Web Serial na web
        if (Capacitor.isNativePlatform()) {
          return this.connectUSBNative();
        }
        return this.connectUSB();
      default:
        console.error('[Connect] Tipo de conexÃ£o nÃ£o suportado:', device.type);
        return false;
    }
  }

  /**
   * Helper: Verifica se estÃ¡ pronto para enviar comandos
   * ðŸ†• GUARD: Falha rÃ¡pido se nÃ£o conectado
   */
  private canSendCommand(): boolean {
    return (this.connectionStatus.type !== 'none' && this.connectionStatus.connected) || esp32Serial.isConnected();
  }

  /**
   * Verifica conexÃ£o real (transport-agnostic).
   * Envia ping com timeout curto e retorna true somente se o dispositivo responder.
   * Previne stale state onde connectionStatus diz "conectado" mas BLE/USB jÃ¡ desconectou.
   */
  async verifyConnection(timeoutMs: number = 3000): Promise<boolean> {
    if (this.connectionStatus.type === 'none' && !esp32Serial.isConnected()) {
      return false;
    }

    try {
      if (this.connectionStatus.type === 'wifi') {
        return this.ping();
      }

      const recentInboundMs = this.lastInboundAt ? (Date.now() - this.lastInboundAt) : Number.POSITIVE_INFINITY;
      if (recentInboundMs <= 2000) {
        return true;
      }

      let waiter: ((ok: boolean) => void) | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const ackPromise = new Promise<boolean>((resolve) => {
        waiter = (ok: boolean) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (waiter) this.pendingPingWaiters.delete(waiter);
          resolve(ok);
        };
        this.pendingPingWaiters.add(waiter);
        timeoutId = setTimeout(() => {
          if (waiter) this.pendingPingWaiters.delete(waiter);
          resolve(false);
        }, timeoutMs);
      });

      const pingSent = await this.ping();
      if (!pingSent) {
        if (timeoutId) clearTimeout(timeoutId);
        if (waiter) this.pendingPingWaiters.delete(waiter);
        return false;
      }

      return await ackPromise;
    } catch {
      return false;
    }
  }

  /**
   * Envia comando (auto-detecta tipo de conexÃ£o)
   * ðŸ†• CORRIGIDO: Agora formata JSON completo para todos os protocolos
   * ðŸ”§ FIX: Verifica esp32Serial.isConnected() como fallback quando connectionStatus Ã© 'none'
   */
  async sendCommand(command: string, data?: object): Promise<boolean> {
    // ðŸ”§ GUARD: Falha rÃ¡pido se nÃ£o conectado
    if (!this.canSendCommand()) {
      console.error(`[SendCommand] âŒ Device not connected - cannot send: ${command}`);
      return false;
    }

    // Construir payload JSON completo com action + parÃ¢metros
    const payload = data ? { action: command, ...data } : { action: command };
    const jsonString = JSON.stringify(payload);

    console.log(`[SendCommand] Tipo: ${this.connectionStatus.type}, esp32Serial.isConnected: ${esp32Serial.isConnected()}, Payload: ${jsonString}`);

    // ðŸ”§ FIX: Se connectionStatus Ã© 'none' mas esp32Serial estÃ¡ conectado (conexÃ£o feita externamente),
    // usar esp32Serial diretamente. Isso resolve o bug onde botÃµes de UI nÃ£o enviavam comandos.
    if (this.connectionStatus.type === 'none' && esp32Serial.isConnected()) {
      console.log('[SendCommand] Usando esp32Serial (Web Serial conectado externamente)');
      return esp32Serial.sendRaw(jsonString);
    }

    switch (this.connectionStatus.type) {
      case 'bluetooth':
        // ðŸ†• Envia JSON completo (nÃ£o apenas o nome do comando)
        return this.sendBluetoothCommand(jsonString);
      case 'wifi':
        return this.sendWifiCommand(command, data);
      case 'usb':
        // Usar driver nativo no Android, Web Serial na web
        if (Capacitor.isNativePlatform()) {
          // ðŸ†• Envia JSON completo
          return this.sendUSBNativeCommand(jsonString);
        }
        // ðŸ†• Envia JSON completo
        return this.sendUSBCommand(jsonString);
      default:
        console.error('[Send] Nenhuma conexÃ£o ativa (connectionStatus.type:', this.connectionStatus.type, ', esp32Serial:', esp32Serial.isConnected(), ')');
        return false;
    }
  }

  /**
   * Desconecta do dispositivo atual
   */
  async disconnect(): Promise<void> {
    this.manualDisconnectRequested = true;
    this.clearSupervisorReconnectTimer();
    this.stopSupervisorHealthCheck();
    this.resolvePendingPingWaiters(false);

    // Parar heartbeat primeiro
    this.stopHeartbeat();

    if (
      this.connectionStatus.type === 'bluetooth' &&
      this.connectionStatus.deviceId
    ) {
      try {
        await BleClient.disconnect(this.connectionStatus.deviceId);
      } catch (error) {
        console.warn('[Disconnect] Erro ao desconectar BLE:', error);
      }
    }

    if (this.connectionStatus.type === 'usb') {
      // Desconectar USB OTG nativo no Android
      if (Capacitor.isNativePlatform()) {
        try {
          await ensureUsbSerialPluginLoaded();
          const plugin = getUsbSerialPlugin();
          if (plugin) {
            try {
              await this.withTimeout(
                Promise.resolve(plugin.closeSerial()),
                3000,
                'USB_CLOSE_TIMEOUT',
                '[USB OTG] Timeout em closeSerial'
              );
            } catch (error) {
              if (!this.isApiMismatchError(error)) {
                throw error;
              }

              await this.withTimeout(
                Promise.resolve(plugin.close()),
                3000,
                'USB_CLOSE_TIMEOUT',
                '[USB OTG] Timeout em close'
              );
            }
            console.log('[USB OTG] ConexÃ£o fechada');
          }
        } catch (error) {
          console.warn('[Disconnect] Erro ao fechar USB OTG:', error);
        }
      }
      // Desconectar Web Serial na web
      if (this.serialPort) {
        try {
          await this.serialPort.close();
        } catch (error) {
          console.warn('[Disconnect] Erro ao fechar USB:', error);
        }
      }
    }

    this.connectionStatus = { connected: false, type: 'none' };
    this.connectedDevice = null;
    this.esp32IpAddress = '';
    this.serialPort = null;

    this.notifyConnectionChange();
    this.updateSupervisorStatus({
      state: 'idle',
      attempt: 0,
      nextDelayMs: 0,
      reason: 'manual_disconnect',
      transport: 'none',
      deviceId: undefined,
      consecutiveHealthFailures: 0,
    });
    this.logSupervisor('manual_disconnect');
    console.log('[Disconnect] Desconectado');
  }

  // ============================================
  // COMANDOS ESPECÃFICOS DO KIOSK
  // CompatÃ­veis com firmware esp32_drink_dispenser.ino
  // ============================================

  /**
   * Dispensar bebida
   * Formato compatÃ­vel com firmware: {"action":"release_drink","orderId":"...","mlPerUnit":...,"quantity":...,"sizeLabel":"..."}
   */
  async dispenseDrink(
    orderId: string,
    mlPerUnit: number,
    quantity: number = 1,
    sizeLabel: string = 'PadrÃ£o',
    tapId: number = 0  // ðŸ†• Multi-Tap
  ): Promise<boolean> {
    // ðŸ”§ CORREÃ‡ÃƒO: NÃ£o fazer JSON.stringify aqui - sendCommand jÃ¡ faz internamente
    return this.sendCommand('release_drink', {
      orderId,
      mlPerUnit,
      quantity,
      sizeLabel,
      tapId,
    });
  }

  /**
   * Sinaliza ao supervisor que uma dispensação está em andamento.
   * Impede healthcheck pings durante dispense — o ESP32 está ocupado
   * controlando solenóides/fluxo e pode não responder a pings a tempo.
   */
  setDispensingInProgress(active: boolean): void {
    this.dispensingInProgress = active;
    console.log(`[ESP32] dispensingInProgress = ${active}`);
  }

  /**
   * Ping/Pong para testar conexão
   * Formato compatível com firmware: {"action":"ping"}
   */
  async ping(): Promise<boolean> {
    // ðŸ”§ CORREÃ‡ÃƒO: Usar sendCommand unificado (ele detecta tipo de conexÃ£o automaticamente)
    return this.sendCommand('ping');
  }

  // ============================================
  // NOVOS MÃ‰TODOS (Firmware v2.1+)
  // ============================================

  /**
   * Salvar calibraÃ§Ã£o no NVS do ESP32
   * ðŸ†• Multi-Tap: tapId opcional (default 0)
   */
  async saveCalibration(pulsosPorLitro: number, mlPorSegundo: number, tapId: number = 0): Promise<boolean> {
    // ðŸ”§ CORREÃ‡ÃƒO: Usar sendCommand unificado
    return this.sendCommand('save_calibration', {
      pulsos_por_litro: pulsosPorLitro,
      ml_por_segundo: mlPorSegundo,
      tapId,
    });
  }

  /**
   * Obter configuraÃ§Ãµes atuais do ESP32
   */
  async getSettings(): Promise<boolean> {
    // ðŸ”§ CORREÃ‡ÃƒO: Usar sendCommand unificado
    return this.sendCommand('get_settings');
  }

  // ðŸ”§ v4.0.6: startWifiPortal() e resetWifi() REMOVIDOS
  // Essas funÃ§Ãµes foram removidas do firmware v3.0+ (Access Point fixo)
  // Se precisar dessas funÃ§Ãµes, use firmware anterior ou reconfigure manualmente

  /**
   * Obter status do ESP32
   */
  async getESP32Status(): Promise<object | null> {
    if (this.connectionStatus.type === 'wifi' && this.esp32IpAddress) {
      try {
        const response = await fetch(buildLocalHttpUrl(this.esp32IpAddress, '/status'));
        if (response.ok) {
          return response.json();
        }
      } catch (error) {
        console.error('[Status] Erro:', error);
      }
    }

    // Para Serial/Bluetooth, enviar ping e aguardar pong
    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      await this.ping();
      // Nota: Resposta virÃ¡ via callback ou leitura assÃ­ncrona
      return { connected: true, type: this.connectionStatus.type };
    }

    return null;
  }

  /**
   * Calibrar bomba
   * Formato compatÃ­vel com firmware: {"action":"calibrate","duration":5000,"tapId":0}
   * ðŸ†• Multi-Tap: tapId opcional (default 0)
   */
  async calibratePump(durationMs: number = 5000, tapId: number = 0): Promise<boolean> {
    // ðŸ”§ CORREÃ‡ÃƒO: Usar sendCommand unificado + suporte multi-tap
    return this.sendCommand('calibrate', { duration: durationMs, tapId });
  }

  /**
   * Beep/Alerta sonoro (precisa ser implementado no firmware)
   */
  async beep(times: number = 1): Promise<boolean> {
    // ðŸ”§ CORREÃ‡ÃƒO: Usar sendCommand unificado
    return this.sendCommand('beep', { times });
  }

  /**
   * Configurar multiplas torneiras â€” envia set_config com pins + calibration
   * Firmware deve responder com: {"type":"config_applied","applied":true,"tapsVersion":X}
   * Persiste no NVS do ESP32 e aplica imediatamente.
   */
  async configureMultipleTaps(taps: TapConfig[]): Promise<boolean> {
    console.log('[ESP32] Configurando multiplas torneiras:', taps.length);

    // Mapear camelCase (Kiosk/Admin) -> snake_case (Firmware)
    const mappedTaps = taps.map(tap => {
      const cal = tap.calibration as any;
      const pulsosPorLitro = cal?.pulsesPerLiter ??
        (cal?.mlPerPulse ? Math.round(1000 / cal.mlPerPulse) : undefined);

      return {
        id: tap.id,
        valve_pin: tap.valvePin ?? (tap as any).valve_pin,
        sensor_pin: tap.sensorPin ?? (tap as any).sensor_pin,
        pulsos_por_litro: pulsosPorLitro,
        ml_por_segundo: cal?.mlPerSecond ?? cal?.flowRate,
      };
    });

    return this.sendCommand('set_config', { taps: mappedTaps });
  }
}

// Singleton
export const esp32Service = new ESP32CommunicationService();

// Inicialização precoce: registrar listeners USB imediatamente (antes do React)
// Isso resolve o timing issue onde eventos 'attached' disparam antes do ESP32Context montar
try {
  esp32Service.initEarlyUSBListeners();
} catch (e) {
  console.warn('[USB] Erro na inicialização precoce:', e);
}

export default esp32Service;
