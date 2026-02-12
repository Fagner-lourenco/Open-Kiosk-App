/**
 * ============================================
 * Sync Service - Background Synchronization
 * ============================================
 * 
 * Gerencia sincronização em background entre cache local e Firebase.
 * Implementa fila de operações offline com retry automático.
 * 
 * Princípios:
 * - Nunca bloqueia a UI
 * - Operações são enfileiradas quando offline
 * - Retry exponencial em caso de falha
 * - Resolução de conflitos por timestamp
 */

import {
  cacheSet,
  cacheGet,
  cacheGetAll,
  cacheDelete,
  cacheBatchSet,
  STORES,
  SyncQueueItem
} from './cacheService';
import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId } from './firebase';
import { storeSubPath, StoreSubcollection } from '@/lib/pathResolver';
import { doc, setDoc, deleteDoc, getDoc, updateDoc, serverTimestamp, increment, runTransaction } from 'firebase/firestore';

// Configurações de sync
const SYNC_CONFIG = {
  MAX_RETRY_COUNT: 5,
  BASE_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 60000,
  BATCH_SIZE: 10,
  SYNC_INTERVAL_MS: 30000, // 30 segundos
};

// Estado do sync
let syncInProgress = false;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const syncListeners: Array<(status: SyncStatus) => void> = [];

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

let syncStatus: SyncStatus = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
};

/**
 * Gera ID único para item da fila
 */
const generateSyncId = (): string => {
  return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Notifica listeners sobre mudança de status
 */
const notifyListeners = () => {
  syncListeners.forEach((listener) => {
    try {
      listener({ ...syncStatus });
    } catch (error) {
      console.error('[SyncService] Error in listener:', error);
    }
  });
};

/**
 * Atualiza status e notifica listeners
 */
const updateStatus = (partial: Partial<SyncStatus>) => {
  syncStatus = { ...syncStatus, ...partial };
  notifyListeners();
};

/**
 * Adiciona operação à fila de sync
 */
export const enqueueSync = async (
  operation: 'create' | 'update' | 'delete',
  collection: string,
  docId: string,
  data?: unknown
): Promise<void> => {
  const storeId = getCurrentStoreId();
  const franchiseId = getCurrentFranchiseId();

  const item: SyncQueueItem = {
    id: generateSyncId(),
    operation,
    collection,
    docId,
    data,
    createdAt: Date.now(),
    retryCount: 0,
    storeId: storeId || '',
    franchiseId: franchiseId || undefined,
  };

  await cacheSet(STORES.SYNC_QUEUE, item);

  // Atualiza contador
  const queue = await cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);
  updateStatus({ pendingCount: queue.length });

  console.log(`[SyncService] Enqueued ${operation} for ${collection}/${docId}`);

  // Tenta sincronizar imediatamente se online
  if (isOnline && !syncInProgress) {
    processQueue();
  }
};

/**
 * Helper para reconstruir tipos do Firestore (Timestamp, FieldValue)
 * que foram serializados para JSON no IndexedDB
 */
const reconstructFirestoreTypes = (data: unknown): unknown => {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  // Check for arrays
  if (Array.isArray(data)) {
    return data.map(item => reconstructFirestoreTypes(item));
  }

  // Check for serialized markers
  const obj = data as Record<string, any>;
  if (obj._type === 'serverTimestamp') {
    return serverTimestamp();
  }
  if (obj._type === 'increment' && typeof obj.value === 'number') {
    return increment(obj.value);
  }

  // Recursive for objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = reconstructFirestoreTypes(value);
  }
  return result;
};

/**
 * Processa um item da fila
 */
