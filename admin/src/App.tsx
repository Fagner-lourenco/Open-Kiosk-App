/**
 * ============================================================================
 * Open Kiosk Admin - App Principal
 * ============================================================================
 * 
 * Aplicação web para gestão de franquias e lojas.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { FranchiseProvider } from '@/context/FranchiseContext';
import { PermissionProvider, PermissionContext } from '@/context/PermissionContext';
import type { Permission } from '@/types/franchise';

// Layouts
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';

// Public Pages
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage';
import { InvitePage } from '@/pages/public/InvitePage';
import { LandingPage } from '@/pages/public/LandingPage';

// Protected Pages
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { StoresPage } from '@/pages/stores/StoresPage';
import { StoreDetailPage } from '@/pages/stores/StoreDetailPage';
import { StoreCreatePage } from '@/pages/stores/StoreCreatePage';
import { TeamPage } from '@/pages/team/TeamPage';
import { UserDetailPage } from '@/pages/users/UserDetailPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { AuditPage } from '@/pages/audit/AuditPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import BillingPage from '@/pages/billing/BillingPage';

// Super Admin Pages
import { 
  SuperAdminDashboard,
  FranchisesPage,
  CreateFranchisePage,
  FranchiseDetailPage,
} from '@/pages/superadmin';

/**
 * Componente de rota protegida - apenas verifica autenticação
 * NÃO verifica permissões aqui - isso é feito depois que os providers estão montados
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: Permission;
  requiredPermissions?: Permission[];
  anyPermission?: Permission[];
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Apenas retorna children - verificação de permissão é feita pelo PermissionGuard 
  // que está DENTRO do PermissionProvider
  return <>{children}</>;
}

/**
 * Guard de permissões (deve estar dentro de PermissionProvider)
 */
function PermissionGuard({ 
  children, 
  requiredPermission,
  requiredPermissions,
  anyPermission,
}: ProtectedRouteProps) {
  const permissionContext = useContext(PermissionContext);
  
  // Se não tiver contexto de permissão, permite (fallback seguro para evitar crash)
  // Isso pode acontecer durante loading inicial
  if (!permissionContext) {
    console.warn('[PermissionGuard] PermissionContext not available, allowing access');
    return <>{children}</>;
  }
  
  const { can, canAll, canAny } = permissionContext;
  
  // Verifica permissão única
  if (requiredPermission && !can(requiredPermission)) {
    console.warn('[ProtectedRoute] Acesso negado - sem permissão:', requiredPermission);
    return <Navigate to="/dashboard" replace />;
  }
  
  // Verifica múltiplas permissões (AND)
  if (requiredPermissions && !canAll(requiredPermissions)) {
    console.warn('[ProtectedRoute] Acesso negado - faltam permissões:', requiredPermissions);
    return <Navigate to="/dashboard" replace />;
  }
  
  // Verifica pelo menos uma permissão (OR)
  if (anyPermission && !canAny(anyPermission)) {
    console.warn('[ProtectedRoute] Acesso negado - nenhuma permissão válida:', anyPermission);
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

/**
 * Componente de rota protegida apenas para Super Admin
 */
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSuperAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/**
 * Componente de rota pública (redireciona se logado)
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Componente de rota raiz - mostra Landing ou redireciona para Dashboard
 */
function RootRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Usuário logado -> Dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Visitante -> Landing Page
  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Rota Raiz - Landing ou Dashboard */}
        <Route path="/" element={<RootRoute />} />
        
        {/* Rotas Públicas */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route path="/invite" element={<InvitePage />} />
        </Route>

        {/* Rotas Protegidas */}
        <Route
          element={
            <ProtectedRoute>
              <FranchiseProvider>
                <PermissionProvider>
                  <MainLayout />
                </PermissionProvider>
              </FranchiseProvider>
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          
          {/* Lojas */}
          <Route path="stores" element={<StoresPage />} />
          <Route path="stores/new" element={<SuperAdminRoute><StoreCreatePage /></SuperAdminRoute>} />
          <Route path="stores/:storeId" element={<StoreDetailPage />} />
          
          {/* Equipe - requer permissão de gestão de usuários */}
          <Route path="team" element={
            <PermissionGuard requiredPermission="users:read">
              <TeamPage />
            </PermissionGuard>
          } />
          <Route path="team/:userId" element={
            <PermissionGuard requiredPermission="users:read">
              <UserDetailPage />
            </PermissionGuard>
          } />
          
          {/* Redirects para compatibilidade */}
          <Route path="users" element={<Navigate to="/team" replace />} />
          <Route path="users/:userId" element={<Navigate to="/team" replace />} />
          <Route path="invitations" element={<Navigate to="/team?tab=invitations" replace />} />
          
          {/* Relatórios - requer permissão de relatórios */}
          <Route path="reports" element={
            <PermissionGuard requiredPermission="reports:read">
              <ReportsPage />
            </PermissionGuard>
          } />
          
          {/* Auditoria - requer permissão de auditoria */}
          <Route path="audit" element={
            <PermissionGuard requiredPermission="audit:read">
              <AuditPage />
            </PermissionGuard>
          } />
          
          {/* Configurações - requer permissão de configurações */}
          <Route path="settings" element={
            <PermissionGuard requiredPermission="settings:read">
              <SettingsPage />
            </PermissionGuard>
          } />
          
          {/* Perfil / Minha Conta - todos podem ver seu próprio perfil */}
          <Route path="profile" element={<ProfilePage />} />
          
          {/* Faturamento - requer permissão de billing */}
          <Route path="billing" element={
            <PermissionGuard requiredPermission="billing:read">
              <BillingPage />
            </PermissionGuard>
          } />
          
          {/* Super Admin */}
          <Route path="superadmin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
          <Route path="superadmin/franchises" element={<SuperAdminRoute><FranchisesPage /></SuperAdminRoute>} />
          <Route path="superadmin/franchises/new" element={<SuperAdminRoute><CreateFranchisePage /></SuperAdminRoute>} />
          <Route path="superadmin/franchises/:franchiseId" element={<SuperAdminRoute><FranchiseDetailPage /></SuperAdminRoute>} />
          <Route path="superadmin/franchises/:franchiseId/edit" element={<SuperAdminRoute><FranchiseDetailPage /></SuperAdminRoute>} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
