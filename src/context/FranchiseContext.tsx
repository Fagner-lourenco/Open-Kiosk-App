/**
 * ============================================================================
 * Contexto de Franquia
 * ============================================================================
 * 
 * Gerencia estado da franquia atual e membership do usuário.
 * 
 * Funcionalidades:
 * - Seleção e troca de franquia/loja
 * - Cache de membership
 * - Sincronização com AuthContext
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  Franchise,
  FranchiseMember,
  FranchiseState,
  StoreInfo,
  UserRole,
} from '../types/franchise';
import { franchiseService } from '../services/franchiseService';
import { authService } from '../services/authService';
import { isFranchiseMode } from '../lib/pathResolver';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Chave para franquia selecionada no localStorage (alinhado com Admin) */
const SELECTED_FRANCHISE_KEY = 'open-kiosk-admin:selectedFranchise';
const SELECTED_STORE_KEY = 'open-kiosk-admin:selectedStore';

// ============================================================================
// TIPOS
// ============================================================================

export interface FranchiseContextValue extends FranchiseState {
  /** Seleciona uma franquia */
  selectFranchise: (franchiseId: string) => Promise<void>;
  
  /** Limpa seleção de franquia */
  clearFranchise: () => void;
  
  /** Recarrega dados da franquia atual */
  refreshFranchise: () => Promise<void>;
  
  /** Recarrega lista de franquias do usuário */
  refreshUserFranchises: () => Promise<void>;
  
  /** Lista de lojas que o usuário tem acesso */
  userStores: StoreInfo[];
  
  /** Loja atualmente selecionada */
  currentStore: StoreInfo | null;
  
  /** Seleciona uma loja */
  selectStore: (franchiseId: string, storeId: string) => Promise<void>;
  
  /** Alias para loading */
  isLoading: boolean;
}

// ============================================================================
// CONTEXTO
// ============================================================================

const FranchiseContext = createContext<FranchiseContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface FranchiseProviderProps {
  children: ReactNode;
}

