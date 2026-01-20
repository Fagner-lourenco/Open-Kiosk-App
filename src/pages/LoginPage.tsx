/**
 * ============================================================================
 * LoginPage - Página de Login
 * ============================================================================
 * 
 * Página completa de autenticação com suporte a:
 * - Email/Senha (Firebase Auth)
 * - PIN (Offline fallback)
 * - Recuperação de senha
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { isFranchiseMode } from '@/lib/pathResolver';
import { AuthLayout, LoginForm, LoginWithPin, ForgotPassword } from '@/components/auth';

type AuthView = 'email' | 'pin' | 'forgot';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();

  const [view, setView] = useState<AuthView>('email');

  // Redirect se já logado
  const from = (location.state as { from?: string })?.from || '/admin';
  
  useEffect(() => {
    if (user && !isLoading) {
      navigate(from, { replace: true });
    }
  }, [user, isLoading, navigate, from]);

  // Se não está em modo franquia, redirecionar para admin (usa PIN legado)
  useEffect(() => {
    if (!isFranchiseMode()) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  // Loading
  if (isLoading) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AuthLayout>
    );
  }

  // Já logado (aguardando redirect)
  if (user) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AuthLayout>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'pin':
        return (
          <LoginWithPin
            onSwitchToEmail={() => setView('email')}
            redirectTo={from}
          />
        );
      
      case 'forgot':
        return (
          <ForgotPassword
            onBack={() => setView('email')}
          />
        );
      
      case 'email':
      default:
        return (
          <LoginForm
            onSwitchToPin={() => setView('pin')}
            onForgotPassword={() => setView('forgot')}
            redirectTo={from}
          />
        );
    }
  };

  return (
    <AuthLayout>
      {renderView()}
    </AuthLayout>
  );
}

export default LoginPage;