const processSyncItem = async (item: SyncQueueItem): Promise<boolean> => {
  try {
    const db = getFirebaseDb();
    const storeId = item.storeId || getCurrentStoreId();
    const franchiseId = item.franchiseId || getCurrentFranchiseId();

    let docRef;
    if (storeId) {
      if (!franchiseId) {
        throw new Error('[SyncService] franchiseId obrigatorio para sincronizacao de loja');
      }
      const collectionPath = storeSubPath(franchiseId, storeId, item.collection as StoreSubcollection);
      docRef = doc(db, `${collectionPath}/${item.docId}`);
    } else {
      docRef = doc(db, item.collection, item.docId);
    }

    // Colecoes imutaveis: servingSessions e wastageEvents — deny update nas rules
    const IMMUTABLE_COLLECTIONS = ['servingSessions', 'wastageEvents'];
    const isImmutable = IMMUTABLE_COLLECTIONS.includes(item.collection);

    switch (item.operation) {
      case 'create': {
        const payload = reconstructFirestoreTypes(item.data);

        if (isImmutable) {
          // Colecoes imutaveis: usa transaction para create-if-absent atomico.
          // Se doc ja existe → sucesso (idempotencia limpa, sem PERMISSION_DENIED).
          // Nao injeta _lastSyncId/_syncedAt para nao poluir eventos imutaveis.
          await runTransaction(db, async (txn) => {
            const snap = await txn.get(docRef);
            if (snap.exists()) {
              console.log(`[SyncService] Immutable doc already exists for ${item.docId}, skipping (idempotent)`);
              return; // transaction succeeds, doc untouched
            }
            txn.set(docRef, payload as object);
          });
        } else {
          // Colecoes mutaveis (orders, etc.): create-if-absent.
          // Se doc ja existe (retry ou race), NAO sobrescrever payload —
          // apenas marca sync metadata para dedup de retries futuros.
          const existingSnap = await getDoc(docRef);
          if (existingSnap.exists()) {
            const existingData = existingSnap.data() as { _lastSyncId?: string };
            if (existingData?._lastSyncId === item.id) {
              console.log(`[SyncService] Skipping already synced create ${item.docId}`);
              return true;
            }
            // Doc existe com outro syncId (ou sem syncId): outro processo criou.
            // Atualiza apenas metadata de sync, nao toca no payload do pedido.
            await updateDoc(docRef, {
              _syncedAt: serverTimestamp(),
              _lastSyncId: item.id,
            });
            console.log(`[SyncService] Doc ${item.docId} already exists, stamped sync metadata only`);
            return true;
          }
          await setDoc(docRef, {
            ...(payload as object),
            _syncedAt: serverTimestamp(),
            _lastSyncId: item.id,
          });
        }
        break;
      }

      case 'update': {
        // Idempotencia: evita reaplicar a mesma operacao se ja foi sincronizada
        const existingSnap = await getDoc(docRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as { _lastSyncId?: string };
          if (existingData?._lastSyncId === item.id) {
            console.log(`[SyncService] Skipping already synced item ${item.id}`);
            return true;
          }
        }

        // Reconstruir tipos especiais antes de enviar
        const payload = reconstructFirestoreTypes(item.data);
        await setDoc(docRef, {
          ...(payload as object),
          _syncedAt: serverTimestamp(),
          _lastSyncId: item.id,
        }, { merge: true });
        break;
      }

      case 'delete':
        await deleteDoc(docRef);
        break;
    }

    console.log(`[SyncService] Successfully synced ${item.operation} for ${item.collection}/${item.docId}`);
    return true;
  } catch (error) {
    console.error(`[SyncService] Failed to sync item:`, error);
    return false;
  }
};

/**
 * Processa a fila de sync
 */
export const processQueue = async (): Promise<void> => {
  if (syncInProgress || !isOnline) {
    return;
  }

  syncInProgress = true;
  updateStatus({ isSyncing: true });

  try {
    const queue = await cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);

    if (queue.length === 0) {
      updateStatus({
        isSyncing: false,
        pendingCount: 0,
        lastSyncAt: Date.now(),
      });
      syncInProgress = false;
      return;
    }

    // Ordena por data de criação
    queue.sort((a, b) => a.createdAt - b.createdAt);

    // Processa em batches
    const toProcess = queue.slice(0, SYNC_CONFIG.BATCH_SIZE);
    const toRetry: SyncQueueItem[] = [];
    const toRemove: string[] = [];

    for (const item of toProcess) {
      const success = await processSyncItem(item);

      if (success) {
        toRemove.push(item.id);
      } else {
        item.retryCount++;

        if (item.retryCount >= SYNC_CONFIG.MAX_RETRY_COUNT) {
          // KIO-11 fix: move to Dead Letter Queue instead of discarding
          console.warn(`[SyncService] Max retries reached for ${item.id}, moving to DLQ`);
          const dlqItem = {
            ...item,
            failedAt: Date.now(),
            lastError: `Max retries (${SYNC_CONFIG.MAX_RETRY_COUNT}) exceeded`,
          };
          await cacheSet(STORES.SYNC_DLQ, dlqItem);
          toRemove.push(item.id);
        } else {
          toRetry.push(item);
        }
      }
    }

    // Remove itens processados
    for (const id of toRemove) {
      await cacheDelete(STORES.SYNC_QUEUE, id);
    }

    // Atualiza itens para retry
    if (toRetry.length > 0) {
      await cacheBatchSet(STORES.SYNC_QUEUE, toRetry);
    }

    // Atualiza status
    const remainingQueue = await cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    updateStatus({
      pendingCount: remainingQueue.length,
      lastSyncAt: Date.now(),
      lastError: null,
    });

    // Se ainda há itens e estamos online, continua processando
    if (remainingQueue.length > 0 && isOnline) {
      // Delay antes de continuar (exponential backoff para retries)
      const hasRetries = toRetry.length > 0;
      const delay = hasRetries
        ? Math.min(
          SYNC_CONFIG.BASE_RETRY_DELAY_MS * Math.pow(2, toRetry[0]?.retryCount || 0),
          SYNC_CONFIG.MAX_RETRY_DELAY_MS
        )
        : 100;

      setTimeout(() => {
        syncInProgress = false;
        processQueue();
      }, delay);
      return;
    }
  } catch (error) {
    console.error('[SyncService] Error processing queue:', error);
    updateStatus({
      lastError: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // SEMPRE resetar syncInProgress, mesmo em caso de erro
    // Evita travamento permanente da sincronização
    syncInProgress = false;
    updateStatus({ isSyncing: false });
  }
};

/**
 * Inicia sync periódico em background
 */
export const startBackgroundSync = (): void => {
  if (syncIntervalId) {
    return;
  }

  console.log('[SyncService] Starting background sync');

  syncIntervalId = setInterval(() => {
    if (isOnline && !syncInProgress) {
      processQueue();
    }
  }, SYNC_CONFIG.SYNC_INTERVAL_MS);

  // Processa imediatamente
  if (isOnline) {
    processQueue();
  }
};

/**
 * Para sync periódico
 */
export const stopBackgroundSync = (): void => {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('[SyncService] Stopped background sync');
  }
};

