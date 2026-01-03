import { Capacitor } from '@capacitor/core';
import { BleClient, BleDevice } from '@capacitor-community/bluetooth-le';

// UUIDs padrão para ESP32 BLE
const ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const ESP32_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

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

class ESP32CommunicationService {
  private connectionStatus: ConnectionStatus = {
    connected: false,
    type: 'none',
  };

  private connectedDevice: ESP32Device | null = null;
  private esp32IpAddress: string = '';
  private serialPort: SerialPort | null = null;

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
   */
  async scanBluetoothDevices(timeout: number = 5000): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];

    try {
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
  async connectBluetooth(deviceId: string): Promise<boolean> {
    try {
      await BleClient.connect(deviceId, (disconnectedDeviceId) => {
        console.log('[BLE] Dispositivo desconectado:', disconnectedDeviceId);
        this.connectionStatus = { connected: false, type: 'none' };
        this.connectedDevice = null;
      });

      this.connectionStatus = {
        connected: true,
        type: 'bluetooth',
        deviceId: deviceId,
      };

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
   */
  async scanUSBDevices(): Promise<ESP32Device[]> {
    const webSerial = getWebSerial();
    if (!webSerial) {
      console.log('[USB] Web Serial API não disponível');
      return [];
    }

    const devices: ESP32Device[] = [];

    try {
      const ports = await webSerial.getPorts();

      ports.forEach((port: SerialPort, index: number) => {
        devices.push({
          id: `usb-${index}`,
          name: `Porta USB ${index + 1}`,
          type: 'usb',
        });
      });

      console.log('[USB] Portas encontradas:', ports.length);
      return devices;
    } catch (error) {
      console.error('[USB] Erro ao listar portas:', error);
      return [];
    }
  }

  /**
   * Conecta via USB Serial
   */
  async connectUSB(baudRate: number = 115200): Promise<boolean> {
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

      console.log('[USB] Conectado à porta serial');
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

    try {
      const writer = this.serialPort.writable.getWriter();
      const encoder = new TextEncoder();
      const data = encoder.encode(command + '\n');

      await writer.write(data);
      writer.releaseLock();

      console.log('[USB] Comando enviado:', command);
      return true;
    } catch (error) {
      console.error('[USB] Erro ao enviar:', error);
      return false;
    }
  }

  /**
   * Lê dados da porta USB
   */
  async readUSBData(): Promise<string | null> {
    if (!this.serialPort || !this.serialPort.readable) {
      return null;
    }

    try {
      const reader = this.serialPort.readable.getReader();
      const { value } = await reader.read();
      reader.releaseLock();

      if (value) {
        const decoder = new TextDecoder();
        return decoder.decode(value);
      }
      return null;
    } catch (error) {
      console.error('[USB] Erro ao ler:', error);
      return null;
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
   */
  async scanWifiDevices(baseIp: string = '192.168.1'): Promise<ESP32Device[]> {
    const devices: ESP32Device[] = [];
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
   */
  private async checkESP32AtIp(ip: string, timeoutMs: number = 500): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`http://${ip}/status`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
      });

      clearTimeout(timeout);

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
   */
  async connectWifi(ipAddress: string): Promise<boolean> {
    try {
      this.esp32IpAddress = ipAddress;

      // Verificar conexão
      const response = await fetch(`http://${ipAddress}/status`, {
        method: 'GET',
      });

      if (response.ok) {
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

        console.log('[WiFi] Conectado ao ESP32:', ipAddress);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[WiFi] Erro ao conectar:', error);
      return false;
    }
  }

  /**
   * Envia comando via WiFi (HTTP POST)
   */
  async sendWifiCommand(
    command: string,
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
          command,
          ...data,
        }),
      });

      if (response.ok) {
        console.log('[WiFi] Comando enviado:', command);
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
   * Imprimir recibo (extensão futura)
   */
  async printReceipt(receiptData: {
    orderId: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    total: number;
    paymentMethod: string;
  }): Promise<boolean> {
    const payload = {
      action: 'print_receipt',
      ...receiptData,
    };

    if (this.connectionStatus.type === 'bluetooth' || this.connectionStatus.type === 'usb') {
      return this.sendCommand(JSON.stringify(payload));
    }

    return this.sendWifiCommand('print_receipt', payload);
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
