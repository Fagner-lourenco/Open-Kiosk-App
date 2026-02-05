/**
 * ============================================================================
 * Store Service - Serviços para gerenciamento de lojas
 * ============================================================================
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { storesPath, storePath } from '@/lib/pathResolver';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

export interface Store {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  franchiseId: string;
  settings?: Record<string, any>;
  operators?: StoreMember[];
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface StoreMember {
  id: string;
  email: string;
  role: string;
  addedAt: string;
}

export interface CreateStoreData {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

export interface UpdateStoreData {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
  settings?: Record<string, any>;
}

/**
 * Get all stores for a franchise
 */
export async function getStores(franchiseId: string): Promise<Store[]> {
  const snapshot = await getDocs(
    query(
      collection(db, storesPath(franchiseId)),
      orderBy('name')
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
    updatedAt: doc.data().updatedAt?.toDate(),
  })) as Store[];
}

/**
 * Get a single store by ID
 */
export async function getStore(franchiseId: string, storeId: string): Promise<Store | null> {
  const docRef = doc(db, storePath(franchiseId, storeId));
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate(),
    updatedAt: docSnap.data().updatedAt?.toDate(),
  } as Store;
}

/**
 * Create a new store
 */
export async function createStore(
  franchiseId: string,
  data: CreateStoreData,
  userId: string
): Promise<string> {
  const storeData = {
    ...data,
    franchiseId,
    isActive: data.isActive ?? true,
    operators: [],
    settings: {},
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(
    collection(db, storesPath(franchiseId)),
    storeData
  );

  return docRef.id;
}

/**
 * Update a store
 */
export async function updateStore(
  franchiseId: string,
  storeId: string,
  data: UpdateStoreData
): Promise<void> {
  const docRef = doc(db, storePath(franchiseId, storeId));

  const sanitizedData = sanitizeFirestoreData(data) as typeof data;
  await updateDoc(docRef, {
    ...sanitizedData,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a store
 */
export async function deleteStore(franchiseId: string, storeId: string): Promise<void> {
  const docRef = doc(db, storePath(franchiseId, storeId));
  await deleteDoc(docRef);
}

/**
 * Add a member to a store
 */
export async function addStoreMember(
  franchiseId: string,
  storeId: string,
  member: Omit<StoreMember, 'addedAt'>
): Promise<void> {
  const store = await getStore(franchiseId, storeId);
  if (!store) throw new Error('Store not found');

  const operators = store.operators || [];
  const existingMember = operators.find((m) => m.id === member.id);

  if (existingMember) {
    throw new Error('Member already exists in store');
  }

  operators.push({
    ...member,
    addedAt: new Date().toISOString(),
  });

  await updateStore(franchiseId, storeId, { operators } as any);
}

/**
 * Remove a member from a store
 */
export async function removeStoreMember(
  franchiseId: string,
  storeId: string,
  memberId: string
): Promise<void> {
  const store = await getStore(franchiseId, storeId);
  if (!store) throw new Error('Store not found');

  const operators = (store.operators || []).filter((m) => m.id !== memberId);
  await updateStore(franchiseId, storeId, { operators } as any);
}

/**
 * Update store settings
 */
export async function updateStoreSettings(
  franchiseId: string,
  storeId: string,
  settings: Record<string, any>
): Promise<void> {
  await updateStore(franchiseId, storeId, { settings });
}

/**
 * Toggle store active status
 */
export async function toggleStoreStatus(
  franchiseId: string,
  storeId: string,
  isActive: boolean
): Promise<void> {
  await updateStore(franchiseId, storeId, { isActive });
}
