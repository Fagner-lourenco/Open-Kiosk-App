import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionContext';
import { Permission } from '@/types/franchise';

/**
 * ============================================================================
 * ProtectedRoute - Proteção de Rotas
 * ============================================================================
 * 
 * Protege rotas administrativas verificando:
 * 1. Autenticação (PIN ou Firebase)
 * 2. Permissões (opcional, em modo franquia)
 * 
 * @author Open Kiosk Project
 * @version 2.0.0
 */

interface ProtectedRouteProps {
  /** Elemento a ser renderizado se autorizado */
  element: React.ReactElement;
  
  /** Permissão requerida (opcional, modo franquia) */
  requiredPermission?: Permission;
  
  /** Múltiplas permissões requeridas (AND) */
  requiredPermissions?: Permission[];
  
  /** Verificar pelo menos uma permissão (OR) */
  anyPermission?: Permission[];
  
  /** Rota de redirecionamento se não autenticado */
  redirectTo?: string;
  
  /** Rota de redirecionamento se não autorizado (sem permissão) */
  unauthorizedRedirect?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  element,
  requiredPermission,
  requiredPermissions,
  anyPermission,
  redirectTo = '/',
  unauthorizedRedirect = '/',
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { can, canAll, canAny } = usePermissions();
  
  // Aguarda carregamento do estado de auth (em modo franquia)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Verifica autenticação
  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Acesso negado - não autenticado');
    return <Navigate to={redirectTo} replace />;
  }

  if (requiredPermission && !can(requiredPermission)) {
    console.log('[ProtectedRoute] Acesso negado - sem permissão:', requiredPermission);
    return <Navigate to={unauthorizedRedirect} replace />;
  }
  
  if (requiredPermissions && !canAll(...requiredPermissions)) {
    console.log('[ProtectedRoute] Acesso negado - faltam permissões');
    return <Navigate to={unauthorizedRedirect} replace />;
  }
  
  if (anyPermission && !canAny(...anyPermission)) {
    console.log('[ProtectedRoute] Acesso negado - nenhuma permissão válida');
    return <Navigate to={unauthorizedRedirect} replace />;
  }

  return element;
};

/**
 * HOC para proteger componentes com permissões
 * 
 * @example
 * const ProtectedAdminProducts = withPermission(AdminProducts, 'products:read');
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  permission: Permission
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => {
    return (
      <ProtectedRoute
        element={<Component {...props} />}
        requiredPermission={permission}
      />
    );
  };
  
  WrappedComponent.displayName = `withPermission(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}
