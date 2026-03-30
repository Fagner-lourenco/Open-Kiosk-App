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
import { Device, type DeviceInfo as CapDeviceInfo } from '@capacitor/device';
import { getDefaultTapId, getPlugPagDeviceId } from '@/components/TapSettingsSync';

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

export interface DeviceLocation {
  lat: number;
  lng: number;
  accuracy: number;        // metros
  provider: 'gps' | 'network' | 'unknown';
  updatedAt: number;       // epoch ms
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
const LOCATION_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const LOCATION_TIMEOUT_MS = 8_000;             // 8 segundos

// ============================================================================
// SERVICE
// ============================================================================

class DeviceHeartbeatService {
  private heartbeatInterval: number | null = null;
  private cachedDeviceId: string | null = null;
  private startTime: number = Date.now();
  private esp32Info: Partial<DeviceInfo> = {};
  private cachedLocation: DeviceLocation | null = null;
  private locationCachedAt: number = 0;
  private cachedDeviceInfo: CapDeviceInfo | null = null;

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
   * Coleta info do hardware (modelo, fabricante, SO) uma única vez.
   */
  private async collectDeviceInfo(): Promise<CapDeviceInfo | null> {
    if (this.cachedDeviceInfo) return this.cachedDeviceInfo;
    try {
      this.cachedDeviceInfo = await Device.getInfo();
      return this.cachedDeviceInfo;
    } catch {
      return null;
    }
  }

  /**
   * Solicita permissões de câmera e microfone antes de entrar em lock task mode.
   * Abre getUserMedia brevemente para disparar o dialog do Android,
   * e fecha imediatamente. Isso garante que câmera e microfone funcionem
   * quando solicitados remotamente pelo Admin.
   */
  private async requestCameraAndMicPermissions(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => t.stop());
      console.log('[DeviceHeartbeat] Permissões de câmera e microfone concedidas');
    } catch (err) {
      // Tentar só câmera se áudio falhou
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        console.log('[DeviceHeartbeat] Permissão de câmera concedida (mic indisponível)');
      } catch (camErr) {
        console.warn('[DeviceHeartbeat] Câmera/mic não disponível:', (camErr as Error).message);
      }
    }
  }

  /**
   * Solicita permissão de GPS antes de entrar em lock task mode.
   * Deve ser chamado cedo no ciclo de vida do app para que o dialog apareça.
   */
  private async requestLocationPermission(): Promise<void> {
    try {
      if (!navigator.geolocation) return;
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'granted') return;
      // Permissão será solicitada implicitamente na primeira chamada a getCurrentPosition
      console.log('[DeviceHeartbeat] GPS permission state:', perm.state);
    } catch (err) {
      console.warn('[DeviceHeartbeat] Não foi possível verificar permissão GPS:', (err as Error).message);
    }
  }

  /**
   * Coleta posição GPS do dispositivo com cache de 15 minutos.
   * Nunca lança exceção — falhas são silenciosas para não bloquear o heartbeat.
   */
  private async collectLocation(): Promise<DeviceLocation | null> {
    const now = Date.now();
    if (this.cachedLocation && now - this.locationCachedAt < LOCATION_CACHE_TTL_MS) {
      return this.cachedLocation;
    }

    if (!navigator.geolocation) return null;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT_MS,
          maximumAge: LOCATION_CACHE_TTL_MS,
        });
      });

      const location: DeviceLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        provider: pos.coords.accuracy <= 50 ? 'gps' : 'network',
        updatedAt: now,
      };

      this.cachedLocation = location;
      this.locationCachedAt = now;
      return location;
    } catch (err) {
      console.warn('[DeviceHeartbeat] GPS não disponível:', (err as Error).message);
      return null;
    }
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

        const hwInfo = await this.collectDeviceInfo();

        const heartbeatData: Record<string, unknown> = {
          deviceId,
          deviceType,
          storeId,
          isOnline: true,
          lastSeen: serverTimestamp(),
          lastSync: serverTimestamp(),
          uptime: this.getUptime(),
          appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
          selectedTapId: getDefaultTapId(),
        };
        const plugpagDeviceId = getPlugPagDeviceId();
        if (plugpagDeviceId) {
          heartbeatData.plugpagDeviceId = plugpagDeviceId;
          heartbeatData.plugpagMac = plugpagDeviceId;
        }
        if (franchiseId) heartbeatData.franchiseId = franchiseId;

        // Info do hardware (modelo, fabricante, SO)
        if (hwInfo) {
          heartbeatData.deviceModel = hwInfo.model;
          heartbeatData.deviceManufacturer = hwInfo.manufacturer;
          heartbeatData.osVersion = `${hwInfo.operatingSystem} ${hwInfo.osVersion}`;
        }

      // Adicionar campos opcionais
      if (options.ip) heartbeatData.ip = options.ip;
      if (options.mac) heartbeatData.mac = options.mac;
      if (options.firmwareVersion) heartbeatData.firmwareVersion = options.firmwareVersion;
      if (options.metadata) heartbeatData.metadata = options.metadata;

      // Coletar GPS (isolado — nunca propaga erro ao heartbeat)
      if (deviceType === 'kiosk') {
        const location = await this.collectLocation();
        if (location) {
          heartbeatData.location = {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            provider: location.provider,
            updatedAt: location.updatedAt,
          };
        }
      }

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
   * Inicia heartbeat periódico.
   * Deve ser chamado ANTES de enterKioskMode() para que o dialog de
   * permissão GPS apareça antes do lock task bloquear a tela.
   */
  async start(): Promise<void> {
    if (this.heartbeatInterval) {
      console.log('[DeviceHeartbeat] Já iniciado');
      return;
    }

    console.log('[DeviceHeartbeat] 🚀 Iniciando heartbeat periódico');

    // Solicitar permissão GPS antecipadamente (antes de lock task mode)
    await this.requestLocationPermission();

    // Solicitar permissões de câmera e microfone (antes de lock task mode)
    await this.requestCameraAndMicPermissions();

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
