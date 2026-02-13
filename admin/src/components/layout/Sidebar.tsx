/**
 * ============================================================================
 * Sidebar - Menu Lateral
 * ============================================================================
 *
 * Menu de navegacao principal.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useContext, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { PermissionContext } from '@/context/PermissionContext';
import { cn } from '@/lib/utils';
import {
  ENABLE_PERMISSION_FILTERED_NAV,
  PRIMARY_NAV_ITEMS,
  SUPER_ADMIN_NAV_ITEM,
} from '@/config/navConfig';
import { FranchiseStoreSelector } from './FranchiseStoreSelector';

export function Sidebar() {
  const location = useLocation();
  const { isSuperAdmin, isLoading } = useFranchise();
  const { isSuperAdmin: isAuthSuperAdmin } = useAuth();
  const permissionContext = useContext(PermissionContext);
  const SuperAdminIcon = SUPER_ADMIN_NAV_ITEM.icon;

  const visibleNavItems = useMemo(() => {
    if (!ENABLE_PERMISSION_FILTERED_NAV) return PRIMARY_NAV_ITEMS;
    if (!permissionContext) return PRIMARY_NAV_ITEMS;

    return PRIMARY_NAV_ITEMS.filter(
      (item) => !item.requiredPermission || permissionContext.can(item.requiredPermission),
    );
  }, [permissionContext]);

  const isPermissionLoading =
    ENABLE_PERMISSION_FILTERED_NAV && (isLoading || !permissionContext);

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-border bg-card lg:block">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Store className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">Open Kiosk Admin</h2>
          <p className="text-xs text-muted-foreground">v1.0.0</p>
        </div>
      </div>

      {/* Franchise Selector */}
      <FranchiseStoreSelector />

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        {isPermissionLoading && (
          <p className="px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            Carregando permissoes...
          </p>
        )}

        {visibleNavItems.map((item) => {
          const isActive =
            location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);

          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon
                className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')}
              />
              {item.label}
            </NavLink>
          );
        })}

        {/* Super Admin Menu Item */}
        {(isSuperAdmin || isAuthSuperAdmin) && (
          <NavLink
            to={SUPER_ADMIN_NAV_ITEM.href}
            className={cn(
              'mt-4 flex items-center gap-3 rounded-lg border-t border-border/60 px-3 pt-4 pb-2 text-sm font-medium transition-colors',
              location.pathname.startsWith('/superadmin')
                ? 'bg-purple-50 text-purple-700'
                : 'text-purple-600 hover:bg-purple-50 hover:text-purple-900',
            )}
          >
            <SuperAdminIcon
              className={cn(
                'h-5 w-5',
                location.pathname.startsWith('/superadmin') ? 'text-purple-600' : 'text-purple-400',
              )}
            />
            {SUPER_ADMIN_NAV_ITEM.label}
          </NavLink>
        )}
      </nav>
    </aside>
  );
}
