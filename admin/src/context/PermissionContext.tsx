/**
 * ============================================================================
 * PermissionContext
 * ============================================================================
 * 
 * Contexto para verificação de permissões RBAC.
 */

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useFranchise } from './FranchiseContext';
import { Permission, ROLE_PERMISSIONS, UserRole } from '@/types/franchise';

interface PermissionContextType {
  /** Verifica se o usuário tem uma permissão */
  can: (permission: Permission) => boolean;
  /** Verifica se o usuário tem todas as permissões */
  canAll: (permissions: Permission[]) => boolean;
  /** Verifica se o usuário tem alguma das permissões */
  canAny: (permissions: Permission[]) => boolean;
  /** Verifica acesso a uma loja */
  hasStoreAccess: (storeId: string) => boolean;
  /** Role atual */
  role: UserRole | null;
  /** É admin ou owner */
  isAdminOrAbove: boolean;
  /** É owner */
  isOwner: boolean;
  /** Permissões do usuário */
  permissions: Permission[];
}

// Exportar o contexto para uso em verificações condicionais
export const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

interface PermissionProviderProps {
  children: ReactNode;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  const { currentMembership: membership } = useFranchise();

  const normalizedRole =
    typeof membership?.role === 'string'
      ? membership.role.toLowerCase()
      : null;

  const role = (normalizedRole as UserRole) || null;
  
  const permissions = useMemo(() => {
    if (!role) return [];
    return ROLE_PERMISSIONS[role] || [];
  }, [role]);
  
  const can = (permission: Permission): boolean => {
    if (!role) return false;
    if (role === 'owner') return true;
    return permissions.includes(permission);
  };
  
  const canAll = (perms: Permission[]): boolean => {
    return perms.every(p => can(p));
  };
  
  const canAny = (perms: Permission[]): boolean => {
    return perms.some(p => can(p));
  };
  
  // Verifica se o usuário tem acesso a uma loja específica
  const hasStoreAccess = (storeId: string): boolean => {
    if (!membership) return false;
    
    // Owners e admins têm acesso a todas as lojas
    if (role === 'owner' || role === 'admin') return true;
    
    // Se não tiver storeAccess definido, sem acesso
    const accessList = membership.storeAccess;
    if (!accessList || accessList.length === 0) return false;
    
    // Wildcard = todas as lojas
    if (accessList.includes('*')) return true;
    
    // Verifica se a loja está na lista
    return accessList.includes(storeId);
  };
  
  const isAdminOrAbove = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';
  
  const value = useMemo(() => ({
    can,
    canAll,
    canAny,
    hasStoreAccess,
    role,
    isAdminOrAbove,
    isOwner,
    permissions,
  }), [role, permissions, membership]);
  
  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionContext(): PermissionContextType {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissionContext must be used within a PermissionProvider');
  }
  return context;
}
