/**
 * ============================================================================
 * MainLayout - Layout Principal
 * ============================================================================
 * 
 * Layout com sidebar recolhível e header para páginas autenticadas.
 * 
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SidebarProvider, useSidebar } from '@/hooks/useSidebar';
import { cn } from '@/lib/utils';

function LayoutContent() {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-muted safe-top safe-right">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className={cn('transition-all duration-300', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="p-4 sm:p-6 safe-bottom">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function MainLayout() {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
}
