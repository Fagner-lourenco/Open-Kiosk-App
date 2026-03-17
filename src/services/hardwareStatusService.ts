/**
 * ============================================================================
 * Hardware Status Service
 * ============================================================================
 * 
 * Persiste o status de hardware (ESP32, Dispensers) no Firestore
 * para que o Admin possa monitorar remotamente.
 * 
 * Estrutura:
 *   franchises/{franchiseId}/stores/{storeId}/hardware/status
 */

import { doc, setDoc, onSnapshot, Unsubscribe, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId, getFirebaseAuth } from './firebase';
import { systemLogService } from './systemLogService';
import { buildLocalHttpUrl } from '@/utils/localNetworkGuard';

/**
 * Tenta buscar MAC do ESP32 via HTTP GET /status (Opção A)
 * Usa o endpoint real existente no firmware (linha 858+ firmware.ino)
 * Não bloqueia; se timeout, retorna null
 */
export async function fetchDeviceMAC(ipAddress: string | undefined): Promise<string | null> {
  if (!ipAddress) return null;

  try {
    // Timeout 3s (device slow, mas não travamos UI)
    const response = await Promise.race([
      fetch(buildLocalHttpUrl(ipAddress, '/status'), { method: 'GET' }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    if (!response.ok) return null;

    const data = await response.json() as { mac?: string; macAddress?: string };
    return data.mac || data.macAddress || null;
  } catch (error) {
    console.warn(`[hardwareStatusService] Failed to fetch MAC from ${ipAddress}:`, error);
    return null;
  }
}

export interface TapStatusReport {
  id: number;
  isDispensing: boolean;
  orderId?: string;
  progress?: number;
}

export interface HardwareStatus {
  // ESP32
  esp32Connected: boolean;
  esp32Type?: 'usb' | 'wifi' | 'bluetooth';
  esp32Port?: string;
  esp32Ip?: string;
  macAddress?: string;
  firmwareVersion?: string;
  
  // Dispensers
  dispensersTotal: number;
  dispensersOnline: number;
  
  // 🆕 Multi-Tap Support
  numTaps?: number;
  taps?: TapStatusReport[];
  hardwareId?: string;
  // KIO-07: finish types and tap config from pong
  finishTypes?: string[];
  tapsConfig?: unknown[];
  
  // Impressora
  printerConnected: boolean;
  printerPort?: string;
  
  // Metadados
  lastHeartbeat: Date | null;
  updatedAt: Date | null;
  lastSyncAt?: Date | null;
  kioskVersion?: string;
  lastError?: string | null;
  lastErrorAt?: Date | null;

  // Contexto (para collectionGroup rules)
  franchiseId?: string;
  storeId?: string;
}

const DEFAULT_STATUS: HardwareStatus = {
  esp32Connected: false,
  dispensersTotal: 0,
  dispensersOnline: 0,
  printerConnected: false,
  lastHeartbeat: null,
  updatedAt: null,
};

class HardwareStatusService {
  private currentStatus: HardwareStatus = { ...DEFAULT_STATUS };
  private updateInterval: number | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private lastSyncError: { code?: string; message: string; at: Date } | null = null;

  private setSyncError(message: string, code?: string): void {
    const errorAt = new Date();
    this.lastSyncError = { code, message, at: errorAt };
    this.currentStatus = {
      ...this.currentStatus,
      lastError: message,
      lastErrorAt: errorAt,
    };
  }

  private clearSyncError(): void {
    this.lastSyncError = null;
    this.currentStatus = {
      ...this.currentStatus,
      lastError: null,
      lastErrorAt: null,
    };
  }

  private async recordSyncFailure(message: string, error?: unknown): Promise<void> {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : undefined;

    this.setSyncError(message, errorCode);
    systemLogService.error('esp32', message, {
      code: errorCode || null,
      error: error instanceof Error ? error.message : error ? String(error) : null,
    });
  }

  /**
   * Atualiza o status no Firestore (chamado pelo Kiosk)
   * PROTEGIDO: Só escreve se usuário estiver autenticado
   */
  async updateStatus(status: Partial<HardwareStatus>): Promise<void> {
    console.log('[HardwareStatus] updateStatus chamado:', status);
    // 🔒 PROTEÇÃO: Verificar autenticação antes de escrever no Firestore
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      console.warn('[HardwareStatus] ⚠️ Usuário não autenticado - ignorando escrita no Firestore');
      // Atualiza apenas estado local
      this.currentStatus = { ...this.currentStatus, ...status };
      await this.recordSyncFailure('[HardwareStatus] Escrita ignorada: usuário não autenticado');
      return;
    }

    const db = getFirebaseDb();
    if (!db) {
      console.warn('[HardwareStatus] Firebase DB não disponível');
      await this.recordSyncFailure('[HardwareStatus] Firebase DB não disponível');
      return;
    }

    const storeId = getCurrentStoreId();
    if (!storeId) {
      console.warn('[HardwareStatus] storeId não encontrado - verifique localStorage');
      await this.recordSyncFailure('[HardwareStatus] storeId não encontrado para heartbeat');
      return;
    }

    // Buscar franchiseId usando função centralizada
    const franchiseId = getCurrentFranchiseId();
    if (!franchiseId) {
      console.warn('[HardwareStatus] franchiseId não encontrado - verifique localStorage');
      console.warn('[HardwareStatus] Verificando storeSettings:', localStorage.getItem('storeSettings'));
      await this.recordSyncFailure('[HardwareStatus] franchiseId não encontrado para heartbeat');
      return;
    }
    
    console.log(`[HardwareStatus] Atualizando: franchises/${franchiseId}/stores/${storeId}/hardware/status`);

    try {
      const statusRef = doc(db, `franchises/${franchiseId}/stores/${storeId}/hardware/status`);
      
      // Filtrar campos undefined para evitar erro do Firestore
      const filteredStatus = Object.fromEntries(
        Object.entries(status).filter(([_, v]) => v !== undefined)
      );
      
      this.currentStatus = { 
        ...this.currentStatus, 
        ...filteredStatus,
        franchiseId,
        storeId,
        updatedAt: new Date(),
        lastSyncAt: new Date(),
      };

      await setDoc(statusRef, {
        ...Object.fromEntries(
          Object.entries(this.currentStatus).filter(([_, v]) => v !== undefined)
        ),
        updatedAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
        lastError: null,
        lastErrorAt: null,
        kioskVersion: import.meta.env.VITE_APP_VERSION || '1.0.0', // Versão do Kiosk
      }, { merge: true });
      this.clearSyncError();

      // Tentar buscar MAC via HTTP /status quando estiver online e sem MAC
      // Skip quando conectado via USB — esp32Ip aponta para o AP WiFi do ESP32 (192.168.4.1)
      // que não é acessível pela rede do host, causando ERR_CONNECTION_TIMED_OUT
      // FIX: Usar this.currentStatus.esp32Type como fallback — chamadas parciais (ex: pong)
      //      não incluem esp32Type, mas ele já foi setado em chamada anterior.
      const effectiveType = status.esp32Type || this.currentStatus.esp32Type;
      const hasMac = status.macAddress || this.currentStatus.macAddress;
      if (status.esp32Connected && status.esp32Ip && !hasMac && effectiveType === 'wifi') {
        fetchDeviceMAC(status.esp32Ip).then((mac) => {
          if (mac) {
            this.currentStatus.macAddress = mac;
            setDoc(statusRef, { macAddress: mac }, { merge: true }).catch((err) => {
              console.warn('[HardwareStatus] Erro ao atualizar MAC:', err);
            });
          }
        });
      }
      
      console.log('[HardwareStatus] ✅ Status atualizado com sucesso no Firestore');
    } catch (error) {
      console.error('[HardwareStatus] ❌ Erro ao atualizar status:', error);
      await this.recordSyncFailure('[HardwareStatus] Erro ao atualizar status no Firestore', error);
    }
  }

  /**
   * Inicia heartbeat periódico
   * @param intervalMs Intervalo em milissegundos (padrão: 30000ms = 30s)
   */
  startHeartbeat(intervalMs: number = 30000): void {
    if (this.updateInterval) return;

    // Validar bounds
    const MIN = 5000;
    const MAX = 60000;
    let validInterval = intervalMs;

    if (intervalMs < MIN) {
      console.warn(`[HardwareStatus] Intervalo ${intervalMs}ms é menor que o mínimo ${MIN}ms. Usando ${MIN}ms`);
      validInterval = MIN;
    } else if (intervalMs > MAX) {
      console.warn(`[HardwareStatus] Intervalo ${intervalMs}ms é maior que o máximo ${MAX}ms. Usando ${MAX}ms`);
      validInterval = MAX;
    }

    console.log(`[HardwareStatus] Iniciando heartbeat com intervalo de ${validInterval}ms`);

    this.updateInterval = window.setInterval(() => {
      this.updateStatus({ lastHeartbeat: new Date() });
    }, validInterval);
  }

  /**
   * Para o heartbeat
   */
  stopHeartbeat(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Escuta mudanças de status (usado pelo Admin)
   */
  subscribeToStatus(
    franchiseId: string, 
    storeId: string, 
    callback: (status: HardwareStatus) => void
  ): Unsubscribe {
    const db = getFirebaseDb();
    if (!db) {
      return () => {};
    }

    const statusRef = doc(db, `franchises/${franchiseId}/stores/${storeId}/hardware/status`);
    
    return onSnapshot(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const status: HardwareStatus = {
          esp32Connected: data.esp32Connected ?? false,
          esp32Type: data.esp32Type,
          esp32Port: data.esp32Port,
          esp32Ip: data.esp32Ip,
          macAddress: data.macAddress,
          firmwareVersion: data.firmwareVersion,
          dispensersTotal: data.dispensersTotal ?? 0,
          dispensersOnline: data.dispensersOnline ?? 0,
          numTaps: data.numTaps ?? 0,
          taps: data.taps || [],
          hardwareId: data.hardwareId,
          printerConnected: data.printerConnected ?? false,
          printerPort: data.printerPort,
          lastHeartbeat: data.lastHeartbeat?.toDate?.() || null,
          updatedAt: data.updatedAt?.toDate?.() || null,
          lastSyncAt: data.lastSyncAt?.toDate?.() || null,
          kioskVersion: data.kioskVersion,
          lastError: data.lastError || null,
          lastErrorAt: data.lastErrorAt?.toDate?.() || null,
        };
        callback(status);
      } else {
        callback({ ...DEFAULT_STATUS });
      }
    }, (error) => {
      console.error('[HardwareStatus] Erro ao escutar status:', error);
      callback({ ...DEFAULT_STATUS });
    });
  }

  /**
   * Retorna o status atual (sem Firestore)
   */
  getCurrentStatus(): HardwareStatus {
    return { ...this.currentStatus };
  }

  getLastSyncError(): { code?: string; message: string; at: Date } | null {
    return this.lastSyncError ? { ...this.lastSyncError } : null;
  }

  /**
   * Limpa recursos
   */
  cleanup(): void {
    this.stopHeartbeat();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

export const hardwareStatusService = new HardwareStatusService();
export default hardwareStatusService;
