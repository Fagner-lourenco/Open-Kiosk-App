/**
 * ============================================================================
 * Device Heartbeat Service
 * ============================================================================
 * 
 * Gerencia heartbeat periódico de dispositivos (ESP32, Kiosk) para Firestore.
 * Permite que o Admin monitore status de hardware em tempo real.
 * 
 * Estrutura:
 *   franchises/{franchiseId}/stores/{storeId}/devices/{deviceId}
 * 
 * Campos:
 *   - deviceId: ID único do dispositivo
 *   - deviceType: 'esp32' | 'kiosk' | 'tablet'
 *   - lastSeen: serverTimestamp()
 *   - lastSync: serverTimestamp()
 *   - ip: endereço IP
 *   - mac: endereço MAC
 *   - firmwareVersion: versão do firmware
 *   - appVersion: versão do app
 *   - uptime: tempo online em segundos
 *   - isOnline: boolean
 *   - metadata: dados adicionais
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { doc, setDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId } from './firebase';
import { Device } from '@capacitor/device';

// ============================================================================
// TIPOS
// ============================================================================

export interface DeviceInfo {
  deviceId: string;
  deviceType: 'esp32' | 'kiosk' | 'tablet' | 'unknown';
  ip?: string;
  mac?: string;
  firmwareVersion?: string;
  appVersion?: string;
  uptime?: number;
  isOnline: boolean;
  lastSeen?: Date;
  lastSync?: Date;
  storeId?: string;
  franchiseId?: string;
  metadata?: Record<string, unknown>;
}

export interface HeartbeatOptions {
  deviceId?: string;
  deviceType?: DeviceInfo['deviceType'];
  ip?: string;
  mac?: string;
  firmwareVersion?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minuto
const DEVICE_STORAGE_KEY = 'open-kiosk:deviceId';

// ============================================================================
// SERVICE
// ============================================================================

class DeviceHeartbeatService {
  private heartbeatInterval: number | null = null;
  private cachedDeviceId: string | null = null;
  private startTime: number = Date.now();
  private esp32Info: Partial<DeviceInfo> = {};

  /**
   * Obtém ou gera um deviceId único para este dispositivo
   */
  async getDeviceId(): Promise<string> {
    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    // Tentar obter do localStorage
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored) {
      this.cachedDeviceId = stored;
      return stored;
    }

    // Tentar obter do Capacitor Device
    try {
      const info = await Device.getId();
      if (info.identifier) {
        this.cachedDeviceId = info.identifier;
        localStorage.setItem(DEVICE_STORAGE_KEY, info.identifier);
        return info.identifier;
      }
    } catch (error) {
      console.warn('[DeviceHeartbeat] Capacitor Device não disponível:', error);
    }

    // Gerar UUID como fallback
    const uuid = crypto.randomUUID?.() || 
      `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}`;
    
    this.cachedDeviceId = uuid;
    localStorage.setItem(DEVICE_STORAGE_KEY, uuid);
    return uuid;
  }

  /**
   * Calcula uptime do app em segundos
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Atualiza informações do ESP32 (chamado quando ESP32 conecta)
   */
  updateESP32Info(info: Partial<DeviceInfo>): void {
    this.esp32Info = {
      ...this.esp32Info,
      ...info,
    };
    
    // Enviar heartbeat imediato com novas informações
    this.sendHeartbeat({ ...info, deviceType: 'esp32' });
  }

  /**
   * Envia heartbeat para o Firestore
   */
  async sendHeartbeat(options: HeartbeatOptions = {}): Promise<void> {
    const db = getFirebaseDb();
    if (!db) {
      console.warn('[DeviceHeartbeat] Firestore não disponível');
      return;
    }

    const storeId = getCurrentStoreId();
    if (!storeId) {
      console.warn('[DeviceHeartbeat] storeId não disponível');
      return;
    }

    const deviceId = options.deviceId || await this.getDeviceId();
    const deviceType = options.deviceType || 'kiosk';

    try {
      const franchiseId = getCurrentFranchiseId();
      if (!franchiseId) {
        console.warn('[DeviceHeartbeat] franchiseId n??o dispon??vel');
        return;
      }
      
      const deviceRef = doc(
        db, 
        `franchises/${franchiseId}/stores/${storeId}/devices/${deviceId}`
      );

        const heartbeatData: Record<string, unknown> = {
          deviceId,
          deviceType,
          storeId,
          isOnline: true,
          lastSeen: serverTimestamp(),
          lastSync: serverTimestamp(),
          uptime: this.getUptime(),
          appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
        };
        if (franchiseId) heartbeatData.franchiseId = franchiseId;

      // Adicionar campos opcionais
      if (options.ip) heartbeatData.ip = options.ip;
      if (options.mac) heartbeatData.mac = options.mac;
      if (options.firmwareVersion) heartbeatData.firmwareVersion = options.firmwareVersion;
      if (options.metadata) heartbeatData.metadata = options.metadata;

      // Mesclar com info do ESP32 se disponível
        if (deviceType === 'kiosk' && this.esp32Info) {
          const esp32Data: Record<string, unknown> = {
            connected: this.esp32Info.isOnline || false,
          };
          if (this.esp32Info.ip) esp32Data.ip = this.esp32Info.ip;
          if (this.esp32Info.mac) esp32Data.mac = this.esp32Info.mac;
          if (this.esp32Info.firmwareVersion) esp32Data.firmwareVersion = this.esp32Info.firmwareVersion;
          heartbeatData.esp32 = esp32Data;
        }

      await setDoc(deviceRef, heartbeatData, { merge: true });
      
      console.log(`[DeviceHeartbeat] ✅ Heartbeat sent for ${deviceId}`);
    } catch (error) {
      console.error('[DeviceHeartbeat] ❌ Erro ao enviar heartbeat:', error);
    }
  }

  /**
   * Inicia heartbeat periódico
   */
  start(): void {
    if (this.heartbeatInterval) {
      console.log('[DeviceHeartbeat] Já iniciado');
      return;
    }

    console.log('[DeviceHeartbeat] 🚀 Iniciando heartbeat periódico');

    // Enviar heartbeat inicial
    this.sendHeartbeat();

    // Configurar intervalo
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Para heartbeat periódico
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[DeviceHeartbeat] ⏹️ Heartbeat parado');
    }
  }

  /**
   * Marca dispositivo como offline (chamado no cleanup)
   */
  async markOffline(): Promise<void> {
    const db = getFirebaseDb();
    if (!db) return;

    const storeId = getCurrentStoreId();
    if (!storeId) return;

    const deviceId = await this.getDeviceId();

    try {
      const franchiseId = getCurrentFranchiseId();
      if (!franchiseId) return;
      
      const deviceRef = doc(
        db, 
        `franchises/${franchiseId}/stores/${storeId}/devices/${deviceId}`
      );

      await setDoc(deviceRef, {
        isOnline: false,
        lastSeen: serverTimestamp(),
      }, { merge: true });

      console.log('[DeviceHeartbeat] Dispositivo marcado como offline');
    } catch (error) {
      console.error('[DeviceHeartbeat] Erro ao marcar offline:', error);
    }
  }

  /**
   * Limpa recursos
   * 🔧 v4.0.7: Agora é async para garantir que markOffline complete antes do app fechar
   */
  async cleanup(): Promise<void> {
    this.stop();
    await this.markOffline();
  }
}

// Singleton
export const deviceHeartbeatService = new DeviceHeartbeatService();
export default deviceHeartbeatService;
