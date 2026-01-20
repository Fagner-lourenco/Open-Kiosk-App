/**
 * ============================================================================
 * Serviço de Dispensers (Torneiras)
 * ============================================================================
 * 
 * Gerencia operações de dispensers/torneiras no Firestore.
 * 
 * Funcionalidades:
 * - CRUD de dispensers
 * - Configuração de hardware
 * - Calibração
 * - Status e monitoramento
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { StoreDispenser, DispenserHardwareConfig, DispenserCalibration } from '../types/franchise';
import { isFranchiseMode, storeSubPath } from '../lib/pathResolver';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Converte Timestamps do Firestore para Date
 */
function convertTimestamps<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (value instanceof Timestamp) {
      (result as Record<string, unknown>)[key] = value.toDate();
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = convertTimestamps(value as Record<string, unknown>);
    }
  }
  return result;
}

/**
 * Retorna o path da collection de dispensers
 */
function dispensersPath(franchiseId: string | undefined, storeId: string): string {
  return storeSubPath(franchiseId, storeId, 'dispensers');
}

/**
 * Obtém o Firestore DB de forma segura
 */
function getDb() {
  try {
    return getFirebaseDb();
  } catch {
    return null;
  }
}

// ============================================================================
// CLASSE DO SERVIÇO
// ============================================================================

class DispenserService {
  // ==========================================================================
  // CRUD
  // ==========================================================================

