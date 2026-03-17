import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Store } from '@/types/store';
import { storePath, storesPath } from '@/lib/pathResolver';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

// ============================================
// Store Service - Store management
// ============================================

class StoreService {
  private lastLoadSource: 'none' | 'firestore' | 'cache' = 'none';

  private getStoreAlias(data: Record<string, unknown>): string | null {
    if (typeof data.storeId === 'string' && data.storeId.trim()) {
      return data.storeId.trim();
    }

    return null;
  }

  private hasValidStoreData(data: Record<string, unknown> | undefined): boolean {
    if (!data || Object.keys(data).length === 0) {
      return false;
    }

    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const slug = typeof data.slug === 'string' ? data.slug.trim() : '';
    const storeAlias = this.getStoreAlias(data);

    return Boolean(name && (slug || storeAlias));
  }

  /**
   * Get current storeId from local storage
   */
  getCurrentStoreId(): string | null {
    return getCurrentStoreId();
  }

  private requireFranchiseId(): string {
    const franchiseId = getCurrentFranchiseId();
    if (!franchiseId) {
      throw new Error('[StoreService] franchiseId required for store operations');
    }
    return franchiseId;
  }

  private normalizeStoreData(data: Record<string, unknown>, snapshotId?: string): Store {
    const normalizeTimestamp = (value: unknown): Date | string | undefined => {
      if (!value) return undefined;
      if (value instanceof Date) return value;
      if (typeof value === 'string') return value;
      if ((value as { toDate?: () => Date }).toDate) {
        return (value as { toDate: () => Date }).toDate();
      }
      return undefined;
    };

    const normalizedStoreId = this.getStoreAlias(data) || snapshotId || '';
    const normalizedSlug =
      typeof data.slug === 'string' && data.slug.trim()
        ? data.slug.trim()
        : normalizedStoreId;

    // Runtime validation for required Store fields
    const requiredFields = ['name', 'slug', 'isActive', 'currency', 'taxPercentage'] as const;
    for (const field of requiredFields) {
      if (data[field] === undefined) {
        console.warn(`[StoreService] normalizeStoreData: missing required field '${field}'`);
      }
    }

    return {
      ...(data as unknown as Store),
      id: snapshotId || normalizedStoreId,
      storeId: normalizedStoreId,
      slug: normalizedSlug,
      name:
        typeof data.name === 'string' && data.name.trim()
          ? data.name.trim()
          : normalizedStoreId || 'Store',
      isActive: data.isActive !== false,
      taxId: typeof data.taxId === 'string' ? data.taxId : '',
      currency:
        typeof data.currency === 'string' && data.currency.trim()
          ? data.currency.trim()
          : 'BRL',
      taxPercentage:
        typeof data.taxPercentage === 'number' && Number.isFinite(data.taxPercentage)
          ? data.taxPercentage
          : 0,
      language: data.language === 'en' ? 'en' : 'pt-BR',
      createdAt: normalizeTimestamp((data as { createdAt?: unknown }).createdAt),
      updatedAt: normalizeTimestamp((data as { updatedAt?: unknown }).updatedAt),
    };
  }

  /**
   * Validate that store exists and has data
   */
  async validateStoreExists(storeId: string): Promise<boolean> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeDoc = doc(db, storePath(franchiseId, storeId));
      const snapshot = await getDoc(storeDoc);

      const data = snapshot.data() as Record<string, unknown> | undefined;
      const hasValidData = this.hasValidStoreData(data);

