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
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { storesPath, storePath } from '@/lib/pathResolver';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

/** 🔒 FIX BUG-33: Helper to count existing stores and enforce maxStores */
const franchisePath = (franchiseId: string) => `franchises/${franchiseId}`;
const DEFAULT_STORE_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_STORE_CURRENCY = 'BRL';
const DEFAULT_STORE_LANGUAGE = 'pt-BR';
const DEFAULT_ATTRACT_TIMEOUT_SECONDS = 60;

function generateStoreSlug(name: string, fallbackId: string): string {
  const baseSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return baseSlug || fallbackId;
}

export interface Store {
  id: string;
  name: string;
  address?: string | Record<string, unknown>;
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
  address?: string | Record<string, unknown>;
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
 * 🔒 FIX BUG-33: Validates maxStores limit before creation
 */
export async function createStore(
  franchiseId: string,
  data: CreateStoreData,
  userId: string
): Promise<string> {
  // Enforce maxStores limit
  const franchiseDoc = await getDoc(doc(db, franchisePath(franchiseId)));
  if (!franchiseDoc.exists()) {
    throw new Error('Franquia não encontrada');
  }
  const franchise = franchiseDoc.data();
  const maxStores = franchise.maxStores ?? 1;
  if (maxStores !== -1) { // -1 = unlimited
    const existingStores = await getDocs(collection(db, storesPath(franchiseId)));
    if (existingStores.size >= maxStores) {
      throw new Error(`Limite de lojas atingido (${maxStores}). Faça upgrade do plano para criar mais lojas.`);
    }
  }

  const storesRef = collection(db, storesPath(franchiseId));
  const storeRef = doc(storesRef);
  const normalizedName = data.name.trim();
  const normalizedPhone = data.phone?.trim() || undefined;
  const normalizedEmail = data.email?.trim() || undefined;
  const normalizedAddress = data.address?.trim() || undefined;
  const storeData = {
    storeId: storeRef.id,
    franchiseId,
    slug: generateStoreSlug(normalizedName, storeRef.id),
    name: normalizedName,
    address: normalizedAddress,
    phone: normalizedPhone,
    email: normalizedEmail,
    timezone: DEFAULT_STORE_TIMEZONE,
    currency: DEFAULT_STORE_CURRENCY,
    language: DEFAULT_STORE_LANGUAGE,
    taxPercentage: 0,
    attractTimeoutSeconds: DEFAULT_ATTRACT_TIMEOUT_SECONDS,
    isActive: data.isActive ?? true,
    operators: [],
    settings: {},
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(storeRef, sanitizeFirestoreData(storeData));

  return storeRef.id;
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
 * Delete a store with cascade delete of all subcollections
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
  const docRef = doc(db, storePath(franchiseId, storeId));

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(docRef);
    if (!snap.exists()) throw new Error('Store not found');

    const store = { id: snap.id, ...snap.data() } as Store;
    const operators = store.operators || [];
    const existingMember = operators.find((m) => m.id === member.id);

    if (existingMember) {
      throw new Error('Member already exists in store');
    }

    operators.push({
      ...member,
      addedAt: new Date().toISOString(),
    });

    txn.update(docRef, { operators, updatedAt: serverTimestamp() });
  });
}

/**
 * Remove a member from a store
 */
export async function removeStoreMember(
  franchiseId: string,
  storeId: string,
  memberId: string
): Promise<void> {
  const docRef = doc(db, storePath(franchiseId, storeId));

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(docRef);
    if (!snap.exists()) throw new Error('Store not found');

    const store = { id: snap.id, ...snap.data() } as Store;
    const operators = (store.operators || []).filter((m) => m.id !== memberId);
    txn.update(docRef, { operators, updatedAt: serverTimestamp() });
  });
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