  /**
   * Busca um dispenser por ID
   */
  async getDispenser(
    storeId: string,
    dispenserId: string,
    franchiseId?: string
  ): Promise<StoreDispenser | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const path = dispensersPath(franchiseId, storeId);
      const docRef = doc(db, path, dispenserId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...convertTimestamps(data),
      } as StoreDispenser;
    } catch (error) {
      console.error('[DispenserService] Erro ao buscar dispenser:', error);
      throw error;
    }
  }

  /**
   * Lista todos os dispensers de uma loja
   */
  async listDispensers(
    storeId: string,
    franchiseId?: string
  ): Promise<StoreDispenser[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const path = dispensersPath(franchiseId, storeId);
      const q = query(collection(db, path));
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      })) as StoreDispenser[];
    } catch (error) {
      console.error('[DispenserService] Erro ao listar dispensers:', error);
      throw error;
    }
  }

  /**
   * Lista dispensers ativos de uma loja
   */
  async listActiveDispensers(
    storeId: string,
    franchiseId?: string
  ): Promise<StoreDispenser[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const path = dispensersPath(franchiseId, storeId);
      const q = query(
        collection(db, path),
        where('isActive', '==', true)
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      })) as StoreDispenser[];
    } catch (error) {
      console.error('[DispenserService] Erro ao listar dispensers ativos:', error);
      throw error;
    }
  }

  /**
   * Cria um novo dispenser
   */
  async createDispenser(
    storeId: string,
    data: Omit<StoreDispenser, 'id' | 'createdAt' | 'updatedAt'>,
    franchiseId?: string
  ): Promise<StoreDispenser> {
    const db = getDb();
    if (!db) throw new Error('Firebase não inicializado');

    try {
      const path = dispensersPath(franchiseId, storeId);
      const docRef = doc(collection(db, path));
      
      const dispenserData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, dispenserData);

      return {
        id: docRef.id,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('[DispenserService] Erro ao criar dispenser:', error);
      throw error;
    }
  }

  /**
   * Atualiza um dispenser existente
   */
  async updateDispenser(
    storeId: string,
    dispenserId: string,
    updates: Partial<Omit<StoreDispenser, 'id' | 'createdAt'>>,
    franchiseId?: string
  ): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('Firebase não inicializado');

    try {
      const path = dispensersPath(franchiseId, storeId);
      const docRef = doc(db, path, dispenserId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('[DispenserService] Erro ao atualizar dispenser:', error);
      throw error;
    }
  }

  /**
   * Remove um dispenser
   */
  async deleteDispenser(
    storeId: string,
    dispenserId: string,
    franchiseId?: string
  ): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('Firebase não inicializado');

    try {
      const path = dispensersPath(franchiseId, storeId);
      const docRef = doc(db, path, dispenserId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('[DispenserService] Erro ao remover dispenser:', error);
      throw error;
    }
  }

  /**
   * Ativa/desativa um dispenser
   */
  async toggleDispenser(
    storeId: string,
    dispenserId: string,
    isActive: boolean,
    franchiseId?: string
  ): Promise<void> {
    return this.updateDispenser(storeId, dispenserId, { isActive }, franchiseId);
  }

  // ==========================================================================
  // CONFIGURAÇÃO DE HARDWARE
  // ==========================================================================

  /**
   * Atualiza configuração de hardware
   */
  async updateHardwareConfig(
    storeId: string,
    dispenserId: string,
    hardware: DispenserHardwareConfig,
    franchiseId?: string
  ): Promise<void> {
    return this.updateDispenser(storeId, dispenserId, { hardware }, franchiseId);
  }

  /**
   * Atualiza calibração
   */
  async updateCalibration(
    storeId: string,
    dispenserId: string,
    calibration: DispenserCalibration,
    franchiseId?: string
  ): Promise<void> {
    return this.updateDispenser(storeId, dispenserId, { calibration }, franchiseId);
  }

  /**
   * Atualiza último status conhecido
   */
  async updateStatus(
    storeId: string,
    dispenserId: string,
    status: {
      connected: boolean;
      lastSeen: Date;
      firmwareVersion?: string;
    },
    franchiseId?: string
  ): Promise<void> {
    return this.updateDispenser(storeId, dispenserId, { lastStatus: status }, franchiseId);
  }

  // ==========================================================================
  // PRODUTOS PERMITIDOS
  // ==========================================================================

  /**
   * Adiciona produto à lista de permitidos
   */
  async addAllowedProduct(
    storeId: string,
    dispenserId: string,
    productId: string,
    franchiseId?: string
  ): Promise<void> {
    const dispenser = await this.getDispenser(storeId, dispenserId, franchiseId);
    if (!dispenser) throw new Error('Dispenser não encontrado');

    const allowedProductIds = [...new Set([...dispenser.allowedProductIds, productId])];
    return this.updateDispenser(storeId, dispenserId, { allowedProductIds }, franchiseId);
  }

  /**
   * Remove produto da lista de permitidos
   */
  async removeAllowedProduct(
    storeId: string,
    dispenserId: string,
    productId: string,
    franchiseId?: string
  ): Promise<void> {
    const dispenser = await this.getDispenser(storeId, dispenserId, franchiseId);
    if (!dispenser) throw new Error('Dispenser não encontrado');

    const allowedProductIds = dispenser.allowedProductIds.filter((id) => id !== productId);
    return this.updateDispenser(storeId, dispenserId, { allowedProductIds }, franchiseId);
  }

  /**
   * Define lista completa de produtos permitidos
   */
  async setAllowedProducts(
    storeId: string,
    dispenserId: string,
    productIds: string[],
    franchiseId?: string
  ): Promise<void> {
    return this.updateDispenser(
      storeId,
      dispenserId,
      { allowedProductIds: productIds },
      franchiseId
    );
  }

  // ==========================================================================
  // REAL-TIME SUBSCRIPTION
  // ==========================================================================

  /**
   * Subscribe para mudanças em tempo real
   */
  subscribeToDispensers(
    storeId: string,
    callback: (dispensers: StoreDispenser[]) => void,
    franchiseId?: string
  ): Unsubscribe {
    const db = getDb();
    if (!db) {
      console.warn('[DispenserService] Firebase não inicializado para subscription');
      return () => {};
    }

    const path = dispensersPath(franchiseId, storeId);
    const q = query(collection(db, path));

    return onSnapshot(q, (snapshot) => {
      const dispensers = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      })) as StoreDispenser[];
      
      callback(dispensers);
    }, (error) => {
      console.error('[DispenserService] Erro na subscription:', error);
    });
  }

  // ==========================================================================
  // BUSCA POR HARDWARE
  // ==========================================================================

  /**
   * Busca dispenser por device ID (MAC address)
   */
  async findByDeviceId(
    storeId: string,
    deviceId: string,
    franchiseId?: string
  ): Promise<StoreDispenser | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const path = dispensersPath(franchiseId, storeId);
      const q = query(
        collection(db, path),
        where('hardware.deviceId', '==', deviceId)
      );
      const querySnap = await getDocs(q);

      if (querySnap.empty) return null;

      const docSnap = querySnap.docs[0];
      return {
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      } as StoreDispenser;
    } catch (error) {
      console.error('[DispenserService] Erro ao buscar por deviceId:', error);
      throw error;
    }
  }

  /**
   * Busca dispensers por tipo de conexão
   */
  async findByConnectionType(
    storeId: string,
    connectionType: 'usb' | 'wifi' | 'bluetooth',
    franchiseId?: string
  ): Promise<StoreDispenser[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const path = dispensersPath(franchiseId, storeId);
      const q = query(
        collection(db, path),
        where('hardware.connectionType', '==', connectionType)
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      })) as StoreDispenser[];
    } catch (error) {
      console.error('[DispenserService] Erro ao buscar por tipo de conexão:', error);
      throw error;
    }
  }

  // ==========================================================================
  // DEFAULTS
  // ==========================================================================

  /**
   * Retorna configuração padrão para um novo dispenser
   */
  getDefaultDispenser(): Omit<StoreDispenser, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: 'Nova Torneira',
      icon: '🍺',
      color: '#3B82F6',
      isActive: true,
      hardware: {
        deviceId: '',
        connectionType: 'usb',
        valvePin: 0,
        flowSensorPin: 1,
      },
      calibration: {
        pulsesPerLiter: 450, // Valor típico para sensores YF-S201
        mlPerSecond: 33.3, // ~2L/min
      },
      allowedProductIds: [],
    };
  }

  /**
   * Retorna configuração de calibração padrão
   */
  getDefaultCalibration(): DispenserCalibration {
    return {
      pulsesPerLiter: 450,
      mlPerSecond: 33.3,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const dispenserService = new DispenserService();
