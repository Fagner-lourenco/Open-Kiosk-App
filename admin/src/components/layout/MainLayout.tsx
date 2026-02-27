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

import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SidebarProvider, useSidebar } from '@/hooks/useSidebar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { PushNotificationBanner } from '@/components/PushNotificationBanner';

function LayoutContent() {
  const { collapsed } = useSidebar();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-muted safe-top safe-right">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className={cn('transition-all duration-300', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        {/* Push Notification Banner */}
        <PushNotificationBanner
          franchiseId={user?.claims?.franchiseId ?? undefined}
          userId={user?.uid}
        />

        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="p-4 sm:p-6 safe-bottom">
          <Suspense fallback={
            <div className="min-h-[300px] flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          }>
            <Outlet />
          </Suspense>
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
