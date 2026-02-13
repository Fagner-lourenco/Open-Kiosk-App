/**
 * ============================================================================
 * Sidebar - Menu Lateral
 * ============================================================================
 *
 * Menu de navegação principal com suporte a colapso (w-64 ↔ w-16).
 * Usa contexto useSidebar para estado compartilhado com MainLayout/Header.
 * Quando colapsada, exibe tooltips nos ícones de navegação.
 *
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { useContext, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Store, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
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
import { useSidebar } from '@/hooks/useSidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

export function Sidebar() {
  const location = useLocation();
  const { isSuperAdmin, isLoading } = useFranchise();
  const { isSuperAdmin: isAuthSuperAdmin } = useAuth();
  const permissionContext = useContext(PermissionContext);
  const { collapsed, toggle } = useSidebar();
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
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 hidden overflow-hidden transition-all duration-300 lg:flex lg:flex-col',
          'bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-foreground))]',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center',
            collapsed ? 'justify-center px-2 py-5' : 'gap-3 px-5 py-5',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-primary))]">
            <Store className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">Open Kiosk</h2>
              <p className="text-[11px] text-[hsl(var(--sidebar-muted-foreground))]">Admin v1.0.0</p>
            </div>
          )}
        </div>

        {/* Franchise Selector — hidden when collapsed */}
        {!collapsed && <FranchiseStoreSelector />}

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto scrollbar-thin space-y-0.5', collapsed ? 'p-2 mt-2' : 'px-3 py-3')}>
          {isPermissionLoading && !collapsed && (
            <p className="px-3 py-2 text-[11px] text-[hsl(var(--sidebar-muted-foreground))]" role="status" aria-live="polite">
              Carregando permissões...
            </p>
          )}

          {visibleNavItems.map((item) => {
            const isActive =
              location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);

            const linkContent = (
              <NavLink
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center rounded-md text-[13px] font-medium transition-all duration-150',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'bg-[hsl(var(--sidebar-accent))] text-white'
                    : 'text-[hsl(var(--sidebar-muted-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white',
                )}
              >
                <item.icon
                  className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-[hsl(var(--sidebar-primary))]' : '')}
                />
                {!collapsed && item.label}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}

          {/* Super Admin Menu Item */}
          {(isSuperAdmin || isAuthSuperAdmin) && (() => {
            const superAdminLink = (
              <NavLink
                to={SUPER_ADMIN_NAV_ITEM.href}
                className={cn(
                  'flex items-center rounded-md text-[13px] font-medium transition-all duration-150',
                  collapsed
                    ? 'mt-3 justify-center border-t border-[hsl(var(--sidebar-border))] px-2 pt-3 pb-2'
                    : 'mt-3 gap-3 border-t border-[hsl(var(--sidebar-border))] px-3 pt-3 pb-2',
                  location.pathname.startsWith('/superadmin')
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-purple-400 hover:bg-purple-500/10 hover:text-purple-300',
                )}
              >
                <SuperAdminIcon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0',
                    location.pathname.startsWith('/superadmin') ? 'text-purple-400' : 'text-purple-500',
                  )}
                />
                {!collapsed && SUPER_ADMIN_NAV_ITEM.label}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{superAdminLink}</TooltipTrigger>
                  <TooltipContent side="right">{SUPER_ADMIN_NAV_ITEM.label}</TooltipContent>
                </Tooltip>
              );
            }

            return superAdminLink;
          })()}
        </nav>

        {/* Toggle Button — bottom */}
        <div
          className={cn(
            'border-t border-[hsl(var(--sidebar-border))] flex w-full',
            collapsed ? 'justify-center p-2' : 'px-3 py-2',
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                className="h-8 w-8 text-[hsl(var(--sidebar-muted-foreground))] hover:text-white hover:bg-[hsl(var(--sidebar-accent))]"
                aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? 'Expandir (Ctrl+B)' : 'Recolher (Ctrl+B)'}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
