/**
 * ============================================================================
 * MainLayout - Layout Principal
 * ============================================================================
 * 
 * Layout com sidebar e header para páginas autenticadas.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
