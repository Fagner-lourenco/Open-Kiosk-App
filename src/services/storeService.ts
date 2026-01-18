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
   * Validar que storeId existe no Firestore E tem dados válidos
   */
  async validateStoreExists(storeId: string): Promise<boolean> {
    try {
      const db = getFirebaseDb();
      const storeDoc = doc(db, 'stores', storeId);
      const snapshot = await getDoc(storeDoc);
      
      // Verificar se existe E tem dados válidos (não é placeholder vazio)
      const data = snapshot.data();
      const hasValidData = data && Object.keys(data).length > 0 && data.storeId;
      
      return snapshot.exists() && !!hasValidData;
    } catch (error) {
      console.error('[StoreService] Error validating store:', error);
      return false;
    }
  }
  
  /**
   * Obter dados completos de uma loja
   * NOTA: Detecta documentos vazios (placeholder) e tenta recuperar automaticamente
   */
  async getStore(storeId: string): Promise<Store | null> {
    try {
      const db = getFirebaseDb();
      const storeDoc = doc(db, 'stores', storeId);
      const snapshot = await getDoc(storeDoc);
      
      const data = snapshot.data();
      const hasValidData = data && Object.keys(data).length > 0 && data.storeId;
      
      // Documento não existe OU está vazio (placeholder de subcoleção)
      if (!snapshot.exists() || !hasValidData) {
        console.warn(`[StoreService] Store ${storeId} not found or empty - attempting auto-recovery`);
        
        // Tentar recuperar dados do localStorage para popular o documento
        const recovered = await this.recoverStoreFromLocalStorage(storeId);
        if (recovered) {
          return recovered;
        }
        
        console.warn(`[StoreService] Could not recover store ${storeId}`);
        return null;
      }
      
      return { id: snapshot.id, ...data } as Store;
    } catch (error) {
      console.error('[StoreService] Error fetching store:', error);
      throw error;
    }
  }
  
  /**
   * Recuperar dados da loja a partir do localStorage
   * Usado quando o documento Firestore está vazio ou corrompido
   */
  private async recoverStoreFromLocalStorage(storeId: string): Promise<Store | null> {
    try {
      const localSettings = localStorage.getItem('storeSettings');
      if (!localSettings) {
        console.log('[StoreService] No localStorage settings available for recovery');
        return null;
      }
      
      const parsed = JSON.parse(localSettings);
      if (parsed.storeId !== storeId) {
        console.log(`[StoreService] localStorage storeId (${parsed.storeId}) does not match requested (${storeId})`);
        return null;
      }
      
      if (!parsed.name) {
        console.log('[StoreService] localStorage missing required field: name');
        return null;
      }
      
      console.log('[StoreService] 🔧 Recovering store from localStorage...');
      
      // Popular o documento no Firestore
      await this.ensureStoreExists(
        storeId,
        parsed.name,
        parsed.currency || 'BRL',
        parsed.taxId || '',
        parsed.taxPercentage || 0
      );
      
      // Buscar novamente após criar
      const db = getFirebaseDb();
      const storeDoc = doc(db, 'stores', storeId);
      const newSnapshot = await getDoc(storeDoc);
      
      if (newSnapshot.exists() && newSnapshot.data()?.storeId) {
        console.log('[StoreService] ✅ Store recovered successfully from localStorage');
        return { id: newSnapshot.id, ...newSnapshot.data() } as Store;
      }
      
      return null;
    } catch (recoveryError) {
      console.error('[StoreService] Recovery failed:', recoveryError);
      return null;
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
   * CORRIGIDO: Detecta documentos vazios (placeholder) e popula corretamente
   */
  async ensureStoreExists(storeId: string, name: string, currency: string, taxId: string, taxPercentage: number): Promise<void> {
    try {
      const db = getFirebaseDb();
      const storeRef = doc(db, 'stores', storeId);
      const snapshot = await getDoc(storeRef);
      
      const data = snapshot.data();
      const hasValidData = data && Object.keys(data).length > 0 && data.storeId;
      
      // Criar se não existe OU se é um placeholder vazio (sem campos)
      if (!snapshot.exists() || !hasValidData) {
        console.log(`[StoreService] Creating/populating store document: ${storeId}`);
        
        // Usar setDoc com merge:true para não sobrescrever subcoleções existentes
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
        }, { merge: true });
        
        console.log('[StoreService] ✅ Store document created/populated:', storeId);
      } else {
        console.log('[StoreService] Store already exists with valid data:', storeId);
      }
    } catch (error) {
      console.error('[StoreService] Error ensuring store exists:', error);
      // IMPORTANTE: Propagar erro para que o chamador saiba que falhou
      throw error;
    }
  }
}

export const storeService = new StoreService();
