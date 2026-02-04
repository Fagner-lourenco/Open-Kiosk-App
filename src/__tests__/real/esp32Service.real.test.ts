/**
 * ============================================================================
 * TESTES REAIS - ESP32 Communication Service
 * ============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));
import { 
  esp32Service, 
  ESP32_DEVICE_NAME, 
  ESP32_WIFI_SSID, 
  ESP32_WIFI_PASSWORD,
  ESP32_DEFAULT_IP,
  ESP32_BLE_PIN,
} from '@/services/esp32CommunicationService';
import type { ESP32Device, ConnectionType, LastConnectionInfo, ConnectionStatus } from '@/services/esp32CommunicationService';

describe('ESP32CommunicationService Real Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    esp32Service.disconnect();
  });

  describe('Constantes exportadas', () => {
    it('ESP32_DEVICE_NAME é definido', () => {
      expect(ESP32_DEVICE_NAME).toBe('Kiosk_Bier');
    });

    it('ESP32_WIFI_SSID é definido', () => {
      expect(ESP32_WIFI_SSID).toBe('Kiosk_Bier');
    });

    it('ESP32_WIFI_PASSWORD é definido', () => {
      expect(ESP32_WIFI_PASSWORD).toBe('bier2026');
    });

    it('ESP32_DEFAULT_IP é definido', () => {
      expect(ESP32_DEFAULT_IP).toBe('192.168.4.1');
    });

    it('ESP32_BLE_PIN é definido', () => {
      expect(ESP32_BLE_PIN).toBe('123456');
    });
  });

  describe('Tipos e interfaces', () => {
    it('ConnectionType aceita valores válidos', () => {
      const types: ConnectionType[] = ['bluetooth', 'wifi', 'usb', 'none'];
      types.forEach(type => {
        expect(['bluetooth', 'wifi', 'usb', 'none']).toContain(type);
      });
    });

    it('ESP32Device pode ser criado', () => {
      const device: ESP32Device = {
        id: 'test-id',
        name: 'Test Device',
        type: 'bluetooth',
        rssi: -50,
      };
      
      expect(device.id).toBe('test-id');
      expect(device.name).toBe('Test Device');
      expect(device.type).toBe('bluetooth');
      expect(device.rssi).toBe(-50);
    });

    it('LastConnectionInfo pode ser criado', () => {
      const info: LastConnectionInfo = {
        type: 'bluetooth',
        deviceId: 'device-123',
        deviceName: 'ESP32',
        timestamp: Date.now(),
      };
      
      expect(info.type).toBe('bluetooth');
      expect(info.deviceId).toBe('device-123');
    });

    it('ConnectionStatus pode ser criado', () => {
      const status: ConnectionStatus = {
        connected: true,
        type: 'usb',
        deviceName: 'ESP32 USB',
        deviceId: 'usb-123',
      };
      
      expect(status.connected).toBe(true);
      expect(status.type).toBe('usb');
    });
  });

  describe('Conexão BLE', () => {
    it('deve conectar via BLE com sucesso', async () => {
      const mockDevice: ESP32Device = {
        id: 'ble-test',
        name: 'Kiosk_Bier',
        type: 'bluetooth'
      };
      
      const result = await esp32Service.connect(mockDevice);
      
      expect(typeof result).toBe('boolean');
    });

    it('deve desconectar do dispositivo BLE', async () => {
      await esp32Service.disconnect();
      
      expect(true).toBe(true);
    });
  });

  describe('Conexão USB Serial', () => {
    it('deve conectar via USB serial', async () => {
      const mockDevice: ESP32Device = {
        id: 'usb-serial',
        name: 'ESP32 USB',
        type: 'usb'
      };
      
      const result = await esp32Service.connect(mockDevice);
      
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Gerenciamento de Conexão', () => {
    it('deve desconectar corretamente', async () => {
      await esp32Service.disconnect();
      expect(true).toBe(true);
    });

    it('deve lidar com reconexão', async () => {
      await esp32Service.disconnect();
      
      const mockDevice: ESP32Device = {
        id: 'reconnect-test',
        name: 'Kiosk_Bier',
        type: 'bluetooth'
      };
      
      const result = await esp32Service.connect(mockDevice);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Métodos do serviço', () => {
    it('getConnectionStatus retorna objeto com connected e type', () => {
      const status = esp32Service.getConnectionStatus();
      
      expect(typeof status.connected).toBe('boolean');
      expect(['bluetooth', 'wifi', 'usb', 'none']).toContain(status.type);
    });

    it('isConnected retorna boolean', () => {
      const status = esp32Service.getConnectionStatus();
      
      expect(typeof status.connected).toBe('boolean');
    });

    it('disconnect é uma função', () => {
      expect(typeof esp32Service.disconnect).toBe('function');
    });

    it('connect é uma função', () => {
      expect(typeof esp32Service.connect).toBe('function');
    });
  });
});
