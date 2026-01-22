import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import esp32Serial from './esp32SerialService';  // 🔧 FIX: Fallback para USB Web Serial

// Plugin USB Serial para Android (capacitor-usb-serial-plugin)
// Importação dinâmica para não quebrar na web
let UsbSerial: any = null;
const loadUsbSerialPlugin = async () => {
  if (Capacitor.isNativePlatform() && !UsbSerial) {
    try {
      const module = await import('capacitor-usb-serial-plugin');
      UsbSerial = module.UsbSerial;
      console.log('[ESP32] Plugin USB Serial carregado com sucesso');
    } catch (error) {
      console.warn('[ESP32] Plugin USB Serial não disponível:', error);
    }
  }
  return UsbSerial;
};

// UUIDs padrão para ESP32 BLE
const ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const ESP32_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// 🆕 Configurações do dispositivo ESP32 (DEVE COINCIDIR COM firmware.ino)
// Exportadas para uso em outros componentes
export const ESP32_DEVICE_NAME = 'Kiosk_Bier';      // Nome BLE do ESP32
export const ESP32_WIFI_SSID = 'Kiosk_Bier';        // SSID do Access Point WiFi
export const ESP32_WIFI_PASSWORD = 'bier2026';      // Senha do WiFi (para referência)
export const ESP32_DEFAULT_IP = '192.168.4.1';      // IP padrão do Access Point
export const ESP32_BLE_PIN = '123456';              // PIN para pareamento BLE

// Chave de persistência para última conexão
const LAST_CONNECTION_KEY = 'esp32_last_connection';

// Baudrate padrão (115200 conforme firmware v2.0)
const DEFAULT_BAUDRATE = 115200;

// Configuração de heartbeat (melhores práticas)
// 🔧 CORREÇÃO: Aumentado para 30s para reduzir tráfego BLE e evitar poluição de logs
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;  // 30 segundos (antes: 15s)
const HEARTBEAT_FAIL_THRESHOLD = 3;           // 3 falhas = desconexão

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

// Interface para persistência de última conexão
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

