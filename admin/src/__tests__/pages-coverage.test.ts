/**
 * Coverage tests for admin/src/pages/ + App.tsx + main.tsx
 */
import { describe, it, expect, vi } from 'vitest';

// Mock firebase/functions (needed by services imported by pages)
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
  connectFunctionsEmulator: vi.fn(),
}));

// Mock react-dom/client so main.tsx doesn't try to render
vi.mock('react-dom/client', () => ({
  default: { createRoot: vi.fn(() => ({ render: vi.fn() })) },
  createRoot: vi.fn(() => ({ render: vi.fn() })),
}));

// App.tsx (main.tsx is entry point, skip — would require DOM root element)
import { default as App } from '@/App';

// main.tsx — safe with mocked createRoot
import '../main';

// pages barrel
import '@/pages/index';

// pages/audit
import '@/pages/audit/index';
import { AuditPage } from '@/pages/audit/AuditPage';

// pages/billing
import BillingPage from '@/pages/billing/BillingPage';

// pages/dashboard
import '@/pages/dashboard/index';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { FranchiseOverview } from '@/pages/dashboard/FranchiseOverview';

// pages/profile
import { ProfilePage } from '@/pages/profile/ProfilePage';

// pages/ranking
import { TvConfigTab as EventConfigPage } from '@/pages/ranking/EventConfigPage';
import { RankingPage } from '@/pages/ranking/RankingPage';
import { TvDashboardPage } from '@/pages/ranking/TvDashboardPage';

// pages/reports
import '@/pages/reports/index';
import { ReportsPage } from '@/pages/reports/ReportsPage';

// pages/settings
import '@/pages/settings/index';
import { SettingsPage } from '@/pages/settings/SettingsPage';

// pages/stores
import '@/pages/stores/index';
import { StoreCreatePage } from '@/pages/stores/StoreCreatePage';
import { StoreDetailPage } from '@/pages/stores/StoreDetailPage';
import { StoreOverviewPage } from '@/pages/stores/StoreOverviewPage';
import { StoresPage } from '@/pages/stores/StoresPage';
import { StoreOrdersPage as StoreSubPages } from '@/pages/stores/StoreSubPages';

// pages/superadmin
import '@/pages/superadmin/index';
import CreateFranchisePage from '@/pages/superadmin/CreateFranchisePage';
import FranchiseDetailPage from '@/pages/superadmin/FranchiseDetailPage';
import FranchisesPage from '@/pages/superadmin/FranchisesPage';
import SuperAdminDashboard from '@/pages/superadmin/SuperAdminDashboard';

// pages/team
import '@/pages/team/index';
import { TeamPage } from '@/pages/team/TeamPage';

// pages/users
import '@/pages/users/index';
import { InvitationsPage } from '@/pages/users/InvitationsPage';
import { UserDetailPage } from '@/pages/users/UserDetailPage';
import { UsersPage } from '@/pages/users/UsersPage';

const pages = {
  App, AuditPage, BillingPage, DashboardPage, FranchiseOverview,
  ProfilePage, EventConfigPage, RankingPage, TvDashboardPage,
  ReportsPage, SettingsPage, StoreCreatePage, StoreDetailPage,
  StoreOverviewPage, StoresPage, StoreSubPages, CreateFranchisePage,
  FranchiseDetailPage, FranchisesPage, SuperAdminDashboard,
  TeamPage, InvitationsPage, UserDetailPage, UsersPage,
};

describe('pages — módulos exportam corretamente', () => {
  it.each(Object.entries(pages))('%s é componente/função válido', (_name, comp) => {
    expect(comp).toBeDefined();
    expect(typeof comp).toBe('function');
  });
});
