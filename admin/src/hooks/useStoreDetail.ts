/**
 * ============================================================================
 * useStoreDetail — Hook para carregar dados de uma loja (React Query)
 * ============================================================================
 */

import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
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
  const franchiseId = currentFranchise?.id;

  const { data: store = null, isLoading, error, refetch } = useQuery({
    queryKey: ['store-detail', franchiseId, storeId],
    queryFn: async (): Promise<StoreData | null> => {
      if (!franchiseId || !storeId) return null;

      const storeDoc = await getDoc(
        doc(db, `franchises/${franchiseId}/stores/${storeId}`),
      );

      if (!storeDoc.exists()) {
        throw new Error('Loja não encontrada');
      }

      const data = storeDoc.data();
      return {
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
      };
    },
    enabled: !!franchiseId && !!storeId,
    staleTime: 2 * 60 * 1000, // 2 min cache
    retry: 1,
  });

  return {
    store,
    isLoading,
    error: error ? (error as Error).message : null,
    franchiseId,
    refreshStore: refetch,
  };
}
