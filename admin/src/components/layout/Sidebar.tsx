/**
 * ============================================================================
 * Sidebar - Menu Lateral
 * ============================================================================
 * 
 * Menu de navegação principal.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Store,
  UsersRound,
  BarChart3,
  ClipboardList,
  Settings,
  Shield,
  CreditCard,
} from 'lucide-react';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { FranchiseStoreSelector } from './FranchiseStoreSelector';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Lojas', href: '/stores', icon: Store },
  { label: 'Equipe', href: '/team', icon: UsersRound },
  { label: 'Relatórios', href: '/reports', icon: BarChart3 },
  { label: 'Auditoria', href: '/audit', icon: ClipboardList },
  { label: 'Planos', href: '/billing', icon: CreditCard },
  { label: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { isSuperAdmin } = useFranchise();
  const { isSuperAdmin: isAuthSuperAdmin } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 bg-white border-r border-gray-200 lg:block">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Store className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            Open Kiosk Admin
          </h2>
          <p className="text-xs text-gray-500">v1.0.0</p>
        </div>
      </div>

      {/* Franchise Selector */}
      <FranchiseStoreSelector />

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = item.href === '/' 
            ? location.pathname === '/'
            : location.pathname.startsWith(item.href);

          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <item.icon className={cn(
                'h-5 w-5',
                isActive ? 'text-blue-600' : 'text-gray-400'
              )} />
              {item.label}
            </NavLink>
          );
        })}

        {/* Super Admin Menu Item */}
        {(isSuperAdmin || isAuthSuperAdmin) && (
          <NavLink
            to="/superadmin"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mt-4 border-t border-gray-100 pt-4',
              location.pathname === '/superadmin'
                ? 'bg-purple-50 text-purple-700'
                : 'text-purple-600 hover:bg-purple-50 hover:text-purple-900'
            )}
          >
            <Shield className={cn(
              'h-5 w-5',
              location.pathname === '/superadmin' ? 'text-purple-600' : 'text-purple-400'
            )} />
            Super Admin
          </NavLink>
        )}
      </nav>
    </aside>
  );
}
