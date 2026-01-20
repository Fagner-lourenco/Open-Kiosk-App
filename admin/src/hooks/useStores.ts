/**
 * ============================================================================
 * useStores Hook
 * ============================================================================
 * 
 * Hook para gerenciamento de lojas com cache e operações CRUD.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  getStores, 
  createStore as createStoreService, 
  updateStore as updateStoreService, 
  deleteStore as deleteStoreService,
  CreateStoreData,
  UpdateStoreData,
  Store
} from '@/services/storeService';
import { useFranchise } from '@/context/FranchiseContext';
import { useToast } from './useToast';
import { useAuth } from '@/context/AuthContext';

interface UseStoresReturn {
  /** Lista de lojas */
  stores: Store[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Criar nova loja */
  createStore: (data: CreateStoreData) => Promise<string>;
  /** Atualizar loja */
  updateStore: (storeId: string, data: UpdateStoreData) => Promise<void>;
  /** Excluir loja */
  deleteStore: (storeId: string) => Promise<void>;
  /** Recarregar lojas */
  refetch: () => void;
  /** Estado de criação */
  isCreating: boolean;
  /** Estado de atualização */
  isUpdating: boolean;
  /** Estado de exclusão */
  isDeleting: boolean;
}

export function useStores(): UseStoresReturn {
  const { currentFranchise, refreshStores } = useFranchise();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Query para listar lojas
  const { 
    data: stores = [], 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['stores', currentFranchise?.id],
    queryFn: () => {
      if (!currentFranchise?.id) return [];
      return getStores(currentFranchise.id);
    },
    enabled: !!currentFranchise?.id,
  });
  
  // Criar loja
  const createStore = useCallback(async (data: CreateStoreData): Promise<string> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    if (!user?.uid) {
      throw new Error('Usuário não autenticado');
    }
    
    setIsCreating(true);
    try {
      const storeId = await createStoreService(currentFranchise.id, data, user.uid);
      
      // Invalidar cache e atualizar contexto
      queryClient.invalidateQueries({ queryKey: ['stores', currentFranchise.id] });
      await refreshStores();
      
      success(`${data.name} foi criada com sucesso`);
      
      return storeId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar loja';
      toastError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, [currentFranchise, user, queryClient, refreshStores, success, toastError]);
  
  // Atualizar loja
  const updateStore = useCallback(async (storeId: string, data: UpdateStoreData): Promise<void> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    setIsUpdating(true);
    try {
      await updateStoreService(currentFranchise.id, storeId, data);
      
      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: ['stores', currentFranchise.id] });
      queryClient.invalidateQueries({ queryKey: ['store', storeId] });
      await refreshStores();
      
      success('Loja atualizada com sucesso');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar loja';
      toastError(message);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [currentFranchise, queryClient, refreshStores, success, toastError]);
  
  // Excluir loja
  const deleteStore = useCallback(async (storeId: string): Promise<void> => {
    if (!currentFranchise?.id) {
      throw new Error('Nenhuma franquia selecionada');
    }
    
    setIsDeleting(true);
    try {
      await deleteStoreService(currentFranchise.id, storeId);
      
      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: ['stores', currentFranchise.id] });
      await refreshStores();
      
      success('Loja excluída com sucesso');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir loja';
      toastError(message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, [currentFranchise, queryClient, refreshStores, success, toastError]);
  
  return {
    stores,
    isLoading,
    error: error as Error | null,
    createStore,
    updateStore,
    deleteStore,
    refetch,
    isCreating,
    isUpdating,
    isDeleting,
  };
}
