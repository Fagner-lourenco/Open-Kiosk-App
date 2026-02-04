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
import { isFranchiseMode } from '@/lib/pathResolver';

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
  
  // Impressora
  printerConnected: boolean;
  printerPort?: string;
  
  // Metadados
  lastHeartbeat: Date | null;
  updatedAt: Date | null;
  kioskVersion?: string;

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

  /**
   * Atualiza o status no Firestore (chamado pelo Kiosk)
   * PROTEGIDO: Só escreve se usuário estiver autenticado
   */
  async updateStatus(status: Partial<HardwareStatus>): Promise<void> {
    console.log('[HardwareStatus] updateStatus chamado:', status);
    
    if (!isFranchiseMode()) {
      // Em modo legado, não persiste no Firestore
      console.log('[HardwareStatus] Modo legado - não persiste no Firestore');
      this.currentStatus = { ...this.currentStatus, ...status };
      return;
    }

    // 🔒 PROTEÇÃO: Verificar autenticação antes de escrever no Firestore
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      console.warn('[HardwareStatus] ⚠️ Usuário não autenticado - ignorando escrita no Firestore');
      // Atualiza apenas estado local
      this.currentStatus = { ...this.currentStatus, ...status };
      return;
    }

    const db = getFirebaseDb();
    if (!db) {
      console.warn('[HardwareStatus] Firebase DB não disponível');
      return;
    }

    const storeId = getCurrentStoreId();
    if (!storeId) {
      console.warn('[HardwareStatus] storeId não encontrado - verifique localStorage');
      return;
    }

    // Buscar franchiseId usando função centralizada
    const franchiseId = getCurrentFranchiseId();
    if (!franchiseId) {
      console.warn('[HardwareStatus] franchiseId não encontrado - verifique localStorage');
      console.warn('[HardwareStatus] Verificando storeSettings:', localStorage.getItem('storeSettings'));
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
      };

      await setDoc(statusRef, {
        ...Object.fromEntries(
          Object.entries(this.currentStatus).filter(([_, v]) => v !== undefined)
        ),
        updatedAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
        kioskVersion: import.meta.env.VITE_APP_VERSION || '1.0.0', // Versão do Kiosk
      }, { merge: true });
      
      console.log('[HardwareStatus] ✅ Status atualizado com sucesso no Firestore');
    } catch (error) {
      console.error('[HardwareStatus] ❌ Erro ao atualizar status:', error);
    }
  }

  /**
   * Inicia heartbeat periódico (a cada 30 segundos)
   */
  startHeartbeat(): void {
    if (this.updateInterval) return;

    this.updateInterval = window.setInterval(() => {
      this.updateStatus({ lastHeartbeat: new Date() });
    }, 30000); // 30 segundos
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
          firmwareVersion: data.firmwareVersion,
          dispensersTotal: data.dispensersTotal ?? 0,
          dispensersOnline: data.dispensersOnline ?? 0,
          printerConnected: data.printerConnected ?? false,
          printerPort: data.printerPort,
          lastHeartbeat: data.lastHeartbeat?.toDate?.() || null,
          updatedAt: data.updatedAt?.toDate?.() || null,
          kioskVersion: data.kioskVersion,
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