/**
 * Handlers de eventos online/offline
 */
const handleOnline = () => {
  console.log('[SyncService] Network online');
  isOnline = true;
  updateStatus({ isOnline: true });
  processQueue();
};

const handleOffline = () => {
  console.log('[SyncService] Network offline');
  isOnline = false;
  updateStatus({ isOnline: false });
};

// Flag para evitar múltiplas inicializações
let networkListenersInitialized = false;

/**
 * Inicializa listeners de rede (singleton - só executa uma vez)
 */
export const initNetworkListeners = (): void => {
  if (networkListenersInitialized) {
    return; // Já inicializado, não duplicar listeners
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    isOnline = navigator.onLine;
    updateStatus({ isOnline });
    networkListenersInitialized = true;
    console.log('[SyncService] Network listeners initialized, online:', isOnline);
  }
};

/**
 * Remove listeners de rede
 */
export const cleanupNetworkListeners = (): void => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    networkListenersInitialized = false;
  }
};

/**
 * Registra listener de status
 */
export const addSyncListener = (listener: (status: SyncStatus) => void): () => void => {
  syncListeners.push(listener);
  // Notifica imediatamente com status atual
  listener({ ...syncStatus });

  return () => {
    const index = syncListeners.indexOf(listener);
    if (index > -1) {
      syncListeners.splice(index, 1);
    }
  };
};

/**
 * Obtém status atual
 */
export const getSyncStatus = (): SyncStatus => ({ ...syncStatus });

/**
 * Força sincronização manual
 */
export const forceSync = async (): Promise<void> => {
  if (!isOnline) {
    console.warn('[SyncService] Cannot force sync while offline');
    return;
  }

  await processQueue();
};

/**
 * Limpa toda a fila de sync (use com cuidado!)
 */
export const clearSyncQueue = async (): Promise<void> => {
  const queue = await cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);
  for (const item of queue) {
    await cacheDelete(STORES.SYNC_QUEUE, item.id);
  }
  updateStatus({ pendingCount: 0 });
  console.log('[SyncService] Sync queue cleared');
};

/**
 * Sincroniza um documento específico do Firebase para cache local
 */
export const syncFromFirebase = async (
  collection: string,
  docId: string
): Promise<unknown | null> => {
  if (!isOnline) {
    console.warn('[SyncService] Cannot sync from Firebase while offline');
    return null;
  }

  try {
    const storeId = getCurrentStoreId();

    const franchiseId = getCurrentFranchiseId();
    if (!storeId || !franchiseId) {
      console.warn('[SyncService] Missing storeId/franchiseId for syncFromFirebase');
      return null;
    }
    const collectionPath = storeSubPath(franchiseId, storeId, collection as StoreSubcollection);
    const docRef = doc(getFirebaseDb(), `${collectionPath}/${docId}`);

    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      const data = snapshot.data() as Record<string, unknown>;
      return { id: snapshot.id, ...data };
    }

    return null;
  } catch (error) {
    console.error(`[SyncService] Error syncing from Firebase:`, error);
    return null;
  }
};

export default {
  enqueue: enqueueSync,
  process: processQueue,
  force: forceSync,
  start: startBackgroundSync,
  stop: stopBackgroundSync,
  addListener: addSyncListener,
  getStatus: getSyncStatus,
  clearQueue: clearSyncQueue,
  syncFromFirebase,
  initNetworkListeners,
  cleanupNetworkListeners,
};