      return snapshot.exists() && !!hasValidData;
    } catch (error) {
      console.error('[StoreService] Error validating store:', error);
      return false;
    }
  }

  /**
   * Get full store data.
   * If the document is empty, try to recover from local storage.
   */
  async getStore(storeId: string): Promise<Store | null> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const path = storePath(franchiseId, storeId);
      console.log('[StoreService] Using path:', path);

      const storeDoc = doc(db, path);
      const snapshot = await getDoc(storeDoc);

      const data = snapshot.data() as Record<string, unknown> | undefined;
      const hasValidData = this.hasValidStoreData(data);

      if (!snapshot.exists() || !hasValidData) {
        console.warn(`[StoreService] Store ${storeId} not found or empty - attempting recovery`);

        const recovered = await this.recoverStoreFromLocalStorage(storeId);
        if (recovered) {
          this.lastLoadSource = 'cache';
          return recovered;
        }

        console.warn(`[StoreService] Could not recover store ${storeId}`);
        this.lastLoadSource = 'none';
        return null;
      }

      this.lastLoadSource = 'firestore';
      return this.normalizeStoreData(data as Record<string, unknown>, snapshot.id);
    } catch (error: any) {
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        console.warn('[StoreService] Permission denied, trying cache fallback');
        const recovered = await this.recoverStoreFromLocalStorage(storeId);
        this.lastLoadSource = recovered ? 'cache' : 'none';
        return recovered;
      }
      console.error('[StoreService] Error fetching store:', error);
      this.lastLoadSource = 'none';
      throw error;
    }
  }

  /**
   * Recover store data from local storage without mutating the canonical Firestore document.
   */
  private async recoverStoreFromLocalStorage(storeId: string): Promise<Store | null> {
    try {
      const recovered = this.getCachedStore(storeId);
      if (!recovered) {
        console.log('[StoreService] No localStorage settings available for recovery');
        return null;
      }

      console.warn('[StoreService] Using local cache fallback without writing back to Firestore');
      return recovered;
    } catch (recoveryError) {
      console.error('[StoreService] Recovery failed:', recoveryError);
      return null;
    }
  }

  getCachedStore(storeId: string): Store | null {
    const localSettings = localStorage.getItem('storeSettings');
    if (!localSettings) {
      return null;
    }

    const parsed = JSON.parse(localSettings) as Record<string, unknown>;
    if (parsed.storeId !== storeId) {
      console.log(`[StoreService] localStorage storeId (${parsed.storeId}) does not match requested (${storeId})`);
      return null;
    }

    if (!parsed.name) {
      console.log('[StoreService] localStorage missing required field: name');
      return null;
    }

    return this.normalizeStoreData({
      ...parsed,
      storeId,
      slug: typeof parsed.slug === 'string' && parsed.slug.trim() ? parsed.slug : storeId,
      isActive: parsed.isActive !== false,
      currency: typeof parsed.currency === 'string' && parsed.currency.trim() ? parsed.currency : 'BRL',
      taxId: typeof parsed.taxId === 'string' ? parsed.taxId : '',
      taxPercentage:
        typeof parsed.taxPercentage === 'number' && Number.isFinite(parsed.taxPercentage)
          ? parsed.taxPercentage
          : 0,
      language: parsed.language === 'en' ? 'en' : 'pt-BR',
    }, storeId);
  }

  getLastLoadSource(): 'none' | 'firestore' | 'cache' {
    return this.lastLoadSource;
  }

  /**
   * Create a new store document.
   */
  async createStore(store: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeRef = doc(db, storePath(franchiseId, store.storeId));
      const canonicalStore = sanitizeFirestoreData({
        ...store,
        franchiseId,
        storeId: store.storeId,
        slug: store.slug || store.storeId,
        isActive: store.isActive ?? true,
        currency: store.currency || 'BRL',
        taxPercentage:
          typeof store.taxPercentage === 'number' && Number.isFinite(store.taxPercentage)
            ? store.taxPercentage
            : 0,
        language: store.language || 'pt-BR',
        attractTimeoutSeconds: store.attractTimeoutSeconds ?? 60,
        timezone:
          typeof (store as { timezone?: unknown }).timezone === 'string' &&
          (store as { timezone?: string }).timezone
            ? (store as { timezone?: string }).timezone
          : 'America/Sao_Paulo',
        }) as Record<string, unknown>;

      const exists = await getDoc(storeRef);
      if (exists.exists()) {
        console.log(`[StoreService] Store ${store.storeId} already exists, updating...`);
        await updateDoc(storeRef, {
          ...canonicalStore,
          updatedAt: serverTimestamp(),
        });
        return store.storeId;
      }

      // [FIX Bug-6] Atomic writeBatch — store + settings em uma única operação
      const batch = writeBatch(db);
      batch.set(storeRef, {
        ...canonicalStore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // v4.1.5: usar 'config' (alinhado com Listener 2 em useStoreSettings.tsx)
      const settingsRef = doc(db, storePath(franchiseId, store.storeId), 'settings', 'config');
      batch.set(settingsRef, {
        currency: canonicalStore.currency,
        language: canonicalStore.language || 'pt-BR',
        createdAt: serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      console.log('[StoreService] Store created:', store.storeId);
      return store.storeId;
    } catch (error) {
      console.error('[StoreService] Error creating store:', error);
      throw error;
    }
  }

  /**
   * Update store data.
   */
  async updateStore(storeId: string, updates: Partial<Store>): Promise<void> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeRef = doc(db, storePath(franchiseId, storeId));

      const sanitizedUpdates = sanitizeFirestoreData(updates) as typeof updates;
      await updateDoc(storeRef, {
        ...sanitizedUpdates,
        updatedAt: serverTimestamp(),
      });

      console.log('[StoreService] Store updated:', storeId);
    } catch (error) {
      console.error('[StoreService] Error updating store:', error);
      throw error;
    }
  }

  /**
   * List all stores for the current franchise.
   */
  async getAllStores(): Promise<Store[]> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storesCollection = collection(db, storesPath(franchiseId));
      const snapshot = await getDocs(storesCollection);

      return snapshot.docs.map((storeDoc) => {
        return this.normalizeStoreData(storeDoc.data() as Record<string, unknown>, storeDoc.id);
      }) as Store[];
    } catch (error) {
      console.error('[StoreService] Error fetching stores:', error);
      throw error;
    }
  }

  /**
   * List only active stores.
   */
  async getActiveStores(): Promise<Store[]> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storesCollection = collection(db, storesPath(franchiseId));
      const q = query(storesCollection, where('isActive', '==', true));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((storeDoc) => {
        return this.normalizeStoreData(storeDoc.data() as Record<string, unknown>, storeDoc.id);
      }) as Store[];
    } catch (error) {
      console.error('[StoreService] Error fetching active stores:', error);
      throw error;
    }
  }

  /**
   * Create or populate store document from local settings.
   */
  async ensureStoreExists(storeId: string, name: string, currency: string, taxId: string, taxPercentage: number): Promise<void> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const path = storePath(franchiseId, storeId);
      console.log('[StoreService] ensureStoreExists using path:', path);

      const storeRef = doc(db, path);
      const snapshot = await getDoc(storeRef);

      const data = snapshot.data() as Record<string, unknown> | undefined;
      const hasValidData = this.hasValidStoreData(data);

      if (!snapshot.exists() || !hasValidData) {
        console.log(`[StoreService] Creating/populating store document: ${storeId}`);

        await setDoc(
          storeRef,
          {
            storeId,
            franchiseId,
            name,
            slug: storeId,
            isActive: true,
            currency,
            taxId,
            taxPercentage,
            attractTimeoutSeconds: 60,
            language: 'pt-BR',
            timezone: 'America/Sao_Paulo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        console.log('[StoreService] Store document created/populated:', storeId);
      } else {
        console.log('[StoreService] Store already exists with valid data:', storeId);
      }
    } catch (error) {
      console.error('[StoreService] Error ensuring store exists:', error);
      throw error;
    }
  }
}

export const storeService = new StoreService();
