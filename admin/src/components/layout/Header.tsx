/**
 * ============================================================================
 * Header - Cabeçalho
 * ============================================================================
 * 
 * Cabeçalho com busca, notificações e menu do usuário.
 * Inclui menu mobile via Sheet.
 * 
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
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
  LayoutDashboard,
  Store,
  UsersRound,
  BarChart3,
  ClipboardList,
  Shield,
} from 'lucide-react';
import { NotificationCenter } from '@/components/NotificationCenter';

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Lojas', href: '/stores', icon: Store },
  { label: 'Equipe', href: '/team', icon: UsersRound },
  { label: 'Relatórios', href: '/reports', icon: BarChart3 },
  { label: 'Auditoria', href: '/audit', icon: ClipboardList },
  { label: 'Configurações', href: '/settings', icon: Settings },
];

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isSuperAdmin } = useAuth();
  const { currentFranchise } = useFranchise();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between h-16 px-6">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="search"
                placeholder="Buscar..."
                className="pl-10 bg-gray-50 border-gray-200"
              />
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* Notifications - Novo componente integrado */}
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
                    <p className="text-sm font-medium text-gray-900">
                      {user?.displayName || 'Usuário'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {user?.email}
                    </p>
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
                  Configurações
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
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Store className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-semibold">Open Kiosk Admin</span>
            </SheetTitle>
          </SheetHeader>
          
          {/* Franchise Info */}
          {currentFranchise && (
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 mb-0.5">Franquia</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentFranchise.name}
              </p>
            </div>
          )}

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
                  onClick={() => setIsMobileMenuOpen(false)}
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

            {/* Super Admin */}
            {isSuperAdmin && (
              <NavLink
                to="/superadmin"
                onClick={() => setIsMobileMenuOpen(false)}
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
        </SheetContent>
      </Sheet>
    </>
  );
}
