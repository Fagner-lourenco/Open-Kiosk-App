/**
 * ============================================================================
 * FranchiseContext - Contexto da Franquia
 * ============================================================================
 * 
 * Gerencia dados da franquia atual e membros.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  orderBy,
  where,
  collectionGroup,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { logLogin } from '@/services/auditService';

// ============================================================================
// TIPOS
// ============================================================================

export interface Franchise {
  id: string;
  name: string;
  description?: string;
  ownerEmail?: string;
  ownerId?: string;
  website?: string;
  supportEmail?: string;
  settings?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FranchiseMember {
  id: string;
  email: string;
  displayName?: string;
  role: 'owner' | 'admin' | 'manager' | 'operator' | 'employee' | 'technician' | 'viewer';
  storeAccess?: string[];
  addedAt?: string;
}

export interface Store {
  id: string;
  name: string;
  address?: string | {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  isActive?: boolean;
  operators?: any[];
  settings?: Record<string, any>;
}

const VALID_MEMBER_ROLES = new Set([
  'owner',
  'admin',
  'manager',
  'operator',
  'employee',
  'technician',
  'viewer',
]);

function normalizeMemberRole(role: unknown): FranchiseMember['role'] {
  const normalized = typeof role === 'string' ? role.toLowerCase() : '';
  if (VALID_MEMBER_ROLES.has(normalized)) {
    return normalized as FranchiseMember['role'];
  }
  return 'viewer';
}

interface FranchiseContextValue {
  /** Franquias do usuário */
  franchises: Franchise[];
  
  /** Franquia selecionada atualmente */
  currentFranchise: Franchise | null;
  
  /** Membership do usuário na franquia atual */
  currentMembership: FranchiseMember | null;
  
  /** Lojas da franquia atual */
  stores: Store[];
  
  /** Carregando dados */
  loading: boolean;
  isLoading: boolean;
  
  /** Se o usuário é super admin */
  isSuperAdmin: boolean;
  
  /** Selecionar franquia - aceita lista opcional para evitar race condition */
  selectFranchise: (franchiseId: string, updatedFranchises?: Franchise[]) => Promise<void>;
  
  /** Recarregar franquias - retorna lista atualizada */
  refresh: () => Promise<Franchise[]>;
  refreshFranchises: () => Promise<Franchise[]>;
  
  /** Recarregar lojas */
  refreshStores: () => Promise<void>;
}

// ============================================================================
// CONTEXTO
// ============================================================================

const FranchiseContext = createContext<FranchiseContextValue | undefined>(undefined);

const SELECTED_FRANCHISE_KEY = 'open-kiosk-admin:selectedFranchise';

// ============================================================================
// PROVIDER
// ============================================================================

interface FranchiseProviderProps {
  children: ReactNode;
}

