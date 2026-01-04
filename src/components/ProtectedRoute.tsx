import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

/**
 * Componente que protege rotas administrativas
 * Redireciona para "/" se não autenticado
 */

interface ProtectedRouteProps {
  element: React.ReactElement;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ element }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Acesso negado - redirecionando para /');
    return <Navigate to="/" replace />;
  }

  return element;
};
