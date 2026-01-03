import { getFirebaseDb, getCurrentStoreId } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { Store } from '@/types/store';

// ============================================
// Store Service - Gerenciamento de Lojas
// ============================================

class StoreService {
  
  /**
   * Obter loja atual do localStorage
   */
  getCurrentStoreId(): string | null {
    return getCurrentStoreId();
  }
  
  /**
   * Validar que storeId existe no Firestore
   */
  async validateStoreExists(storeId: string): Promise<boolean> {
    try {
      const db = getFirebaseDb();
      const storeDoc = doc(db, 'stores', storeId);
      const snapshot = await getDoc(storeDoc);
      return snapshot.exists();
    } catch (error) {
      console.error('[StoreService] Error validating store:', error);
      return false;
    }
  }
  
  /**
   * Obter dados completos de uma loja
   */
  async getStore(storeId: string): Promise<Store | null> {
    try {
      const db = getFirebaseDb();
      const storeDoc = doc(db, 'stores', storeId);
      const snapshot = await getDoc(storeDoc);
      
      if (!snapshot.exists()) {
        console.warn(`[StoreService] Store ${storeId} not found`);
        return null;
      }
      
      return { id: snapshot.id, ...snapshot.data() } as Store;
    } catch (error) {
      console.error('[StoreService] Error fetching store:', error);
      throw error;
    }
  }
  
  /**
   * Criar nova loja (com documento e configurações iniciais)
   */
  async createStore(store: Omit<Store, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    try {
      const db = getFirebaseDb();
      const storeRef = doc(db, 'stores', store.storeId);
      
      // Verificar se já existe
      const exists = await getDoc(storeRef);
      if (exists.exists()) {
        console.log(`[StoreService] Store ${store.storeId} already exists, updating...`);
        await updateDoc(storeRef, {
          ...store,
          updated_at: new Date().toISOString()
        });
        return store.storeId;
      }
      
      // Criar novo documento
      await setDoc(storeRef, {
        ...store,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      // Criar documento inicial de settings na subcollection
      const settingsRef = doc(db, 'stores', store.storeId, 'settings', 'general');
      await setDoc(settingsRef, {
        currency: store.currency,
        language: store.language || 'pt-BR',
        created_at: new Date().toISOString()
      });
      
      console.log('[StoreService] Store created:', store.storeId);
      return store.storeId;
    } catch (error) {
      console.error('[StoreService] Error creating store:', error);
      throw error;
    }
  }
  
  /**
   * Atualizar dados de uma loja existente
   */
  async updateStore(storeId: string, updates: Partial<Store>): Promise<void> {
    try {
      const db = getFirebaseDb();
      const storeRef = doc(db, 'stores', storeId);
      
      await updateDoc(storeRef, {
        ...updates,
        updated_at: new Date().toISOString()
      });
      
      console.log('[StoreService] Store updated:', storeId);
    } catch (error) {
      console.error('[StoreService] Error updating store:', error);
      throw error;
    }
  }
  
  /**
   * Listar todas as lojas (para dashboard futuro)
   */
  async getAllStores(): Promise<Store[]> {
    try {
      const db = getFirebaseDb();
      const storesCollection = collection(db, 'stores');
      const snapshot = await getDocs(storesCollection);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Store[];
    } catch (error) {
      console.error('[StoreService] Error fetching stores:', error);
      throw error;
    }
  }
  
  /**
   * Listar apenas lojas ativas
   */
  async getActiveStores(): Promise<Store[]> {
    try {
      const db = getFirebaseDb();
      const storesCollection = collection(db, 'stores');
      const q = query(storesCollection, where('isActive', '==', true));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Store[];
    } catch (error) {
      console.error('[StoreService] Error fetching active stores:', error);
      throw error;
    }
  }

  /**
   * Criar ou atualizar loja a partir das configurações locais
   * Usado durante o setup inicial do kiosk
   */
  async ensureStoreExists(storeId: string, name: string, currency: string, taxId: string, taxPercentage: number): Promise<void> {
    try {
      const db = getFirebaseDb();
      const storeRef = doc(db, 'stores', storeId);
      const snapshot = await getDoc(storeRef);
      
      if (!snapshot.exists()) {
        // Criar nova loja
        await setDoc(storeRef, {
          storeId,
          name,
          slug: storeId,
          isActive: true,
          currency,
          taxId,
          taxPercentage,
          useThermalPrinter: false,
          attractTimeoutSeconds: 60,
          language: 'pt-BR',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        console.log('[StoreService] Store created during setup:', storeId);
      } else {
        console.log('[StoreService] Store already exists:', storeId);
      }
    } catch (error) {
      console.error('[StoreService] Error ensuring store exists:', error);
      // Não lançar erro para não bloquear o setup
    }
  }
}

export const storeService = new StoreService();