export function FranchiseProvider({ children }: FranchiseProviderProps) {
  const { user, isSuperAdmin } = useAuth();
  
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [currentFranchise, setCurrentFranchise] = useState<Franchise | null>(null);
  const [currentMembership, setCurrentMembership] = useState<FranchiseMember | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega lojas quando franquia muda
  const loadStores = useCallback(async (franchiseId: string) => {
    try {
      const storesRef = collection(db, `franchises/${franchiseId}/stores`);
      const q = query(storesRef, orderBy('name'));
      const snapshot = await getDocs(q);
      
      const storesList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          operators: data.operators ?? data.members ?? [],
        };
      }) as Store[];
      
      setStores(storesList);
    } catch (error) {
      console.error('Erro ao carregar lojas:', error);
      setStores([]);
    }
  }, []);

  // Carrega franquias do usuário - retorna a lista carregada
  const loadFranchises = useCallback(async (): Promise<Franchise[]> => {
    if (!user) {
      setFranchises([]);
      setCurrentFranchise(null);
      setCurrentMembership(null);
      setStores([]);
      setIsLoading(false);
      return [];
    }

    try {
      setIsLoading(true);
      
      const userFranchises: Franchise[] = [];
      
      // Super admin pode ver TODAS as franquias
      if (isSuperAdmin) {
        const membershipsRef = collection(db, 'franchises');
        const snapshot = await getDocs(membershipsRef);
        for (const docSnap of snapshot.docs) {
          userFranchises.push({
            id: docSnap.id,
            ...docSnap.data(),
          } as Franchise);
        }
      } else {
        // Usuário comum: busca apenas memberships do próprio usuário via collectionGroup
        // Isso é mais eficiente e evita erros de permissão
        try {
          const membersQuery = query(
            collectionGroup(db, 'members'),
            where('userId', '==', user.uid),
            where('isActive', '==', true)
          );
          const membersSnapshot = await getDocs(membersQuery);
          
          // Para cada membership, busca os dados da franquia
          for (const memberDoc of membersSnapshot.docs) {
            // Path: franchises/{franchiseId}/members/{memberId}
            const franchiseId = memberDoc.ref.parent.parent?.id;
            if (!franchiseId) continue;
            
            // Busca dados da franquia
            const franchiseRef = doc(db, 'franchises', franchiseId);
            const franchiseSnap = await getDoc(franchiseRef);
            
            if (franchiseSnap.exists()) {
              userFranchises.push({
                id: franchiseSnap.id,
                ...franchiseSnap.data(),
              } as Franchise);
            }
          }
        } catch (cgError: any) {
          console.warn('[FranchiseContext] CollectionGroup query falhou, tentando abordagem alternativa:', cgError);
          // Fallback: usuário pode não ter membership ainda
        }
        
        // Também busca franquias onde o usuário é owner
        const ownerQuery = query(
          collection(db, 'franchises'),
          where('ownerId', '==', user.uid)
        );
        const ownerSnapshot = await getDocs(ownerQuery);
        for (const docSnap of ownerSnapshot.docs) {
          // Evita duplicatas
          if (!userFranchises.find(f => f.id === docSnap.id)) {
            userFranchises.push({
              id: docSnap.id,
              ...docSnap.data(),
            } as Franchise);
          }
        }
      }
      
      // Se nenhuma franquia existe para o usuário E não é superadmin,
      // NÃO cria automaticamente - o usuário deve aguardar convite ou criar manualmente
      // Isso evita poluição do banco de dados com franquias fantasmas
      if (userFranchises.length === 0 && !isSuperAdmin) {
        console.info('[FranchiseContext] Usuário sem franquias - aguardando convite ou criação manual');
        // Não cria franquia automaticamente - retorna lista vazia
        // O UI deve mostrar opção para criar franquia ou aguardar convite
      }
      
      setFranchises(userFranchises);
      
      // Recupera franquia selecionada anteriormente
      const savedFranchiseId = localStorage.getItem(SELECTED_FRANCHISE_KEY);
      if (savedFranchiseId) {
        const saved = userFranchises.find(f => f.id === savedFranchiseId);
        if (saved) {
          setCurrentFranchise(saved);
          await loadStores(saved.id);
          await loadMembership(saved.id);
          setIsLoading(false);
          return userFranchises;
        }
      }
      
      // Seleciona a primeira franquia automaticamente
      if (userFranchises.length > 0) {
        setCurrentFranchise(userFranchises[0]);
        await loadStores(userFranchises[0].id);
        await loadMembership(userFranchises[0].id);
      }
      
      return userFranchises;
    } catch (error) {
      console.error('Erro ao carregar franquias:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user, isSuperAdmin]);

  // Carrega membership do usuário
  const loadMembership = async (franchiseId: string) => {
    if (!user) return;
    
    // Super admin tem acesso virtual a todas as franquias
    if (isSuperAdmin) {
      setCurrentMembership({
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Super Admin',
        role: 'owner', // Super admin atua como owner virtual
        addedAt: undefined,
      });
      return;
    }
    
    try {
      const memberRef = doc(db, 'franchises', franchiseId, 'members', user.uid);
      const memberSnap = await getDoc(memberRef);
      
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        setCurrentMembership({
          id: memberSnap.id,
          ...memberData,
          role: normalizeMemberRole(memberData.role),
        } as FranchiseMember);
      } else {
        const fallbackQuery = query(
          collection(db, 'franchises', franchiseId, 'members'),
          where('userId', '==', user.uid),
          where('isActive', '==', true)
        );
        const fallbackSnap = await getDocs(fallbackQuery);

        if (!fallbackSnap.empty) {
          const legacyMemberDoc = fallbackSnap.docs[0];
          const legacyData = legacyMemberDoc.data();

          setCurrentMembership({
            id: legacyMemberDoc.id,
            ...legacyData,
            role: normalizeMemberRole(legacyData.role),
          } as FranchiseMember);
        } else {
          setCurrentMembership(null);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar membership:', error);
    }
  };

  useEffect(() => {
    loadFranchises();
  }, [loadFranchises]);

  // Registra login de auditoria quando a franquia fica disponível
  // Isso cobre o caso em que claims.franchiseId não está definido no token
  const auditLoginFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !currentFranchise) return;

    // Evita registrar múltiplas vezes para a mesma franquia na sessão
    const loginKey = `audit_login:${user.uid}:${currentFranchise.id}`;
    if (auditLoginFiredRef.current === loginKey) return;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(loginKey) === '1') {
      auditLoginFiredRef.current = loginKey;
      return;
    }

    auditLoginFiredRef.current = loginKey;
    logLogin(currentFranchise.id, {
      id: user.uid,
      email: user.email || '',
      name: user.displayName || undefined,
    })
      .then(() => {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(loginKey, '1');
        }
      })
      .catch((err) => {
        console.warn('[audit] Falha ao registrar login (FranchiseContext):', err);
        // Reseta para tentar novamente caso seja erro transiente
        auditLoginFiredRef.current = null;
      });
  }, [user, currentFranchise]);

  // Selecionar franquia
  // Aceita lista opcional de franquias para evitar race condition
  const selectFranchise = useCallback(async (franchiseId: string, updatedFranchises?: Franchise[]) => {
    const franchiseList = updatedFranchises || franchises;
    const franchise = franchiseList.find(f => f.id === franchiseId);
    
    if (!franchise) {
      console.error(`Franquia ${franchiseId} não encontrada na lista`);
      throw new Error(`Franquia não encontrada: ${franchiseId}`);
    }

    setCurrentFranchise(franchise);
    // Limpar dados da franquia anterior imediatamente para evitar vazamento cross-tenant
    setStores([]);
    setCurrentMembership(null);
    localStorage.setItem(SELECTED_FRANCHISE_KEY, franchiseId);
    
    await loadStores(franchiseId);
    await loadMembership(franchiseId);
  }, [franchises, loadStores]);

  // Recarregar franquias - retorna lista atualizada
  const refresh = useCallback(async (): Promise<Franchise[]> => {
    return await loadFranchises();
  }, [loadFranchises]);

  // Recarregar lojas
  const refreshStores = useCallback(async () => {
    if (currentFranchise) {
      await loadStores(currentFranchise.id);
    }
  }, [currentFranchise, loadStores]);

  return (
    <FranchiseContext.Provider
      value={{
        franchises,
        currentFranchise,
        currentMembership,
        stores,
        loading: isLoading,
        isLoading,
        isSuperAdmin,
        selectFranchise,
        refresh,
        refreshFranchises: refresh,
        refreshStores,
      }}
    >
      {children}
    </FranchiseContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useFranchise() {
  const context = useContext(FranchiseContext);
  if (context === undefined) {
    throw new Error('useFranchise deve ser usado dentro de um FranchiseProvider');
  }
  return context;
}
