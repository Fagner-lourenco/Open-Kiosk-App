/**
 * ============================================================================
 * Can Component
 * ============================================================================
 * 
 * Componente para renderização condicional baseada em permissões.
 * 
 * @example
 * <Can permission="products:create">
 *   <Button>Adicionar Produto</Button>
 * </Can>
 * 
 * @example
 * <Can permissions={['reports:read', 'reports:export']} mode="any">
 *   <ReportActions />
 * </Can>
 */

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/franchise';

interface CanProps {
  /** Permissão única a verificar */
  permission?: Permission;
  /** Lista de permissões a verificar */
  permissions?: Permission[];
  /** Modo de verificação: 'all' exige todas, 'any' exige pelo menos uma */
  mode?: 'all' | 'any';
  /** Conteúdo a renderizar se tiver permissão */
  children: ReactNode;
  /** Conteúdo alternativo se não tiver permissão */
  fallback?: ReactNode;
  /** Verifica acesso a uma loja específica */
  storeId?: string;
}

export function Can({ 
  permission, 
  permissions, 
  mode = 'all', 
  children, 
  fallback = null,
  storeId 
}: CanProps) {
  const { can, canAll, canAny, hasStoreAccess } = usePermissions();
  
  let hasPermission = false;
  
  // Verificar permissão única
  if (permission) {
    hasPermission = can(permission);
  }
  // Verificar lista de permissões
  else if (permissions && permissions.length > 0) {
    hasPermission = mode === 'all' 
      ? canAll(permissions) 
      : canAny(permissions);
  }
  // Sem permissão especificada = permitir
  else {
    hasPermission = true;
  }
  
  // Verificar acesso à loja também
  if (hasPermission && storeId) {
    hasPermission = hasStoreAccess(storeId);
  }
  
  if (hasPermission) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

/**
 * Hook wrapper para uso em lógica imperativa
 */
export function useCanAccess() {
  const { can, canAll, canAny, hasStoreAccess, role, isOwner, isAdminOrAbove } = usePermissions();
  
  return {
    can,
    canAll,
    canAny,
    hasStoreAccess,
    role,
    isOwner,
    isAdminOrAbove,
  };
}
