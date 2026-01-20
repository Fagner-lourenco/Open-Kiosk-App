/**
 * ============================================================================
 * AuthLayout - Layout de Autenticação
 * ============================================================================
 * 
 * Layout para páginas públicas (login, registro, etc).
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { Outlet } from 'react-router-dom';
import { Store } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-lg mb-4">
            <Store className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Open Kiosk Admin</h1>
          <p className="text-gray-500 mt-1">Portal de Gestão de Franquias</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-6">
          © 2026 Open Kiosk Project
        </p>
      </div>
    </div>
  );
}
