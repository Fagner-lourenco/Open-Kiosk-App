import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

// UUIDs padrão para ESP32 BLE
const ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const ESP32_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Chave de persistência para última conexão
const LAST_CONNECTION_KEY = 'esp32_last_connection';

// Baudrate padrão (115200 conforme firmware v2.0)
const DEFAULT_BAUDRATE = 115200;

// Configuração de heartbeat (melhores práticas)
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;  // 15 segundos
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
  }

  /**
   * Notifica mudança de conexão
   */
  private notifyConnectionChange(): void {
    if (this.onConnectionChange) {
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
    this.stopHeartbeat(); // Limpar intervalo anterior
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
            success = await this.autoConnectUSBIfAuthorized();
            break;

          case 'wifi':
            // WiFi requer IP salvo
            if (lastConnection?.ipAddress) {
              success = await this.connectWifi(lastConnection.ipAddress);
            } else {
              console.log('[AutoConnect WiFi] Nenhum IP salvo');
            }
            break;

          case 'bluetooth':
            // BLE auto-connect só funciona no Android
            if (this.isAndroid() && lastConnection?.deviceId && lastConnection.type === 'bluetooth') {
              success = await this.connectBluetooth(lastConnection.deviceId);
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
   * Inicializa Bluetooth
   */
  async initBluetooth(): Promise<boolean> {
    try {
      await BleClient.initialize();
      console.log('[BLE] Inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('[BLE] Erro ao inicializar:', error);
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
            const device = await (navigator as any).bluetooth.requestDevice({
              filters: [{ services: [ESP32_SERVICE_UUID] }],
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
      await BleClient.initialize();

      await BleClient.requestLEScan(
        { services: [ESP32_SERVICE_UUID] },
        (result) => {
          const device: ESP32Device = {
            id: result.device.deviceId,
            name: result.device.name || 'ESP32 Desconhecido',
            type: 'bluetooth',
            rssi: result.rssi,
          };

          // Evitar duplicados
          if (!devices.find((d) => d.id === device.id)) {
            devices.push(device);
            console.log('[BLE] Dispositivo encontrado:', device.name);
          }
        }
      );

      // Aguardar scan
      await new Promise((resolve) => setTimeout(resolve, timeout));
      await BleClient.stopLEScan();

      return devices;
    } catch (error) {
      console.error('[BLE] Erro no scan:', error);
      return devices;
    }
  }

  /**
   * Conecta via Bluetooth
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
   */
  async sendBluetoothCommand(command: string): Promise<boolean> {
    if (
      !this.connectionStatus.connected ||
      this.connectionStatus.type !== 'bluetooth'
    ) {
      console.error('[BLE] Não conectado');
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
   */
  async sendUSBCommand(command: string): Promise<boolean> {
    if (!this.serialPort || !this.serialPort.writable) {
      console.error('[USB] Porta não aberta');
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

  /**
   * Conecta via WiFi
   * NOTA: No navegador, CORS pode impedir verificação. 
   * Assumimos conexão e deixamos falhar nos comandos.
   */
  async connectWifi(ipAddress: string): Promise<boolean> {
    const TIMEOUT_MS = 5000;
    
    try {
      this.esp32IpAddress = ipAddress;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      // Tentar verificar conexão
      const response = await fetch(`http://${ipAddress}/status`, {
        method: 'GET',
        signal: controller.signal,
        mode: this.isWeb() ? 'no-cors' : 'cors',
      });
      
      clearTimeout(timeout);

      // No navegador com no-cors, não podemos verificar resposta
      // Assumir conexão e validar nos comandos
      const isConnected = this.isWeb() 
        ? (response.type === 'opaque' || response.ok)
        : response.ok;

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
    return this.connectionStatus;
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
        return this.connectUSB();
      default:
        console.error('[Connect] Tipo de conexão não suportado:', device.type);
        return false;
    }
  }

  /**
   * Envia comando (auto-detecta tipo de conexão)
   */
  async sendCommand(command: string, data?: object): Promise<boolean> {
    switch (this.connectionStatus.type) {
      case 'bluetooth':
        return this.sendBluetoothCommand(command);
      case 'wifi':
        return this.sendWifiCommand(command, data);
      case 'usb':
        return this.sendUSBCommand(command);
      default:
        console.error('[Send] Nenhuma conexão ativa');
        return false;
    }
  }

  /**
   * Desconecta do dispositivo atual
   */
  async disconnect(): Promise<void> {
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

    if (this.connectionStatus.type === 'usb' && this.serialPort) {
      try {
        await this.serialPort.close();
      } catch (error) {
        console.warn('[Disconnect] Erro ao fechar USB:', error);
      }
    }

    this.connectionStatus = { connected: false, type: 'none' };
    this.connectedDevice = null;
    this.esp32IpAddress = '';
    this.serialPort = null;

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
    sizeLabel: string = 'Padrão'
  ): Promise<boolean> {
    const payload = {
      action: 'release_drink',
      orderId,
      mlPerUnit,
      quantity,
      sizeLabel,
    };

    // Para Bluetooth/USB, enviar JSON direto
    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    // Para WiFi, enviar via HTTP POST
    return this.sendWifiCommand('release_drink', payload);
  }

  /**
   * Ping/Pong para testar conexão
   * Formato compatível com firmware: {"action":"ping"}
   */
  async ping(): Promise<boolean> {
    const payload = { action: 'ping' };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('ping', payload);
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
   */
  async saveCalibration(pulsosPorLitro: number, mlPorSegundo: number): Promise<boolean> {
    const payload = { 
      action: 'save_calibration', 
      pulsos_por_litro: pulsosPorLitro,
      ml_por_segundo: mlPorSegundo 
    };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('save_calibration', payload);
  }

  /**
   * Obter configurações atuais do ESP32
   */
  async getSettings(): Promise<boolean> {
    const payload = { action: 'get_settings' };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('get_settings', {});
  }

  /**
   * Iniciar portal WiFi para configuração (BLOQUEANTE no ESP32)
   */
  async startWifiPortal(): Promise<boolean> {
    const payload = { action: 'start_wifi_portal' };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    console.warn('[ESP32] start_wifi_portal via WiFi irá desconectar o ESP32');
    return this.sendWifiCommand('start_wifi_portal', {});
  }

  /**
   * Resetar configurações WiFi do ESP32
   */
  async resetWifi(): Promise<boolean> {
    const payload = { action: 'reset_wifi' };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('reset_wifi', {});
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
   * Formato compatível com firmware: {"action":"calibrate","duration":5000}
   */
  async calibratePump(durationMs: number = 5000): Promise<boolean> {
    const payload = { action: 'calibrate', duration: durationMs };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('calibrate', payload);
  }

  /**
   * Beep/Alerta sonoro (precisa ser implementado no firmware)
   */
  async beep(times: number = 1): Promise<boolean> {
    const payload = { action: 'beep', times };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('beep', payload);
  }
}

// Singleton
export const esp32Service = new ESP32CommunicationService();
export default esp32Service;
