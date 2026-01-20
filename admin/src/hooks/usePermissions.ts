/**
 * ============================================================================
 * usePermissions Hook
 * ============================================================================
 * 
 * Hook para verificação de permissões baseado em roles.
 */

import { useCallback, useMemo } from 'react';
import { useFranchise } from '@/context/FranchiseContext';
import { Permission, ROLE_PERMISSIONS, UserRole } from '@/types/franchise';

interface UsePermissionsReturn {
  /** Verifica se o usuário tem uma permissão específica */
  can: (permission: Permission) => boolean;
  /** Verifica se o usuário tem todas as permissões listadas */
  canAll: (permissions: Permission[]) => boolean;
  /** Verifica se o usuário tem alguma das permissões listadas */
  canAny: (permissions: Permission[]) => boolean;
  /** Verifica se o usuário tem acesso a uma loja específica */
  hasStoreAccess: (storeId: string) => boolean;
  /** Role atual do usuário */
  role: UserRole | null;
  /** Verifica se o usuário é owner ou admin */
  isAdminOrAbove: boolean;
  /** Verifica se o usuário é owner */
  isOwner: boolean;
  /** Lista de permissões do usuário */
  permissions: Permission[];
}

export function usePermissions(): UsePermissionsReturn {
  const { currentMembership: membership } = useFranchise();
  
  const role = membership?.role as UserRole | null;
  
  const permissions = useMemo(() => {
    if (!role) return [];
    return ROLE_PERMISSIONS[role] || [];
  }, [role]);
  
  const can = useCallback((permission: Permission): boolean => {
    if (!role) return false;
    
    // Owner tem todas as permissões
    if (role === 'owner') return true;
    
    // Verifica permissões do role
    return permissions.includes(permission);
  }, [role, permissions]);
  
  const canAll = useCallback((perms: Permission[]): boolean => {
    return perms.every(p => can(p));
  }, [can]);
  
  const canAny = useCallback((perms: Permission[]): boolean => {
    return perms.some(p => can(p));
  }, [can]);
  
  // Verifica se o usuário tem acesso a uma loja específica
  // baseado no array storeAccess do membership
  const hasStoreAccess = useCallback((storeId: string): boolean => {
    if (!membership) return false;
    
    // Owners, admins têm acesso a todas as lojas automaticamente
    if (role === 'owner' || role === 'admin') return true;
    
    // Verifica storeAccess no membership
    const membershipData = membership as any; // Para acessar storeAccess
    const storeAccessList = membershipData.storeAccess || membershipData.allowedStores;
    
    if (!storeAccessList || !Array.isArray(storeAccessList)) {
      // Se não há lista definida, managers têm acesso total, outros não
      return role === 'manager';
    }
    
    // '*' significa acesso a todas as lojas
    if (storeAccessList.includes('*')) return true;
    
    // Verifica se a loja específica está na lista
    return storeAccessList.includes(storeId);
  }, [membership, role]);
  
  const isAdminOrAbove = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';
  
  return {
    can,
    canAll,
    canAny,
    hasStoreAccess,
    role,
    isAdminOrAbove,
    isOwner,
    permissions,
  };
}