export function FranchiseProvider({ children }: FranchiseProviderProps) {
  // Estado
  const [currentFranchise, setCurrentFranchise] = useState<Franchise | null>(null);
  const [currentMembership, setCurrentMembership] = useState<FranchiseMember | null>(null);
  const [userFranchises, setUserFranchises] = useState<Franchise[]>([]);
  const [userStores, setUserStores] = useState<StoreInfo[]>([]);
  const [currentStore, setCurrentStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==========================================================================
  // LOAD INITIAL DATA
  // ==========================================================================

  useEffect(() => {
    // Se não estiver em modo franquia, não carrega nada
    if (!isFranchiseMode()) {
      setLoading(false);
      return;
    }

    // Escuta mudanças de autenticação
    const unsubscribe = authService.onAuthStateChange(async (user) => {
      if (!user) {
        // Usuário deslogou
        setCurrentFranchise(null);
        setCurrentMembership(null);
        setUserFranchises([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Carrega franquias do usuário
        let franchises: Franchise[] = [];
        try {
          franchises = await franchiseService.getUserFranchises(user.uid);
        } catch (franchiseError: any) {
          // Se for erro de permissão, tenta uma abordagem alternativa
          // ou mostra lista vazia (usuário pode ser novo e não ter franquia ainda)
          if (franchiseError?.code === 'permission-denied' || 
              franchiseError?.message?.includes('permission')) {
            console.warn('[FranchiseContext] Erro de permissão ao buscar franquias. Usuário pode não ter franquias ainda.');
            franchises = [];
          } else {
            throw franchiseError;
          }
        }
        setUserFranchises(franchises);

        // Monta lista de lojas do usuário com roles corretos
        const stores: StoreInfo[] = [];
        for (const franchise of franchises) {
          // Determina o role: se é owner da franquia, role é 'owner'
          // Caso contrário, busca do membership (se existir)
          let role: UserRole = 'owner';
          let storeAccessList: string[] = ['*'];
          
          if (franchise.ownerId !== user.uid) {
            // Não é owner, busca role do membership
            const membership = await franchiseService.getMembership(franchise.id, user.uid);
            role = membership?.role || 'operator';
            storeAccessList = membership?.storeAccess || [];
          }

          // Carrega lojas reais da franquia
          try {
            const franchiseStores = await franchiseService.getFranchiseStores(franchise.id);
            
            if (franchiseStores.length > 0) {
              // Adiciona lojas reais que o usuário tem acesso
              for (const store of franchiseStores) {
                // Verifica se tem acesso a todas lojas (*) ou a esta loja específica
                const hasAccess = storeAccessList.includes('*') || storeAccessList.includes(store.id);
                
                if (hasAccess && store.isActive) {
                  stores.push({
                    franchiseId: franchise.id,
                    franchiseName: franchise.name,
                    storeId: store.id,
                    storeName: store.name,
                    role,
                  });
                }
              }
            } else {
              // Fallback: se não tem lojas reais, usa a franquia como loja
              // Isso mantém compatibilidade com franquias que ainda não têm lojas criadas
              stores.push({
                franchiseId: franchise.id,
                franchiseName: franchise.name,
                storeId: franchise.id,
                storeName: franchise.name,
                role,
              });
            }
          } catch (storeError) {
            console.warn('[FranchiseContext] Erro ao carregar lojas, usando franquia como loja:', storeError);
            // Fallback: usa franquia como loja
            stores.push({
              franchiseId: franchise.id,
              franchiseName: franchise.name,
              storeId: franchise.id,
              storeName: franchise.name,
              role,
            });
          }
        }
        setUserStores(stores);

        // Tenta recuperar franquia/loja selecionada anteriormente
        const savedFranchiseId = localStorage.getItem(SELECTED_FRANCHISE_KEY);
        const savedStoreId = localStorage.getItem(SELECTED_STORE_KEY);
        const defaultFranchiseId = user.defaultFranchiseId || user.customClaims?.franchiseId;

        const franchiseIdToLoad = savedFranchiseId || defaultFranchiseId;

        if (franchiseIdToLoad) {
          // Verifica se o usuário ainda tem acesso
          const hasAccess = franchises.some((f) => f.id === franchiseIdToLoad);
          if (hasAccess) {
            await loadFranchise(franchiseIdToLoad, user.uid);
          } else if (franchises.length > 0) {
            // Seleciona a primeira franquia disponível
            await loadFranchise(franchises[0].id, user.uid);
          }
        } else if (franchises.length === 1) {
          // Se só tem uma franquia, seleciona automaticamente
          await loadFranchise(franchises[0].id, user.uid);
        }
      } catch (err) {
        console.error('[FranchiseContext] Erro ao carregar dados:', err);
        setError('Erro ao carregar dados da franquia');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // ==========================================================================
  // LOAD FRANCHISE
  // ==========================================================================

  const loadFranchise = useCallback(async (franchiseId: string, userId: string) => {
    try {
      const [franchise, membership] = await Promise.all([
        franchiseService.getFranchise(franchiseId),
        franchiseService.getMembership(franchiseId, userId),
      ]);

      if (!franchise) {
        throw new Error('Franquia não encontrada');
      }

      // Verifica acesso: membership ativo OU usuário é owner da franquia
      const isOwner = franchise.ownerId === userId;
      const hasActiveMembership = membership && membership.isActive;

      if (!isOwner && !hasActiveMembership) {
        throw new Error('Você não tem acesso a esta franquia');
      }

      // Se é owner mas não tem membership, cria um virtual
      const effectiveMembership = membership || {
        userId,
        role: 'owner' as const,
        storeAccess: ['*'],
        isActive: true,
        invitedBy: userId,
        invitedAt: new Date(),
        joinedAt: new Date(),
      };

      setCurrentFranchise(franchise);
      setCurrentMembership(effectiveMembership);
      localStorage.setItem(SELECTED_FRANCHISE_KEY, franchiseId);
    } catch (err) {
      console.error('[FranchiseContext] Erro ao carregar franquia:', err);
      throw err;
    }
  }, []);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const selectFranchise = useCallback(async (franchiseId: string) => {
    const user = authService.getCurrentUser();
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await loadFranchise(franchiseId, user.uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao selecionar franquia';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadFranchise]);

  const clearFranchise = useCallback(() => {
    setCurrentFranchise(null);
    setCurrentMembership(null);
    localStorage.removeItem(SELECTED_FRANCHISE_KEY);
  }, []);

  const refreshFranchise = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user || !currentFranchise) return;

    try {
      await loadFranchise(currentFranchise.id, user.uid);
    } catch (err) {
      console.error('[FranchiseContext] Erro ao recarregar franquia:', err);
    }
  }, [currentFranchise, loadFranchise]);

  const refreshUserFranchises = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user) return;

    try {
      const franchises = await franchiseService.getUserFranchises(user.uid);
      setUserFranchises(franchises);
      
      // Atualiza lista de lojas
      const stores: StoreInfo[] = [];
      for (const franchise of franchises) {
        stores.push({
          franchiseId: franchise.id,
          franchiseName: franchise.name,
          storeId: franchise.id,
          storeName: franchise.name,
          role: 'owner', // Default role para franquias do usuário
        });
      }
      setUserStores(stores);
    } catch (err) {
      console.error('[FranchiseContext] Erro ao recarregar franquias:', err);
    }
  }, []);

  const selectStore = useCallback(async (franchiseId: string, storeId: string) => {
    // Encontra a loja na lista
    const store = userStores.find(s => s.franchiseId === franchiseId && s.storeId === storeId);
    if (!store) {
      setError('Loja não encontrada');
      return;
    }

    // Seleciona a franquia correspondente
    await selectFranchise(franchiseId);
    
    // Define a loja atual
    setCurrentStore(store);
    localStorage.setItem(SELECTED_STORE_KEY, storeId);
  }, [userStores, selectFranchise]);

  // ==========================================================================
  // MEMOIZED VALUE
  // ==========================================================================

  const value = useMemo<FranchiseContextValue>(() => ({
    currentFranchise,
    currentMembership,
    userFranchises,
    loading,
    error,
    selectFranchise,
    clearFranchise,
    refreshFranchise,
    refreshUserFranchises,
    userStores,
    currentStore,
    selectStore,
    isLoading: loading,
  }), [
    currentFranchise,
    currentMembership,
    userFranchises,
    loading,
    error,
    selectFranchise,
    clearFranchise,
    refreshFranchise,
    refreshUserFranchises,
    userStores,
    currentStore,
    selectStore,
  ]);

  return (
    <FranchiseContext.Provider value={value}>
      {children}
    </FranchiseContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook para acessar o contexto de franquia
 */
export function useFranchise(): FranchiseContextValue {
  const context = useContext(FranchiseContext);
  
  if (context === undefined) {
    throw new Error('useFranchise deve ser usado dentro de um FranchiseProvider');
  }
  
  return context;
}

/**
 * Hook seguro para acessar o contexto de franquia
 * Retorna null se não estiver dentro do provider (não lança erro)
 */
export function useFranchiseSafe(): FranchiseContextValue | null {
  const context = useContext(FranchiseContext);
  return context ?? null;
}

/**
 * Hook para obter apenas a franquia atual
 */
export function useCurrentFranchise(): Franchise | null {
  const { currentFranchise } = useFranchise();
  return currentFranchise;
}

/**
 * Hook para obter o membership atual
 */
export function useCurrentMembership(): FranchiseMember | null {
  const { currentMembership } = useFranchise();
  return currentMembership;
}

/**
 * Hook para verificar se o modo franquia está ativo e configurado
 */
export function useIsFranchiseActive(): boolean {
  const { currentFranchise } = useFranchise();
  return isFranchiseMode() && currentFranchise !== null;
}