// Callback para eventos de conexão
export type ConnectionEventCallback = (status: ConnectionStatus) => void;
export type HeartbeatFailCallback = (consecutiveFailures: number) => void;

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

  // Evento de conexão
  private onConnectionChange: ConnectionEventCallback | null = null;

  // 🆕 Callback para dados recebidos via BLE
  private onBleDataReceived: ((data: string) => void) | null = null;
  
  // 🆕 Callback para dados recebidos via USB OTG nativo
  private onUsbDataReceived: ((data: string) => void) | null = null;
  
  // 🆕 Buffer para reconstruir mensagens BLE fragmentadas
  private bleReceiveBuffer: string = '';
  private usbReceiveBuffer: string = '';

  // ============================================
  // DETECÇÃO DE PLATAFORMA
  // ============================================

  isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  isWeb(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  // ============================================
  // PERSISTÊNCIA DE CONEXÃO
  // ============================================

  /**
   * Salva informações da última conexão bem-sucedida
   */
  setLastConnection(info: Omit<LastConnectionInfo, 'timestamp'>): void {
    const data: LastConnectionInfo = {
      ...info,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(LAST_CONNECTION_KEY, JSON.stringify(data));
      console.log('[ESP32] Última conexão salva:', data);
    } catch (error) {
      console.warn('[ESP32] Erro ao salvar última conexão:', error);
    }
  }

  /**
   * Recupera informações da última conexão
   */
  getLastConnection(): LastConnectionInfo | null {
    try {
      const data = localStorage.getItem(LAST_CONNECTION_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('[ESP32] Erro ao ler última conexão:', error);
    }
    return null;
  }

  /**
   * Limpa informações de última conexão
   */
  clearLastConnection(): void {
    try {
      localStorage.removeItem(LAST_CONNECTION_KEY);
      console.log('[ESP32] Última conexão removida');
    } catch (error) {
      console.warn('[ESP32] Erro ao limpar última conexão:', error);
    }
  }

  // ============================================
  // CALLBACK DE EVENTOS
  // ============================================

  /**
   * Registra callback para mudanças de conexão
   */
  setOnConnectionChange(callback: ConnectionEventCallback | null): void {
    this.onConnectionChange = callback;
    // Log removido - era muito frequente e poluía o console
  }

  /**
   * 🆕 Registra callback para dados recebidos via BLE
   */
  setOnBleDataReceived(callback: ((data: string) => void) | null): void {
    this.onBleDataReceived = callback;
    console.log('[ESP32Service] Callback BLE data registrado:', callback ? 'SIM' : 'NÃO');
  }

  /**
   * 🆕 Registra callback para dados recebidos via USB OTG
   */
  setOnUsbDataReceived(callback: ((data: string) => void) | null): void {
    this.onUsbDataReceived = callback;
    console.log('[ESP32Service] Callback USB data registrado:', callback ? 'SIM' : 'NÃO');
  }

  /**
   * Notifica mudança de conexão
   */
  private notifyConnectionChange(): void {
    console.log('[ESP32Service] notifyConnectionChange chamado, status:', JSON.stringify(this.connectionStatus));
    console.log('[ESP32Service] Callback registrado?', this.onConnectionChange ? 'SIM' : 'NÃO');
    if (this.onConnectionChange) {
      console.log('[ESP32Service] Chamando callback...');
      this.onConnectionChange(this.connectionStatus);
    }
  }

  // ============================================
  // HEARTBEAT (MONITORAMENTO DE CONEXÃO)
  // ============================================

  /**
   * Inicia heartbeat para monitorar conexão
   * @param intervalMs Intervalo entre pings (padrão: 15s)
   * @param onFail Callback quando heartbeat falhar N vezes consecutivas
   */
  startHeartbeat(
    intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
    onFail?: HeartbeatFailCallback
  ): void {
    // 🔧 CORREÇÃO: Evitar múltiplos heartbeats simultâneos
    if (this.heartbeatInterval) {
      console.log('[Heartbeat] Já ativo, ignorando chamada duplicada');
      return;
    }
    
    this.heartbeatFailCount = 0;
    this.onHeartbeatFail = onFail || null;

    console.log(`[Heartbeat] Iniciando com intervalo de ${intervalMs}ms`);

    this.heartbeatInterval = setInterval(async () => {
      if (!this.connectionStatus.connected) {
        console.log('[Heartbeat] Não conectado, parando heartbeat');
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
        console.error('[Heartbeat] Limite de falhas atingido, conexão considerada perdida');
        
        // Atualizar status
        this.connectionStatus = { connected: false, type: 'none' };
        this.notifyConnectionChange();
        
        // Notificar callback
        if (this.onHeartbeatFail) {
          this.onHeartbeatFail(this.heartbeatFailCount);
        }
        
        this.stopHeartbeat();
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
  // AUTOCONEXÃO
  // ============================================

  /**
   * Tenta conectar via USB usando portas previamente autorizadas (sem gesto)
   * @returns true se conectou com sucesso
   */
  async autoConnectUSBIfAuthorized(): Promise<boolean> {
    const webSerial = getWebSerial();
    if (!webSerial) {
      console.log('[AutoConnect USB] Web Serial API não disponível');
      return false;
    }

    try {
      const ports = await webSerial.getPorts();
      if (ports.length === 0) {
        console.log('[AutoConnect USB] Nenhuma porta previamente autorizada');
        return false;
      }

      console.log(`[AutoConnect USB] ${ports.length} porta(s) autorizada(s) encontrada(s)`);

      // Tentar a primeira porta disponível
      const port = ports[0];
      await port.open({ baudRate: DEFAULT_BAUDRATE });

      this.serialPort = port;
      this.connectionStatus = {
        connected: true,
        type: 'usb',
        deviceId: 'usb-serial',
        deviceName: 'USB Serial (Auto)',
      };

      // Salvar conexão
      this.setLastConnection({
        type: 'usb',
        deviceId: 'usb-serial',
        deviceName: 'USB Serial (Auto)',
      });

      this.notifyConnectionChange();
      console.log('[AutoConnect USB] Conectado com sucesso');
      return true;
    } catch (error) {
      console.warn('[AutoConnect USB] Falha ao conectar:', error);
      return false;
    }
  }

  /**
   * Tenta conectar na ordem de preferência especificada
   * @param order Array com ordem de preferência (ex: ['usb', 'wifi', 'bluetooth'])
   * @returns Tipo de conexão estabelecida ou 'none' se falhou
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
            // 🆕 Tentar IP salvo OU IP padrão do ESP32
            const wifiIp = lastConnection?.ipAddress || ESP32_DEFAULT_IP;
            console.log(`[AutoConnect WiFi] Tentando IP: ${wifiIp}`);
            success = await this.connectWifi(wifiIp);
            break;

          case 'bluetooth':
            // 🆕 BLE auto-connect: tentar por deviceId salvo OU scan por nome
            if (this.isAndroid()) {
              if (lastConnection?.deviceId && lastConnection.type === 'bluetooth') {
                // Tentar reconectar ao dispositivo salvo
                console.log('[AutoConnect BLE] Tentando deviceId salvo:', lastConnection.deviceId);
                success = await this.connectBluetooth(lastConnection.deviceId, lastConnection.deviceName);
              }
              
              if (!success) {
                // 🆕 Fallback: Scan e conectar pelo nome "Kiosk_Bier"
                console.log(`[AutoConnect BLE] Procurando dispositivo "${ESP32_DEVICE_NAME}"...`);
                success = await this.autoConnectBluetoothByName(ESP32_DEVICE_NAME);
              }
            } else if (this.isWeb()) {
              console.log('[AutoConnect BLE] Requer gesto do usuário no navegador');
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
   * Tenta reconectar ao último dispositivo com backoff exponencial
   * @param maxAttempts Número máximo de tentativas (padrão: 5)
   * @param baseDelayMs Delay base em ms (padrão: 1000)
   * @param maxDelayMs Delay máximo em ms (padrão: 30000)
   */
  async reconnectWithBackoff(
    maxAttempts: number = 5,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
  ): Promise<boolean> {
    const lastConnection = this.getLastConnection();
    if (!lastConnection) {
      console.warn('[Reconnect] Nenhuma conexão anterior salva');
      return false;
    }

    console.log(`[Reconnect] Tentando reconectar a ${lastConnection.type} (max ${maxAttempts} tentativas)`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      console.log(`[Reconnect] Tentativa ${attempt}/${maxAttempts} (delay: ${delay}ms)`);

      try {
        let success = false;

        switch (lastConnection.type) {
          case 'usb':
            success = await this.autoConnectUSBIfAuthorized();
            break;
          case 'wifi':
            if (lastConnection.ipAddress) {
              success = await this.connectWifi(lastConnection.ipAddress);
            }
            break;
          case 'bluetooth':
            if (this.isAndroid() && lastConnection.deviceId) {
              success = await this.connectBluetooth(lastConnection.deviceId);
            }
            break;
        }

        if (success) {
          console.log(`[Reconnect] Sucesso na tentativa ${attempt}`);
          return true;
        }
      } catch (error) {
        console.warn(`[Reconnect] Tentativa ${attempt} falhou:`, error);
      }

      // Aguardar antes da próxima tentativa (exceto na última)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`[Reconnect] Falha após ${maxAttempts} tentativas`);
    return false;
  }

  // ============================================
  // BLUETOOTH LOW ENERGY (BLE)
  // ============================================

  /**
   * Inicializa Bluetooth (verifica permissões no Android)
   */
  async initBluetooth(): Promise<boolean> {
    try {
      // Inicializar BLE com opções específicas para Android
      await BleClient.initialize({
        androidNeverForLocation: false, // Precisa de localização para scan BLE no Android
      });
      console.log('[BLE] Inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao inicializar:', error);
      return false;
    }
  }

  /**
   * 🆕 Auto-conecta ao Bluetooth procurando pelo nome do dispositivo
   * Usa as configurações conhecidas: nome "Kiosk_Bier"
   * @param deviceName Nome do dispositivo para procurar (padrão: Kiosk_Bier)
   * @param timeout Tempo máximo de scan em ms
   */
  async autoConnectBluetoothByName(deviceName: string = ESP32_DEVICE_NAME, timeout: number = 8000): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[AutoConnect BLE] Disponível apenas em plataformas nativas');
      return false;
    }

    try {
      console.log(`[AutoConnect BLE] Inicializando scan para "${deviceName}"...`);
      
      // Inicializar BLE
      await BleClient.initialize({
        androidNeverForLocation: false,
      });

      // Variável para armazenar o dispositivo encontrado
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
              console.log(`[AutoConnect BLE] ✅ Dispositivo alvo encontrado: ${name}`);
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
          console.log('[AutoConnect BLE] ✅ Conectado com sucesso!');
          return true;
        }
      }

      console.log('[AutoConnect BLE] Nenhum dispositivo compatível encontrado');
      return false;

    } catch (error) {
      console.error('[AutoConnect BLE] Erro:', error);
      return false;
    }
  }

  /**
   * Escaneia dispositivos Bluetooth
   * Nota: No navegador desktop, requestLEScan não é suportado.
   * Usamos requestDevice que abre um picker do browser.
   */
  async scanBluetoothDevices(timeout: number = 5000): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];

    try {
      // Verificar se está no navegador web
      if (this.isWeb()) {
        // No navegador, usar Web Bluetooth API com picker
        if ('bluetooth' in navigator) {
          try {
            console.log('[BLE] Abrindo picker de dispositivos Bluetooth...');
            // 🆕 Tentar filtro por UUID primeiro, depois por nome
            const device = await (navigator as any).bluetooth.requestDevice({
              filters: [
                { services: [ESP32_SERVICE_UUID] },
                { namePrefix: 'Kiosk' },
                { namePrefix: 'ESP32' },
              ],
              optionalServices: [ESP32_SERVICE_UUID],
            });
            
            if (device) {
              devices.push({
                id: device.id,
                name: device.name || 'ESP32 Bluetooth',
                type: 'bluetooth',
              });
              console.log('[BLE] Dispositivo selecionado:', device.name);
            }
          } catch (pickerError: any) {
            // Usuário cancelou o picker
            if (pickerError.name === 'NotFoundError') {
              console.log('[BLE] Picker cancelado ou nenhum dispositivo selecionado');
            } else {
              console.warn('[BLE] Erro no picker:', pickerError);
            }
          }
        } else {
          console.warn('[BLE] Web Bluetooth API não disponível neste navegador');
        }
        return devices;
      }

      // No Android/nativo, usar Capacitor BLE
      console.log('[BLE] Iniciando scan no Android...');
      
      // Inicializar BLE com permissões
      await BleClient.initialize({
        androidNeverForLocation: false,
      });
      
      // 🆕 ESTRATÉGIA: Fazer scan SEM filtro de UUID para encontrar todos os dispositivos BLE
      // Depois filtramos por nome (mais confiável com dispositivos com PIN)
      console.log('[BLE] Iniciando scan geral (sem filtro UUID)...');
      console.log('[BLE] Procurando dispositivos com nome contendo: kiosk, esp32, bier');
      
      await BleClient.requestLEScan(
        { 
          allowDuplicates: false,
          // 🆕 NÃO filtrar por serviço UUID - dispositivos com PIN podem não anunciar
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
              console.log(`[BLE] ✅ ENCONTRADO: "${deviceName}" (${deviceId}) RSSI: ${result.rssi}`);
            }
          }
        }
      );

      // Aguardar scan (tempo maior para dispositivos com PIN)
      await new Promise((resolve) => setTimeout(resolve, timeout));
      await BleClient.stopLEScan();

      console.log(`[BLE] Scan finalizado. ${devices.length} dispositivo(s) compatível(is) encontrado(s).`);
      return devices;
    } catch (error) {
      console.error('[BLE] Erro no scan:', error);
      return devices;
    }
  }

  /**
   * Conecta via Bluetooth
   * 🆕 CORRIGIDO: Agora configura notifications para receber respostas do ESP32
   */
  async connectBluetooth(deviceId: string, deviceName?: string): Promise<boolean> {
    try {
      await BleClient.connect(deviceId, (disconnectedDeviceId) => {
        console.log('[BLE] Dispositivo desconectado:', disconnectedDeviceId);
        this.connectionStatus = { connected: false, type: 'none' };
        this.connectedDevice = null;
        this.stopHeartbeat();
        this.notifyConnectionChange();
      });

      // 🆕 CORREÇÃO: Solicitar MTU maior para evitar fragmentação de JSON
      // O MTU padrão do BLE é ~23 bytes, mas nossos JSONs podem ter 150+ bytes
      try {
        if (typeof BleClient.requestMtu === 'function') {
          const mtu = await BleClient.requestMtu(deviceId, 512);
          console.log('[BLE] MTU negociado:', mtu);
        } else {
          console.warn('[BLE] requestMtu não disponível nesta versão do plugin');
        }
      } catch (mtuError) {
        console.warn('[BLE] Não foi possível aumentar MTU (continuando com padrão):', mtuError);
      }

      // 🆕 Limpar buffer ao conectar
      this.bleReceiveBuffer = '';
      
      // 🆕 Configurar notifications para receber respostas do ESP32
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
            
            // 🆕 Adicionar ao buffer e processar linhas completas
            this.bleReceiveBuffer += chunk;
            
            // Processar linhas completas (terminadas em \n)
            const lines = this.bleReceiveBuffer.split('\n');
            // Manter última linha incompleta no buffer
            this.bleReceiveBuffer = lines.pop() || '';
            
            // Processar cada linha completa
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed && this.onBleDataReceived) {
                console.log('[BLE] Linha completa:', trimmed);
                this.onBleDataReceived(trimmed);
              }
            }
            
            // 🔧 CORREÇÃO: Se o buffer ficou muito grande, processar parcialmente
            // ao invés de descartar silenciosamente
            if (this.bleReceiveBuffer.length > 4096) {
              console.warn('[BLE] Buffer muito grande (' + this.bleReceiveBuffer.length + '), tentando processar...');
              
              // Tentar encontrar JSON completo no buffer
              const jsonMatches = this.bleReceiveBuffer.match(/\{[^{}]*\}/g);
              if (jsonMatches && jsonMatches.length > 0) {
                for (const jsonStr of jsonMatches) {
                  if (this.onBleDataReceived) {
                    console.log('[BLE] JSON extraído do buffer grande:', jsonStr.substring(0, 50));
                    this.onBleDataReceived(jsonStr);
                  }
                }
                // Manter apenas o que está após o último JSON processado
                const lastJson = jsonMatches[jsonMatches.length - 1];
                const lastIndex = this.bleReceiveBuffer.lastIndexOf(lastJson) + lastJson.length;
                this.bleReceiveBuffer = this.bleReceiveBuffer.substring(lastIndex);
              } else {
                // Se não encontrou JSON, manter apenas os últimos 1KB
                console.warn('[BLE] Nenhum JSON encontrado, truncando buffer para 1KB');
                this.bleReceiveBuffer = this.bleReceiveBuffer.substring(this.bleReceiveBuffer.length - 1024);
              }
            }
          }
        );
        console.log('[BLE] Notifications configuradas com sucesso');
      } catch (notifyError) {
        console.warn('[BLE] Não foi possível configurar notifications:', notifyError);
        // Continuar mesmo sem notifications (alguns ESP32 não suportam)
      }

      this.connectionStatus = {
        connected: true,
        type: 'bluetooth',
        deviceId: deviceId,
        deviceName: deviceName || 'ESP32 Bluetooth',
      };

      // Salvar última conexão
      this.setLastConnection({
        type: 'bluetooth',
        deviceId: deviceId,
        deviceName: deviceName || 'ESP32 Bluetooth',
      });

      this.notifyConnectionChange();
      console.log('[BLE] Conectado ao dispositivo:', deviceId);
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao conectar:', error);
      return false;
    }
  }

  /**
   * Envia comando via Bluetooth
   * 🔧 CORREÇÃO v4.1: Tenta reconectar automaticamente se desconectado
   */
  async sendBluetoothCommand(command: string): Promise<boolean> {
    // 🔧 FIX: Se não está conectado mas temos deviceId salvo, tentar reconectar
    if (!this.connectionStatus.connected && this.connectionStatus.type === 'bluetooth') {
      console.warn('[BLE] Conexão perdida, tentando reconectar...');
      const lastConnection = this.getLastConnection();
      if (lastConnection?.deviceId) {
        try {
          const reconnected = await this.connectBluetooth(lastConnection.deviceId, lastConnection.deviceName);
          if (!reconnected) {
            console.error('[BLE] Falha ao reconectar');
            return false;
          }
          console.log('[BLE] Reconectado com sucesso!');
        } catch (e) {
          console.error('[BLE] Erro ao reconectar:', e);
          return false;
        }
      } else {
        console.error('[BLE] Não conectado e sem deviceId salvo');
        return false;
      }
    }
    
    if (
      !this.connectionStatus.connected ||
      this.connectionStatus.type !== 'bluetooth'
    ) {
      console.error('[BLE] Não conectado (connected:', this.connectionStatus.connected, ', type:', this.connectionStatus.type, ')');
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

      console.log('[BLE] Comando enviado:', command.substring(0, 100) + (command.length > 100 ? '...' : ''));
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao enviar comando:', error);
      
      // 🔧 FIX: Se erro de conexão, marcar como desconectado
      if (error instanceof Error && (error.message.includes('disconnect') || error.message.includes('not connected'))) {
        this.connectionStatus = { connected: false, type: 'none' };
        this.notifyConnectionChange();
      }
      
      return false;
    }
  }

  // ============================================
  // USB SERIAL (WEB SERIAL API)
  // ============================================

  /**
   * Verifica se Web Serial API está disponível
   */
  hasWebSerialAPI(): boolean {
    return getWebSerial() !== undefined;
  }

  /**
   * Lista portas USB disponíveis
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
      console.log('[USB] Web Serial API não disponível - tente conectar um dispositivo USB');
    }

    // No Android com Capacitor, o USB é detectado via permissões
    if (this.isAndroid()) {
      devices.push({
        id: 'android-usb',
        name: 'Conexão USB Android (OTG)',
        type: 'usb',
      });
      console.log('[USB] Dispositivo USB Android adicionado');
    }

    return devices;
  }

  /**
   * Conecta via USB Serial
   * @param baudRate Baudrate (padrão: 115200 conforme firmware v2.0)
   */
  async connectUSB(baudRate: number = DEFAULT_BAUDRATE): Promise<boolean> {
    const webSerial = getWebSerial();
    if (!webSerial) {
      console.error('[USB] Web Serial API não disponível');
      return false;
    }

    try {
      // Abrir seletor de porta
      const port: SerialPort = await webSerial.requestPort();

      // Abrir porta com baud rate
      await port.open({ baudRate });

      this.serialPort = port;
      this.connectionStatus = {
        connected: true,
        type: 'usb',
        deviceId: 'usb-serial',
        deviceName: 'USB Serial',
      };

      // Salvar última conexão
      this.setLastConnection({
        type: 'usb',
        deviceId: 'usb-serial',
        deviceName: 'USB Serial',
      });

      this.notifyConnectionChange();
      console.log('[USB] Conectado à porta serial (baudRate:', baudRate, ')');
      return true;
    } catch (error) {
      console.error('[USB] Erro ao conectar:', error);
      return false;
    }
  }

  /**
   * Envia comando via USB Serial
   * 🔧 FIX: Usa esp32Serial como fallback quando serialPort local não está disponível
   */
  async sendUSBCommand(command: string): Promise<boolean> {
    // 🔧 FIX: Se serialPort local não está disponível, usar esp32Serial (conectado via ESP32Context)
    if ((!this.serialPort || !this.serialPort.writable) && esp32Serial.isConnected()) {
      console.log('[USB] Usando esp32Serial como fallback para enviar comando');
      return esp32Serial.sendRaw(command);
    }
    
    if (!this.serialPort || !this.serialPort.writable) {
      console.error('[USB] Porta não aberta e esp32Serial não conectado');
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
      return false;
    } finally {
      // Garantir que o lock seja sempre liberado
      writer.releaseLock();
    }
  }

  /**
   * Lê dados da porta USB
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
   * Configura IP do ESP32 para conexão WiFi
   */
  setESP32IpAddress(ip: string): void {
    this.esp32IpAddress = ip;
    console.log('[WiFi] IP do ESP32 configurado:', ip);
  }

  /**
   * Escaneia rede para encontrar ESP32
   * Processa em batches para não travar a UI
   * NOTA: No navegador, CORS bloqueia requests diretos. 
   * Funciona melhor no Android nativo ou com CORS habilitado no ESP32.
   */
  async scanWifiDevices(baseIp: string = '192.168.1'): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];
    
    // No navegador web, CORS impede scan de rede
    // Apenas mostrar mensagem informativa
    if (this.isWeb()) {
      console.warn('[WiFi] Scan de rede limitado no navegador devido a CORS.');
      console.log('[WiFi] Use conexão manual com IP ou execute no app Android.');
      // Retornar lista vazia - usuário deve usar conexão manual
      return devices;
    }
    
    const BATCH_SIZE = 25; // Processa 25 IPs por vez
    const TIMEOUT_PER_IP = 300; // 300ms timeout por IP

    // Processar em batches para não sobrecarregar
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
          .catch(() => {}); // Ignorar erros de conexão

        batchPromises.push(promise);
      }

      // Aguardar batch com timeout global de 5s
      await Promise.race([
        Promise.all(batchPromises),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      // Se já encontrou algum dispositivo, retornar mais cedo
      if (devices.length > 0 && batch > 2) {
        console.log('[WiFi] Dispositivo encontrado, interrompendo scan');
        break;
      }
    }

    return devices;
  }

  /**
   * Verifica se há ESP32 em um IP específico
   * NOTA: No navegador, CORS pode bloquear. Funciona no Android nativo.
   */
  private async checkESP32AtIp(ip: string, timeoutMs: number = 500): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`http://${ip}/status`, {
        method: 'GET',
        signal: controller.signal,
        // Tentar sem CORS primeiro (retorna opaque response mas não erro)
        mode: this.isWeb() ? 'no-cors' : 'cors',
      });

      clearTimeout(timeout);

      // No modo no-cors, não podemos ler o corpo, mas se não deu erro, pode ser um dispositivo
      if (this.isWeb()) {
        // Apenas verificar se não houve erro de rede
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
  // CONEXÃO USB OTG NATIVA (ANDROID)
  // ============================================

  /**
   * Tenta auto-conectar via USB OTG nativo (sem interação do usuário)
   * Usado pelo hook de autoconexão
   * @returns true se conectou com sucesso
   */
  async autoConnectUSBNative(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[AutoConnect USB OTG] Não é plataforma nativa');
      return false;
    }

    try {
      const plugin = await loadUsbSerialPlugin();
      if (!plugin) {
        console.log('[AutoConnect USB OTG] Plugin não disponível');
        return false;
      }

      // Verificar se há dispositivos USB conectados
      const devices = await plugin.getDevices();
      if (!devices || !devices.devices || devices.devices.length === 0) {
        console.log('[AutoConnect USB OTG] Nenhum dispositivo USB encontrado');
        return false;
      }

      console.log(`[AutoConnect USB OTG] ${devices.devices.length} dispositivo(s) encontrado(s)`);

      // Tentar conectar ao primeiro dispositivo
      return await this.connectUSBNative();
    } catch (error) {
      console.warn('[AutoConnect USB OTG] Falha:', error);
      return false;
    }
  }

  /**
   * Conecta via USB OTG nativo no Android usando capacitor-usb-serial-plugin
   * @returns true se conectou com sucesso
   */
  async connectUSBNative(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.warn('[USB OTG] Disponível apenas em plataformas nativas (Android/iOS)');
      return false;
    }

    try {
      const plugin = await loadUsbSerialPlugin();
      if (!plugin) {
        console.error('[USB OTG] Plugin USB Serial não está disponível');
        throw new Error('Plugin USB Serial não instalado ou não compatível');
      }

      console.log('[USB OTG] Buscando dispositivos USB...');

      // Listar dispositivos USB disponíveis
      const devices = await plugin.getDevices();
      console.log('[USB OTG] Dispositivos encontrados:', devices);

      if (!devices || devices.devices?.length === 0) {
        console.warn('[USB OTG] Nenhum dispositivo USB encontrado');
        return false;
      }

      // Pegar o primeiro dispositivo (geralmente o ESP32)
      const device = devices.devices[0];
      const deviceId = device.deviceId || device.vendorId;

      console.log('[USB OTG] Tentando conectar ao dispositivo:', device);

      // Solicitar permissão e abrir conexão
      const result = await plugin.open({
        deviceId: deviceId,
        baudRate: DEFAULT_BAUDRATE,
        dataBits: 8,
        stopBits: 1,
        parity: 0, // None
      });

      if (result && result.success) {
        this.connectionStatus = {
          connected: true,
          type: 'usb',
          deviceId: String(deviceId),
          deviceName: `USB OTG (${device.productName || 'ESP32'})`,
        };

        this.connectedDevice = {
          id: String(deviceId),
          name: `USB OTG (${device.productName || 'ESP32'})`,
          type: 'usb',
        };

        // Salvar última conexão
        this.setLastConnection({
          type: 'usb',
          deviceId: String(deviceId),
          deviceName: `USB OTG (${device.productName || 'ESP32'})`,
        });

        // 🆕 Limpar buffer ao conectar
        this.usbReceiveBuffer = '';
        
        // Registrar listener para receber dados
        await plugin.registerReadCallback((data: { value: string }) => {
          const chunk = data.value || '';
          console.log('[USB OTG] Chunk recebido (' + chunk.length + ' bytes)');
          
          // 🆕 Adicionar ao buffer e processar linhas completas
          this.usbReceiveBuffer += chunk;
          
          // Processar linhas completas (terminadas em \n)
          const lines = this.usbReceiveBuffer.split('\n');
          // Manter última linha incompleta no buffer
          this.usbReceiveBuffer = lines.pop() || '';
          
          // Processar cada linha completa
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && this.onUsbDataReceived) {
              console.log('[USB OTG] Linha completa:', trimmed);
              this.onUsbDataReceived(trimmed);
            }
          }
          
          // Se o buffer ficou muito grande (mais de 2KB), algo está errado - limpar
          if (this.usbReceiveBuffer.length > 2048) {
            console.warn('[USB OTG] Buffer muito grande, limpando:', this.usbReceiveBuffer.length);
            this.usbReceiveBuffer = '';
          }
        });

        this.notifyConnectionChange();
        console.log('[USB OTG] Conectado com sucesso ao ESP32');
        return true;
      }

      console.warn('[USB OTG] Falha ao abrir conexão:', result);
      return false;
    } catch (error) {
      console.error('[USB OTG] Erro ao conectar:', error);
      throw error;
    }
  }

  /**
   * Lista dispositivos USB disponíveis no Android
   * @returns Array de dispositivos USB
   */
  async listUSBNativeDevices(): Promise<ESP32Device[]> {
    if (!Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      const plugin = await loadUsbSerialPlugin();
      if (!plugin) return [];

      const result = await plugin.getDevices();
      if (!result || !result.devices) return [];

      return result.devices.map((device: any) => ({
        id: String(device.deviceId || device.vendorId),
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
   * @param command - Comando a enviar (será convertido para JSON)
   */
  async sendUSBNativeCommand(command: string | object): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || this.connectionStatus.type !== 'usb') {
      console.warn('[USB OTG] Não conectado via USB nativo');
      return false;
    }

    try {
      const plugin = await loadUsbSerialPlugin();
      if (!plugin) return false;

      const data = typeof command === 'string' 
        ? command 
        : JSON.stringify(command);

      console.log('[USB OTG] Enviando:', data);
      
      await plugin.write({ value: data + '\n' });
      return true;
    } catch (error) {
      console.error('[USB OTG] Erro ao enviar comando:', error);
      return false;
    }
  }

  // ============================================
  // CONEXÃO WIFI
  // ============================================

  /**
   * Conecta via WiFi
   * NOTA: No navegador, CORS pode impedir verificação. 
   * Assumimos conexão e deixamos falhar nos comandos.
   */
  async connectWifi(ipAddress: string): Promise<boolean> {
    const TIMEOUT_MS = 5000;
    
    try {
      this.esp32IpAddress = ipAddress;
      
      console.log(`[WiFi] Tentando conectar ao ESP32 em ${ipAddress}...`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      // No Android nativo, usar mode 'cors' normal (não tem restrição CORS)
      // Na web, usar 'no-cors' porque CORS bloqueia
      const fetchMode = this.isWeb() ? 'no-cors' : 'cors';
      
      console.log(`[WiFi] Usando modo fetch: ${fetchMode} (plataforma: ${Capacitor.getPlatform()})`);

      // Tentar verificar conexão
      const response = await fetch(`http://${ipAddress}/status`, {
        method: 'GET',
        signal: controller.signal,
        mode: fetchMode,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeout);

      console.log(`[WiFi] Resposta recebida: status=${response.status}, type=${response.type}`);

      // No navegador com no-cors, não podemos verificar resposta (opaque)
      // No Android nativo, podemos verificar normalmente
      let isConnected = false;
      
      if (this.isWeb()) {
        // Na web, opaque response significa que chegou (mas não podemos ler)
        isConnected = response.type === 'opaque' || response.ok;
      } else {
        // No Android, verificar resposta normalmente
        isConnected = response.ok;
        
        if (response.ok) {
          try {
            const data = await response.json();
            console.log('[WiFi] Dados do ESP32:', data);
          } catch (e) {
            console.log('[WiFi] Resposta não é JSON, mas conexão OK');
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

        // Salvar última conexão
        this.setLastConnection({
          type: 'wifi',
          ipAddress: ipAddress,
          deviceName: `ESP32 @ ${ipAddress}`,
        });

        this.notifyConnectionChange();
        console.log('[WiFi] Conectado ao ESP32:', ipAddress);
        return true;
      }

      console.warn('[WiFi] ESP32 não respondeu em:', ipAddress);
      return false;
    } catch (error: any) {
      // Timeout ou erro de rede
      if (error.name === 'AbortError') {
        console.error('[WiFi] Timeout ao conectar:', ipAddress);
      } else {
        console.error('[WiFi] Erro ao conectar:', error.message || error);
      }
      return false;
    }
  }

  /**
   * Envia comando via WiFi (HTTP POST)
   * @param action - Nome da ação (deve corresponder ao firmware: ping, release_drink, etc.)
   * @param data - Dados adicionais para o comando
   */
  async sendWifiCommand(
    action: string,
    data?: object
  ): Promise<boolean> {
    if (!this.esp32IpAddress) {
      console.error('[WiFi] IP do ESP32 não configurado');
      return false;
    }

    try {
      const response = await fetch(`http://${this.esp32IpAddress}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,  // CORRIGIDO: era 'command', agora 'action' (compatível com firmware)
          ...data,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[WiFi] Comando enviado:', action, '| Resposta:', result);
        return true;
      }

      console.error('[WiFi] Erro na resposta:', response.status);
      return false;
    } catch (error) {
      console.error('[WiFi] Erro ao enviar comando:', error);
      return false;
    }
  }

  // ============================================
  // INTERFACE UNIFICADA
  // ============================================

  /**
   * Retorna status da conexão atual
   */
  getConnectionStatus(): ConnectionStatus {
    // 🔧 FIX: Se connectionStatus local é 'none' mas esp32Serial está conectado,
    // retornar o estado real da conexão USB
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
   * 🔧 Sincroniza estado de conexão USB quando esp32Serial conecta externamente.
   * Deve ser chamado pelo ESP32Context quando esp32Serial.onConnectionChange dispara.
   * Isso garante que sendCommand() funcione mesmo quando a conexão foi feita pelo esp32Serial.
   */
  syncExternalUSBConnection(connected: boolean): void {
    if (connected && esp32Serial.isConnected()) {
      console.log('[ESP32Service] Sincronizando conexão USB externa (esp32Serial)');
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
      // Salvar como última conexão
      this.setLastConnection({
        type: 'usb',
        deviceId: 'web-serial',
        deviceName: 'ESP32 (Web Serial)',
      });
      this.notifyConnectionChange();
    } else if (!connected && this.connectionStatus.type === 'usb') {
      console.log('[ESP32Service] Desconexão USB externa detectada');
      this.connectionStatus = { connected: false, type: 'none' };
      this.connectedDevice = null;
      this.notifyConnectionChange();
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
        console.warn('[Scan] Bluetooth não disponível:', error);
      }
    }

    // Scan USB (Web Serial API)
    try {
      const usbDevices = await this.scanUSBDevices();
      allDevices.push(...usbDevices);
    } catch (error) {
      console.warn('[Scan] USB não disponível:', error);
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
        console.error('[Connect] Tipo de conexão não suportado:', device.type);
        return false;
    }
  }

  /**
   * Envia comando (auto-detecta tipo de conexão)
   * 🆕 CORRIGIDO: Agora formata JSON completo para todos os protocolos
   * 🔧 FIX: Verifica esp32Serial.isConnected() como fallback quando connectionStatus é 'none'
   * 🔧 FIX v4.1: Tenta reconectar automaticamente para Bluetooth
   */
  async sendCommand(command: string, data?: object): Promise<boolean> {
    // Construir payload JSON completo com action + parâmetros
    const payload = data ? { action: command, ...data } : { action: command };
    const jsonString = JSON.stringify(payload);
    
    console.log(`[SendCommand] Tipo: ${this.connectionStatus.type}, connected: ${this.connectionStatus.connected}, esp32Serial.isConnected: ${esp32Serial.isConnected()}, Payload: ${jsonString.substring(0, 80)}...`);
    
    // 🔧 FIX: Se connectionStatus é 'none' mas esp32Serial está conectado (conexão feita externamente),
    // usar esp32Serial diretamente. Isso resolve o bug onde botões de UI não enviavam comandos.
    if (this.connectionStatus.type === 'none' && esp32Serial.isConnected()) {
      console.log('[SendCommand] Usando esp32Serial (Web Serial conectado externamente)');
      return esp32Serial.sendRaw(jsonString);
    }
    
    // 🔧 FIX v4.1: Se era bluetooth mas está desconectado, tentar reconectar
    if (this.connectionStatus.type === 'bluetooth' && !this.connectionStatus.connected) {
      console.warn('[SendCommand] Bluetooth desconectado, tentando reconectar...');
      const lastConnection = this.getLastConnection();
      if (lastConnection?.type === 'bluetooth' && lastConnection.deviceId) {
        try {
          const reconnected = await this.connectBluetooth(lastConnection.deviceId, lastConnection.deviceName);
          if (reconnected) {
            console.log('[SendCommand] Reconectado com sucesso via Bluetooth!');
          } else {
            console.error('[SendCommand] Falha ao reconectar Bluetooth');
            return false;
          }
        } catch (e) {
          console.error('[SendCommand] Erro ao reconectar:', e);
          return false;
        }
      } else {
        console.error('[SendCommand] Sem informações de última conexão Bluetooth');
        return false;
      }
    }
    
    // 🔧 FIX v4.1: Se tipo é 'none' mas temos última conexão salva, tentar reconectar
    if (this.connectionStatus.type === 'none') {
      const lastConnection = this.getLastConnection();
      if (lastConnection?.type === 'bluetooth' && lastConnection.deviceId) {
        console.log('[SendCommand] Tentando reconectar via Bluetooth (última conexão)...');
        try {
          const reconnected = await this.connectBluetooth(lastConnection.deviceId, lastConnection.deviceName);
          if (reconnected) {
            console.log('[SendCommand] Reconectado com sucesso!');
          } else {
            console.error('[SendCommand] Falha ao reconectar');
            return false;
          }
        } catch (e) {
          console.error('[SendCommand] Erro ao reconectar:', e);
          return false;
        }
      }
    }
    
    switch (this.connectionStatus.type) {
      case 'bluetooth':
        // 🆕 Envia JSON completo (não apenas o nome do comando)
        return this.sendBluetoothCommand(jsonString);
      case 'wifi':
        return this.sendWifiCommand(command, data);
      case 'usb':
        // Usar driver nativo no Android, Web Serial na web
        if (Capacitor.isNativePlatform()) {
          // 🆕 Envia JSON completo
          return this.sendUSBNativeCommand(jsonString);
        }
        // 🆕 Envia JSON completo
        return this.sendUSBCommand(jsonString);
      default:
        console.error('[Send] Nenhuma conexão ativa (connectionStatus.type:', this.connectionStatus.type, ', esp32Serial:', esp32Serial.isConnected(), ')');
        return false;
    }
  }

  /**
   * Desconecta do dispositivo atual
   */
  async disconnect(): Promise<void> {
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
          const plugin = await loadUsbSerialPlugin();
          if (plugin) {
            await plugin.close();
            console.log('[USB OTG] Conexão fechada');
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
    console.log('[Disconnect] Desconectado');
  }

  // ============================================
  // COMANDOS ESPECÍFICOS DO KIOSK
  // Compatíveis com firmware esp32_drink_dispenser.ino
  // ============================================

  /**
   * Dispensar bebida
   * Formato compatível com firmware: {"action":"release_drink","orderId":"...","mlPerUnit":...,"quantity":...,"sizeLabel":"..."}
   */
  async dispenseDrink(
    orderId: string,
    mlPerUnit: number,
    quantity: number = 1,
    sizeLabel: string = 'Padrão',
    tapId: number = 0  // 🆕 Multi-Tap
  ): Promise<boolean> {
    // 🔧 CORREÇÃO: Não fazer JSON.stringify aqui - sendCommand já faz internamente
    return this.sendCommand('release_drink', {
      orderId,
      mlPerUnit,
      quantity,
      sizeLabel,
      tapId,
    });
  }

  /**
   * Ping/Pong para testar conexão
   * Formato compatível com firmware: {"action":"ping"}
   */
  async ping(): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado (ele detecta tipo de conexão automaticamente)
    return this.sendCommand('ping');
  }

  /**
   * @deprecated Não implementado no firmware atual. Reservado para expansão futura.
   */
  async printReceipt(_receiptData: {
    orderId: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    total: number;
    paymentMethod: string;
  }): Promise<boolean> {
    console.warn('[ESP32] printReceipt não está implementado no firmware');
    return false;
  }

  // ============================================
  // NOVOS MÉTODOS (Firmware v2.1+)
  // ============================================

  /**
   * Salvar calibração no NVS do ESP32
   * 🆕 Multi-Tap: tapId opcional (default 0)
   */
  async saveCalibration(pulsosPorLitro: number, mlPorSegundo: number, tapId: number = 0): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado
    return this.sendCommand('save_calibration', {
      pulsos_por_litro: pulsosPorLitro,
      ml_por_segundo: mlPorSegundo,
      tapId,
    });
  }

  /**
   * Obter configurações atuais do ESP32
   */
  async getSettings(): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado
    return this.sendCommand('get_settings');
  }

  /**
   * Iniciar portal WiFi para configuração (BLOQUEANTE no ESP32)
   */
  async startWifiPortal(): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado
    if (this.connectionStatus.type === 'wifi') {
      console.warn('[ESP32] start_wifi_portal via WiFi irá desconectar o ESP32');
    }
    return this.sendCommand('start_wifi_portal');
  }

  /**
   * Resetar configurações WiFi do ESP32
   */
  async resetWifi(): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado
    return this.sendCommand('reset_wifi');
  }

  /**
   * Obter status do ESP32
   */
  async getESP32Status(): Promise<object | null> {
    if (this.connectionStatus.type === 'wifi' && this.esp32IpAddress) {
      try {
        const response = await fetch(`http://${this.esp32IpAddress}/status`);
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
      // Nota: Resposta virá via callback ou leitura assíncrona
      return { connected: true, type: this.connectionStatus.type };
    }

    return null;
  }

  /**
   * Calibrar bomba
   * Formato compatível com firmware: {"action":"calibrate","duration":5000,"tapId":0}
   * 🆕 Multi-Tap: tapId opcional (default 0)
   */
  async calibratePump(durationMs: number = 5000, tapId: number = 0): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado + suporte multi-tap
    return this.sendCommand('calibrate', { duration: durationMs, tapId });
  }

  /**
   * Beep/Alerta sonoro (precisa ser implementado no firmware)
   */
  async beep(times: number = 1): Promise<boolean> {
    // 🔧 CORREÇÃO: Usar sendCommand unificado
    return this.sendCommand('beep', { times });
  }
}

// Singleton
export const esp32Service = new ESP32CommunicationService();
export default esp32Service;
