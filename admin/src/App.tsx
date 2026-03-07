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
import { lazy, Suspense, useContext } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { FranchiseProvider } from '@/context/FranchiseContext';
import { PermissionProvider, PermissionContext } from '@/context/PermissionContext';
import type { Permission } from '@/types/franchise';

// Layouts (eager – sempre necessários)
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';

// Public Pages (eager – primeiro carregamento)
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage';
import { InvitePage } from '@/pages/public/InvitePage';
import { LandingPage } from '@/pages/public/LandingPage';

// ─── Lazy-loaded Protected Pages (code-split) ──────────────────────────────
const lazyNamed = <T extends Record<string, unknown>>(
  factory: () => Promise<T>,
  name: keyof T,
) => lazy(() => factory().then((m) => ({ default: m[name] as React.ComponentType })));

const DashboardPage = lazyNamed(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage');
const StoresPage = lazyNamed(() => import('@/pages/stores/StoresPage'), 'StoresPage');
const StoreCreatePage = lazyNamed(() => import('@/pages/stores/StoreCreatePage'), 'StoreCreatePage');
const StoreOverviewPage = lazyNamed(() => import('@/pages/stores/StoreOverviewPage'), 'StoreOverviewPage');
const TeamPage = lazyNamed(() => import('@/pages/team/TeamPage'), 'TeamPage');
const UserDetailPage = lazyNamed(() => import('@/pages/users/UserDetailPage'), 'UserDetailPage');
const ReportsPage = lazyNamed(() => import('@/pages/reports/ReportsPage'), 'ReportsPage');
const AuditPage = lazyNamed(() => import('@/pages/audit/AuditPage'), 'AuditPage');
const SettingsPage = lazyNamed(() => import('@/pages/settings/SettingsPage'), 'SettingsPage');
const ProfilePage = lazyNamed(() => import('@/pages/profile/ProfilePage'), 'ProfilePage');
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'));
const RankingPage = lazyNamed(() => import('@/pages/ranking/RankingPage'), 'RankingPage');
const DemandForecastPage = lazyNamed(() => import('@/pages/forecast/DemandForecastPage'), 'DemandForecastPage');
const TvDashboardPage = lazyNamed(() => import('@/pages/ranking/TvDashboardPage'), 'TvDashboardPage');

// Store sub-pages (lazy barrel)
const StoreSubPages = () => import('@/pages/stores/StoreSubPages');
const StoreOrdersPage = lazyNamed(StoreSubPages, 'StoreOrdersPage');
const StoreOperationsPage = lazyNamed(StoreSubPages, 'StoreOperationsPage');
const StoreKegsPage = lazyNamed(StoreSubPages, 'StoreKegsPage');
const StoreWastagePage = lazyNamed(StoreSubPages, 'StoreWastagePage');
const StoreMaintenancePage = lazyNamed(StoreSubPages, 'StoreMaintenancePage');
const StoreProductsPage = lazyNamed(StoreSubPages, 'StoreProductsPage');
const StoreInventoryPage = lazyNamed(StoreSubPages, 'StoreInventoryPage');
const StoreMembersPage = lazyNamed(StoreSubPages, 'StoreMembersPage');
const StoreReportsPage = lazyNamed(StoreSubPages, 'StoreReportsPage');
const StoreSettingsPage = lazyNamed(StoreSubPages, 'StoreSettingsPage');
const CommercialPipelinePage = lazyNamed(StoreSubPages, 'CommercialPipelinePage');
const CommercialCalendarPage = lazyNamed(StoreSubPages, 'CommercialCalendarPage');
const CommercialEventsPage = lazyNamed(StoreSubPages, 'CommercialEventsPage');
const CommercialCustomersPage = lazyNamed(StoreSubPages, 'CommercialCustomersPage');
const CommercialQuotesPage = lazyNamed(StoreSubPages, 'CommercialQuotesPage');
const CommercialActivitiesPage = lazyNamed(StoreSubPages, 'CommercialActivitiesPage');
const CommercialCustomerDetailPage = lazyNamed(StoreSubPages, 'CommercialCustomerDetailPage');
const FinanceOverviewPage = lazyNamed(StoreSubPages, 'FinanceOverviewPage');
const FinanceARPage = lazyNamed(StoreSubPages, 'FinanceARPage');
const FinanceAPPage = lazyNamed(StoreSubPages, 'FinanceAPPage');
const FinanceCashPage = lazyNamed(StoreSubPages, 'FinanceCashPage');
const FinancePaymentsPage = lazyNamed(StoreSubPages, 'FinancePaymentsPage');
const FinanceReportsPage = lazyNamed(StoreSubPages, 'FinanceReportsPage');
const FinanceSettingsPage = lazyNamed(StoreSubPages, 'FinanceSettingsPage');

// Super Admin (lazy – default exports via barrel)
const SuperAdminDashboard = lazy(() => import('@/pages/superadmin/SuperAdminDashboard'));
const FranchisesPage = lazy(() => import('@/pages/superadmin/FranchisesPage'));
const CreateFranchisePage = lazy(() => import('@/pages/superadmin/CreateFranchisePage'));
const FranchiseDetailPage = lazy(() => import('@/pages/superadmin/FranchiseDetailPage'));

// StoreLayout permanece eager (layout de outlet)
import { StoreLayout } from '@/components/store/StoreLayout';

/** Suspense fallback spinner */
function PageSpinner() {
  return (
    <div className="min-h-[300px] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

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

  // ADM-01 fix: fail-closed — se contexto não disponível, bloqueia acesso
  if (!permissionContext) {
    console.warn('[PermissionGuard] PermissionContext not available, blocking access (fail-closed)');
    return null; // Renderiza nada enquanto contexto carrega
  }

  const { can, canAll, canAny } = permissionContext;

  // Verifica permissão única
  if (requiredPermission && !can(requiredPermission)) {
    if (import.meta.env.DEV) {
      console.debug('[PermissionGuard] Rota protegida - sem permissão:', requiredPermission);
    }
    return <Navigate to="/dashboard" replace />;
  }

  // Verifica múltiplas permissões (AND)
  if (requiredPermissions && !canAll(requiredPermissions)) {
    if (import.meta.env.DEV) {
      console.debug('[PermissionGuard] Rota protegida - faltam permissões:', requiredPermissions);
    }
    return <Navigate to="/dashboard" replace />;
  }

  // Verifica pelo menos uma permissão (OR)
  if (anyPermission && !canAny(anyPermission)) {
    if (import.meta.env.DEV) {
      console.debug('[PermissionGuard] Rota protegida - nenhuma permissão válida:', anyPermission);
    }
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
          <Route path="/invite/:token" element={<InvitePage />} />
        </Route>

        {/* Ranking Display Público (TV / Projetor) — SEM autenticação */}
        <Route path="/ranking/display/:storeId" element={<Suspense fallback={<PageSpinner />}><TvDashboardPage /></Suspense>} />

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
          <Route path="stores/:storeId" element={<StoreLayout />}>
            <Route index element={<StoreOverviewPage />} />
            <Route path="orders" element={<StoreOrdersPage />} />
            <Route path="operations" element={<StoreOperationsPage />} />
            <Route path="kegs" element={<StoreKegsPage />} />
            <Route path="wastage" element={<StoreWastagePage />} />
            <Route path="maintenance" element={<StoreMaintenancePage />} />
            <Route path="products" element={<StoreProductsPage />} />
            <Route path="inventory" element={<StoreInventoryPage />} />
            <Route path="members" element={<StoreMembersPage />} />
            <Route path="reports" element={<StoreReportsPage />} />
            <Route path="settings" element={<StoreSettingsPage />} />
            {/* Comercial (CRM) */}
            <Route path="commercial/pipeline" element={<CommercialPipelinePage />} />
            <Route path="commercial/calendar" element={<CommercialCalendarPage />} />
            <Route path="commercial/events" element={<CommercialEventsPage />} />
            <Route path="commercial/customers" element={<CommercialCustomersPage />} />
            <Route path="commercial/customers/:customerId" element={<CommercialCustomerDetailPage />} />
            <Route path="commercial/quotes" element={<CommercialQuotesPage />} />
            <Route path="commercial/activities" element={<CommercialActivitiesPage />} />
            {/* Financeiro */}
            <Route path="finance/overview" element={<FinanceOverviewPage />} />
            <Route path="finance/ar" element={<FinanceARPage />} />
            <Route path="finance/ap" element={<FinanceAPPage />} />
            <Route path="finance/cash" element={<FinanceCashPage />} />
            <Route path="finance/payments" element={<FinancePaymentsPage />} />
            <Route path="finance/reports" element={<FinanceReportsPage />} />
            <Route path="finance/settings" element={<FinanceSettingsPage />} />
          </Route>

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

          {/* Ranking, TV Dashboard, Desafios & Prêmios — aceita reports:read OU settings:read */}
          <Route path="ranking" element={
            <PermissionGuard anyPermission={['reports:read', 'settings:read']}>
              <RankingPage />
            </PermissionGuard>
          } />

          {/* Previsão de demanda — requer permissão de relatórios */}
          <Route path="forecast" element={
            <PermissionGuard requiredPermission="reports:read">
              <DemandForecastPage />
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
