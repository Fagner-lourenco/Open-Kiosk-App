import type { Permission } from '@/types/franchise';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Settings,
  Shield,
  Store,
  UsersRound,
} from 'lucide-react';

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: Permission;
}

// In production keep disabled by default; enable in staging with env var.
export const ENABLE_PERMISSION_FILTERED_NAV =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PERMISSION_FILTERED_NAV === 'true';

export const PRIMARY_NAV_ITEMS: AdminNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Lojas', href: '/stores', icon: Store },
  { label: 'Equipe', href: '/team', icon: UsersRound, requiredPermission: 'users:read' },
  { label: 'Relatorios', href: '/reports', icon: BarChart3, requiredPermission: 'reports:read' },
  { label: 'Auditoria', href: '/audit', icon: ClipboardList, requiredPermission: 'audit:read' },
  { label: 'Planos', href: '/billing', icon: CreditCard, requiredPermission: 'billing:read' },
  { label: 'Configuracoes', href: '/settings', icon: Settings, requiredPermission: 'settings:read' },
];

export const SUPER_ADMIN_NAV_ITEM: AdminNavItem = {
  label: 'Super Admin',
  href: '/superadmin',
  icon: Shield,
};
