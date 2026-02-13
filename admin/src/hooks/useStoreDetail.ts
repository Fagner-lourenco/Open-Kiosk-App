/**
 * ============================================================================
 * useStoreDetail — Hook para carregar dados de uma loja
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';

export interface StoreData {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  operators?: Array<{
    id: string;
    email: string;
    role: string;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export function useStoreDetail(storeId: string | undefined) {
  const { currentFranchise } = useFranchise();
  const [store, setStore] = useState<StoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const franchiseId = currentFranchise?.id;

  const loadStore = useCallback(async () => {
    if (!franchiseId || !storeId) return;
    setIsLoading(true);
    setError(null);

    try {
      const storeDoc = await getDoc(
        doc(db, `franchises/${franchiseId}/stores/${storeId}`),
      );

      if (!storeDoc.exists()) {
        setError('Loja não encontrada');
        setIsLoading(false);
        return;
      }

      const data = storeDoc.data();
      setStore({
        id: storeDoc.id,
        name: data.name,
        address: data.address,
        phone: data.phone,
        email: data.email,
        isActive: data.isActive !== false,
        settings: data.settings,
        operators: data.operators || data.members || [],
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      });
    } catch (err) {
      console.error('Error loading store:', err);
      setError('Erro ao carregar loja');
    }

    setIsLoading(false);
  }, [franchiseId, storeId]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  return { store, isLoading, error, franchiseId, refreshStore: loadStore };
}
