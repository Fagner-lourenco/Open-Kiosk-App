/**
 * ============================================================================
 * Componente Can - Controle de Permissões Declarativo
 * ============================================================================
 * 
 * Renderiza filhos condicionalmente baseado em permissões.
 * 
 * Uso:
 * ```tsx
 * <Can permission="products:create">
 *   <Button>Novo Produto</Button>
 * </Can>
 * 
 * <Can permissions={['users:invite', 'users:update_role']} mode="any">
 *   <UserManagement />
 * </Can>
 * ```
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { ReactNode } from 'react';
import { Permission } from '../../types/franchise';
import { usePermissions } from '../../context/PermissionContext';

// ============================================================================
// TIPOS
// ============================================================================

interface CanProps {
  /** Permissão única a verificar */
  permission?: Permission;
  
  /** Múltiplas permissões a verificar */
  permissions?: Permission[];
  
  /** Modo de verificação: 'all' (AND) ou 'any' (OR) */
  mode?: 'all' | 'any';
  
  /** ID da loja para verificar acesso (opcional) */
  storeId?: string;
  
  /** Conteúdo a renderizar se permitido */
  children: ReactNode;
  
  /** Conteúdo alternativo se não permitido */
  fallback?: ReactNode;
  
  /** Inverte a lógica (mostra se NÃO tem permissão) */
  not?: boolean;
}

// ============================================================================
// COMPONENTE
// ============================================================================

/**
 * Componente declarativo para controle de permissões
 */
export function Can({
  permission,
  permissions,
  mode = 'all',
  storeId,
  children,
  fallback = null,
  not = false,
}: CanProps): ReactNode {
  const { can, canAll, canAny, hasStoreAccess } = usePermissions();

  // Calcula se tem permissão
  let hasPermission = true;

  // Verifica permissão única
  if (permission) {
    hasPermission = can(permission);
  }

  // Verifica múltiplas permissões
  if (permissions && permissions.length > 0) {
    hasPermission = mode === 'all'
      ? canAll(...permissions)
      : canAny(...permissions);
  }

  // Verifica acesso à loja
  if (storeId) {
    hasPermission = hasPermission && hasStoreAccess(storeId);
  }

  // Aplica inversão se necessário
  const shouldRender = not ? !hasPermission : hasPermission;

  return shouldRender ? children : fallback;
}

// ============================================================================
// VARIANTES CONVENIENTES
// ============================================================================

interface CanViewProps {
  resource: 'products' | 'sales' | 'reports' | 'settings' | 'users' | 'stores' | 'dispensers';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Verifica permissão de leitura para um recurso
 */
export function CanView({ resource, children, fallback = null }: CanViewProps): ReactNode {
  const permissionMap: Record<string, Permission> = {
    products: 'products:read',
    sales: 'sales:read',
    reports: 'reports:view',
    settings: 'settings:read',
    users: 'users:read',
    stores: 'stores:read',
    dispensers: 'dispensers:read',
  };

  return (
    <Can permission={permissionMap[resource]} fallback={fallback}>
      {children}
    </Can>
  );
}

interface CanEditProps {
  resource: 'products' | 'settings' | 'users' | 'stores' | 'dispensers';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Verifica permissão de edição para um recurso
 */
export function CanEdit({ resource, children, fallback = null }: CanEditProps): ReactNode {
  const permissionMap: Record<string, Permission> = {
    products: 'products:update',
    settings: 'settings:update',
    users: 'users:update_role',
    stores: 'stores:update',
    dispensers: 'dispensers:update',
  };

  return (
    <Can permission={permissionMap[resource]} fallback={fallback}>
      {children}
    </Can>
  );
}

interface CanCreateProps {
  resource: 'products' | 'sales' | 'users' | 'stores' | 'dispensers';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Verifica permissão de criação para um recurso
 */
export function CanCreate({ resource, children, fallback = null }: CanCreateProps): ReactNode {
  const permissionMap: Record<string, Permission> = {
    products: 'products:create',
    sales: 'sales:create',
    users: 'users:invite',
    stores: 'stores:create',
    dispensers: 'dispensers:create',
  };

  return (
    <Can permission={permissionMap[resource]} fallback={fallback}>
      {children}
    </Can>
  );
}

interface CanDeleteProps {
  resource: 'products' | 'stores' | 'dispensers';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Verifica permissão de exclusão para um recurso
 */
export function CanDelete({ resource, children, fallback = null }: CanDeleteProps): ReactNode {
  const permissionMap: Record<string, Permission> = {
    products: 'products:delete',
    stores: 'stores:delete',
    dispensers: 'dispensers:delete',
  };

  return (
    <Can permission={permissionMap[resource]} fallback={fallback}>
      {children}
    </Can>
  );
}

// ============================================================================
// HOOKS PARA USO IMPERATIVO
// ============================================================================

/**
 * Hook para verificação imperativa de permissões
 * 
 * @example
 * const { checkPermission, checkStoreAccess } = useCanCheck();
 * 
 * if (checkPermission('products:delete')) {
 *   // permite deletar
 * }
 */
export function useCanCheck() {
  const { can, canAll, canAny, hasStoreAccess } = usePermissions();

  return {
    checkPermission: can,
    checkAllPermissions: canAll,
    checkAnyPermission: canAny,
    checkStoreAccess: hasStoreAccess,
  };
}
