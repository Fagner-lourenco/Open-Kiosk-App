/**
 * ============================================================================
 * AuthLayout - Layout para telas de autenticação
 * ============================================================================
 * 
 * Layout consistente para Login, Registro, Recuperação de senha.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { ReactNode } from 'react';
import { useTranslation } from '@/i18n';

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
      {/* Logo/Brand */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-3xl">🍺</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {title || 'Open Kiosk'}
        </h1>
        {subtitle && (
          <p className="text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        {children}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Open Kiosk</p>
        <p className="mt-1">
          {t('auth.offlineMode')}
        </p>
      </div>
    </div>
  );
}

export default AuthLayout;
