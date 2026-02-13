/**
 * ============================================================================
 * Header - Cabecalho
 * ============================================================================
 *
 * Cabecalho com busca, notificacoes e menu do usuario.
 * Inclui menu mobile via Sheet.
 *
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { useContext, useMemo, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import { PermissionContext } from '@/context/PermissionContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Search,
  Menu,
  LogOut,
  Settings,
  User,
  Store,
} from 'lucide-react';
import { NotificationCenter } from '@/components/NotificationCenter';
import {
  ENABLE_PERMISSION_FILTERED_NAV,
  PRIMARY_NAV_ITEMS,
  SUPER_ADMIN_NAV_ITEM,
} from '@/config/navConfig';

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isSuperAdmin } = useAuth();
  const { currentFranchise, isLoading } = useFranchise();
  const permissionContext = useContext(PermissionContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials =
    user?.displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="flex items-center justify-between h-16 px-6">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Abrir menu de navegacao"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar..."
                className="border-border bg-muted pl-10"
              />
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <NotificationCenter />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.photoURL || undefined} />
                    <AvatarFallback className="bg-blue-100 text-blue-700">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-foreground">
                      {user?.displayName || 'Usuario'}
                    </p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Meu Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configuracoes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Menu Sheet */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Store className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold">Open Kiosk Admin</span>
            </SheetTitle>
          </SheetHeader>

          {/* Franchise Info */}
          {currentFranchise && (
            <div className="border-b border-border bg-muted px-4 py-3">
              <p className="mb-0.5 text-xs text-muted-foreground">Franquia</p>
              <p className="truncate text-sm font-medium text-foreground">
                {currentFranchise.name}
              </p>
            </div>
          )}

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
                  onClick={() => setIsMobileMenuOpen(false)}
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

            {/* Super Admin */}
            {isSuperAdmin && (
              <NavLink
                to={SUPER_ADMIN_NAV_ITEM.href}
                onClick={() => setIsMobileMenuOpen(false)}
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
        </SheetContent>
      </Sheet>
    </>
  );
}
