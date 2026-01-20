/**
 * ============================================================================
 * Hook de Permissões
 * ============================================================================
 * 
 * Hook para verificação de permissões baseado no role do usuário.
 * Usa os tipos unificados de @shared/types.
 * 
 * @example
 * const { hasPermission, can, role } = usePermissions();
 * 
 * if (hasPermission('products:create')) {
 *   // pode criar produtos
 * }
 * 
 * // ou usar o alias
 * if (can('sales:refund')) {
 *   // pode fazer reembolso
 * }
 */

import { useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Importa tipos unificados de @shared/types
import { 
  Permission, 
  ROLE_PERMISSIONS, 
} from '@shared/types/permissions';
import { 
  UserRole, 
  ROLE_HIERARCHY, 
} from '@shared/types/roles';

export interface UsePermissionsReturn {
  /** Role do usuário atual */
  role: UserRole | null;
  
  /** Verifica se tem uma permissão específica */
  hasPermission: (permission: Permission) => boolean;
  
  /** Alias para hasPermission */
  can: (permission: Permission) => boolean;
  
  /** Verifica se tem todas as permissões listadas */
  hasAllPermissions: (permissions: Permission[]) => boolean;
  
  /** Verifica se tem alguma das permissões listadas */
  hasAnyPermission: (permissions: Permission[]) => boolean;
  
  /** Verifica se o role é igual ou superior ao especificado */
  isRoleAtLeast: (minRole: UserRole) => boolean;
  
  /** Verifica se o role está acima do especificado */
  isRoleAbove: (role: UserRole) => boolean;
  
  /** Lista todas as permissões do role atual */
  permissions: Permission[];
  
  /** Se está em modo offline (permissões limitadas) */
  isOffline: boolean;
}

/**
 * Hook para verificar permissões do usuário
 */
export function usePermissions(): UsePermissionsReturn {
  const { user, isOfflineMode, isAuthenticated } = useAuth();
  
  // Determina o role do usuário
  const role = useMemo((): UserRole | null => {
    if (!isAuthenticated) return null;
    
    // Em modo offline, assume role mínimo para operação
    if (isOfflineMode) {
      return 'operator';
    }
    
    // Pega role do usuário autenticado (de customClaims)
    const userRole = user?.customClaims?.role;
    if (userRole) {
      // Valida se é um role conhecido
      if (ROLE_HIERARCHY[userRole] !== undefined) {
        return userRole;
      }
    }
    
    // Fallback para viewer se não encontrar role válido
    return 'viewer';
  }, [user, isOfflineMode, isAuthenticated]);
  
  // Lista de permissões do role atual
  const permissions = useMemo((): Permission[] => {
    if (!role) return [];
    return ROLE_PERMISSIONS[role] || [];
  }, [role]);
  
  // Verifica uma permissão
  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!role) return false;
    return permissions.includes(permission);
  }, [role, permissions]);
  
  // Alias para hasPermission
  const can = hasPermission;
  
  // Verifica múltiplas permissões (todas)
  const hasAllPermissions = useCallback((perms: Permission[]): boolean => {
    if (!role) return false;
    return perms.every(p => permissions.includes(p));
  }, [role, permissions]);
  
  // Verifica múltiplas permissões (alguma)
  const hasAnyPermission = useCallback((perms: Permission[]): boolean => {
    if (!role) return false;
    return perms.some(p => permissions.includes(p));
  }, [role, permissions]);
  
  // Verifica hierarquia de roles (>=)
  const isRoleAtLeast = useCallback((minRole: UserRole): boolean => {
    if (!role) return false;
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
  }, [role]);
  
  // Verifica hierarquia de roles (>)
  const isRoleAbove = useCallback((targetRole: UserRole): boolean => {
    if (!role) return false;
    return ROLE_HIERARCHY[role] > ROLE_HIERARCHY[targetRole];
  }, [role]);
  
  return {
    role,
    hasPermission,
    can,
    hasAllPermissions,
    hasAnyPermission,
    isRoleAtLeast,
    isRoleAbove,
    permissions,
    isOffline: isOfflineMode,
  };
}

export default usePermissions;

// Re-exporta tipos para conveniência
export type { Permission, UserRole };
