import { doc, getDoc, onSnapshot, DocumentData } from 'firebase/firestore';
import { getFirebaseDb, getCurrentFranchiseId } from '@/services/firebase';

/**
 * Obtém os dados principais da loja (dados visíveis no Admin Web)
 */
export async function getStoreSettings(storeId: string): Promise<DocumentData | null> {
  try {
    const db = getFirebaseDb();
    const franchiseId = getCurrentFranchiseId();
    if (!franchiseId) {
      throw new Error('[storeSettingsService] franchiseId obrigatório');
    }
    const storeDocRef = doc(db, 'franchises', franchiseId, 'stores', storeId);

    const snap = await getDoc(storeDocRef);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (error) {
    console.error('[storeSettingsService] getStoreSettings error:', error);
    throw error;
  }
}

/**
 * Subscrição em tempo real para dados da loja. Retorna a função de unsubscribe.
 */
export function subscribeStoreSettings(
  storeId: string,
  onUpdate: (data: DocumentData | null) => void,
  onError?: (err: any) => void
): () => void {
  const db = getFirebaseDb();
  const franchiseId = getCurrentFranchiseId();
  if (!franchiseId) {
    throw new Error('[storeSettingsService] franchiseId obrigatório');
  }
  const storeDocRef = doc(db, 'franchises', franchiseId, 'stores', storeId);

  const unsubscribe = onSnapshot(storeDocRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate(snapshot.data());
    } else {
      onUpdate(null);
    }
  }, (error) => {
    console.error('[storeSettingsService] subscribeStoreSettings error:', error);
    if (onError) onError(error);
  });

  return unsubscribe;
}

export default {
  getStoreSettings,
  subscribeStoreSettings,
};
