/**
 * ============================================================================
 * Contexto de Permissões
 * ============================================================================
 * 
 * Gerencia permissões do usuário atual com base no role e membership.
 * 
 * Funcionalidades:
 * - Verificação de permissões (can)
 * - Verificação de acesso a lojas (hasStoreAccess)
 * - Cache de permissões efetivas
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from 'react';
import {
  Permission,
  UserRole,
  PermissionState,
  ROLE_PERMISSIONS,
} from '../types/franchise';
import { useFranchiseSafe } from './FranchiseContext';
import { isFranchiseMode } from '../lib/pathResolver';

// ============================================================================
// TIPOS
// ============================================================================

interface PermissionContextValue extends PermissionState {
  /** Verifica múltiplas permissões (AND) */
  canAll: (...permissions: Permission[]) => boolean;
  
  /** Verifica múltiplas permissões (OR) */
  canAny: (...permissions: Permission[]) => boolean;
  
  /** Verifica se é owner */
  isOwner: boolean;
  
  /** Verifica se é admin ou superior */
  isAdmin: boolean;
  
  /** Verifica se é manager ou superior */
  isManager: boolean;
}

// ============================================================================
// CONTEXTO
// ============================================================================

const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface PermissionProviderProps {
  children: ReactNode;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  // Usa useFranchiseSafe para não lançar erro se não estiver dentro do FranchiseProvider
  const franchiseContext = useFranchiseSafe();
  const currentMembership = franchiseContext?.currentMembership ?? null;

  // ==========================================================================
  // COMPUTE PERMISSIONS
  // ==========================================================================

  const { role, permissions, storeAccess } = useMemo(() => {
    // Se não estiver em modo franquia, concede todas as permissões (compatibilidade)
    if (!isFranchiseMode()) {
      return {
        role: 'owner' as UserRole,
        permissions: ROLE_PERMISSIONS.owner,
        storeAccess: ['*'] as string[],
      };
    }

    // Se não tiver membership, sem permissões
    if (!currentMembership || !currentMembership.isActive) {
      return {
        role: null,
        permissions: [] as Permission[],
        storeAccess: [] as string[],
      };
    }

    // Calcula permissões efetivas
    const rolePermissions = ROLE_PERMISSIONS[currentMembership.role] || [];
    const customPermissions = currentMembership.customPermissions || [];
    const effectivePermissions = [...new Set([...rolePermissions, ...customPermissions])];

    return {
      role: currentMembership.role,
      permissions: effectivePermissions,
      storeAccess: currentMembership.storeAccess,
    };
  }, [currentMembership]);

  // ==========================================================================
  // PERMISSION CHECKS
  // ==========================================================================

  const can = useMemo(() => {
    return (permission: Permission): boolean => {
      return permissions.includes(permission);
    };
  }, [permissions]);

  const canAll = useMemo(() => {
    return (...requiredPermissions: Permission[]): boolean => {
      return requiredPermissions.every((p) => permissions.includes(p));
    };
  }, [permissions]);

  const canAny = useMemo(() => {
    return (...requiredPermissions: Permission[]): boolean => {
      return requiredPermissions.some((p) => permissions.includes(p));
    };
  }, [permissions]);

  const hasStoreAccess = useMemo(() => {
    return (storeId: string): boolean => {
      // Owner e Admin têm acesso a tudo
      if (role === 'owner' || role === 'admin') {
        return true;
      }
      // Wildcard = todas as lojas
      if (storeAccess.includes('*')) {
        return true;
      }
      // Verifica se a loja está na lista
      return storeAccess.includes(storeId);
    };
  }, [role, storeAccess]);

  // ==========================================================================
  // ROLE CHECKS
  // ==========================================================================

  const isOwner = role === 'owner';
  const isAdmin = role === 'owner' || role === 'admin';
  const isManager = role === 'owner' || role === 'admin' || role === 'manager';

  // ==========================================================================
  // MEMOIZED VALUE
  // ==========================================================================

  const value = useMemo<PermissionContextValue>(() => ({
    role,
    permissions,
    storeAccess,
    can,
    canAll,
    canAny,
    hasStoreAccess,
    isOwner,
    isAdmin,
    isManager,
  }), [
    role,
    permissions,
    storeAccess,
    can,
    canAll,
    canAny,
    hasStoreAccess,
    isOwner,
    isAdmin,
    isManager,
  ]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook para acessar o contexto de permissões
 */
export function usePermissions(): PermissionContextValue {
  const context = useContext(PermissionContext);
  
  if (context === undefined) {
    throw new Error('usePermissions deve ser usado dentro de um PermissionProvider');
  }
  
  return context;
}

/**
 * Hook simplificado para verificar uma permissão
 */
export function useCan(permission: Permission): boolean {
  const { can } = usePermissions();
  return can(permission);
}

/**
 * Hook para verificar acesso a uma loja
 */
export function useHasStoreAccess(storeId: string): boolean {
  const { hasStoreAccess } = usePermissions();
  return hasStoreAccess(storeId);
}

/**
 * Hook para obter o role atual
 */
export function useRole(): UserRole | null {
  const { role } = usePermissions();
  return role;
}
