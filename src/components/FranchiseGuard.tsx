/**
 * ============================================================================
 * FranchiseGuard - Proteção de Rotas para Modo Franchise
 * ============================================================================
 * 
 * Componente que protege rotas no modo franchise, verificando:
 * 1. Autenticação (Firebase Auth)
 * 2. Seleção de franquia/loja
 * 
 * Features:
 * - Auto-seleção de loja única
 * - Persistência em localStorage
 * - Redirecionamento para /login ou /store-select
 * - Modo kiosk: vai direto para /shop após auth + seleção
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFranchiseSafe } from '@/context/FranchiseContext';
import { Loader2, Store } from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

interface FranchiseGuardProps {
  children: ReactNode;
  /** 
   * Se true, requer autenticação. Default: true 
   */
  requireAuth?: boolean;
  /** 
   * Se true, requer loja selecionada. Default: true 
   */
  requireStore?: boolean;
  /**
   * Rota para redirecionar se não autenticado. Default: '/login'
   */
  loginRedirect?: string;
  /**
   * Rota para redirecionar se não tem loja. Default: '/store-select'
   */
  storeSelectRedirect?: string;
  /**
   * Se true, redireciona para /shop ao invés de mostrar conteúdo (modo kiosk)
   */
  kioskMode?: boolean;
}

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
          <Store className="w-8 h-8 text-blue-600" />
        </div>
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-gray-600 text-center">Carregando...</p>
      </div>
    </div>
  );
}

// ============================================================================
// FRANCHISE GUARD COMPONENT
// ============================================================================

export function FranchiseGuard({
  children,
  requireAuth = true,
  requireStore = true,
  loginRedirect = '/login',
  storeSelectRedirect = '/store-select',
  kioskMode = false,
}: FranchiseGuardProps) {
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  
  // useFranchise pode não existir se não está dentro do provider
  const franchiseContext = useFranchiseSafe();
  
  const [autoSelectAttempted, setAutoSelectAttempted] = useState(false);

  const {
    currentStore = null,
    userStores = [],
    isLoading: franchiseLoading = false,
    selectStore,
  } = franchiseContext || {};

  // Considera loading se auth OU franchise (se existir) ainda estão carregando
  const isLoading = authLoading || franchiseLoading;

  // ==========================================================================
  // AUTO-SELECT SINGLE STORE
  // ==========================================================================

  useEffect(() => {
    // Se já tentou auto-selecionar, não tenta de novo
    if (autoSelectAttempted) return;

    // Se ainda está carregando, espera
    if (isLoading) return;

    // Se não está autenticado, não faz nada
    if (!user) return;

    // Se já tem loja selecionada, não faz nada
    if (currentStore) return;

    // Se tem apenas 1 loja, seleciona automaticamente
    if (userStores && userStores.length === 1 && selectStore) {
      console.log('[FranchiseGuard] Auto-selecionando loja única:', userStores[0].storeName);
      setAutoSelectAttempted(true);
      selectStore(userStores[0].franchiseId, userStores[0].storeId).catch((err) => {
        console.error('[FranchiseGuard] Erro ao auto-selecionar loja:', err);
      });
    } else if (userStores && userStores.length > 1) {
      setAutoSelectAttempted(true);
    }
  }, [user, currentStore, userStores, isLoading, autoSelectAttempted, selectStore]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Se o contexto de franquia não está disponível, mostra loading
  // Isso pode acontecer durante a inicialização
  if (!franchiseContext) {
    console.log('[FranchiseGuard] FranchiseContext não disponível, aguardando...');
    return <LoadingScreen />;
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Mostrar loading enquanto carrega auth ou franchise
  if (isLoading) {
    return <LoadingScreen />;
  }

  // === VERIFICAÇÃO DE AUTENTICAÇÃO ===
  if (requireAuth && !user) {
    console.log('[FranchiseGuard] Não autenticado, redirecionando para:', loginRedirect);
    return <Navigate to={loginRedirect} state={{ from: location }} replace />;
  }

  // === VERIFICAÇÃO DE LOJA ===
  if (requireStore && user) {
    // Se não tem loja selecionada
    if (!currentStore) {
      // Se tem múltiplas lojas, redireciona para seleção
      if (userStores.length > 1) {
        console.log('[FranchiseGuard] Múltiplas lojas, redirecionando para:', storeSelectRedirect);
        return <Navigate to={storeSelectRedirect} state={{ from: location }} replace />;
      }
      
      // Se tem 1 loja mas ainda não foi selecionada, aguarda auto-select
      if (userStores.length === 1 && !autoSelectAttempted) {
        return <LoadingScreen />;
      }
      
      // Se não tem nenhuma loja (usuário sem acesso)
      if (userStores.length === 0) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-4 max-w-md text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <Store className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Sem acesso a lojas</h2>
              <p className="text-gray-600">
                Sua conta não tem acesso a nenhuma loja. 
                Entre em contato com o administrador.
              </p>
              <p className="text-sm text-gray-500">
                Usuário: {user?.email}
              </p>
            </div>
          </div>
        );
      }
    }
  }

  // === MODO KIOSK ===
  // Se está em modo kiosk e tentando acessar / ou /index, redireciona para /shop
  if (kioskMode && currentStore && location.pathname === '/') {
    console.log('[FranchiseGuard] Modo kiosk ativo, redirecionando para /shop');
    return <Navigate to="/shop" replace />;
  }

  // Tudo OK - renderiza children
  return <>{children}</>;
}

// ============================================================================
// EXPORT
// ============================================================================

export default FranchiseGuard;
