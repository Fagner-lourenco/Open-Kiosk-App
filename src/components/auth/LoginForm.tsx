/**
 * ============================================================================
 * LoginForm - Formulário de Login com Email/Senha
 * ============================================================================
 * 
 * Formulário de autenticação Firebase Auth.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

interface LoginFormProps {
  onSwitchToPin?: () => void;
  onForgotPassword?: () => void;
  redirectTo?: string;
}

export function LoginForm({ 
  onSwitchToPin, 
  onForgotPassword,
  redirectTo = '/admin' 
}: LoginFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginWithEmail, isLoading, authError, clearAuthError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setIsSubmitting(true);

    try {
      const result = await loginWithEmail(email, password);
      
      if (result.success) {
        // Salvar preferência de "lembrar-me"
        if (rememberMe) {
          localStorage.setItem('rememberEmail', email);
        } else {
          localStorage.removeItem('rememberEmail');
        }
        
        navigate(redirectTo);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carregar email salvo
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberEmail');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const loading = isLoading || isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Título */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {t('auth.signIn')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('auth.signInSubtitle')}
        </p>
      </div>

      {/* Erro */}
      {authError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      )}

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">{t('auth.email')}</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            required
            disabled={loading}
            autoComplete="email"
          />
        </div>
      </div>

      {/* Senha */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('auth.password')}</Label>
          {onForgotPassword && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {t('auth.forgotPassword')}
            </button>
          )}
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 pr-10"
            required
            disabled={loading}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Lembrar-me */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="remember"
          checked={rememberMe}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
          disabled={loading}
        />
        <label
          htmlFor="remember"
          className="text-sm text-gray-600 cursor-pointer"
        >
          {t('auth.rememberMe')}
        </label>
      </div>

      {/* Botão Submit */}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('auth.signingIn')}
          </>
        ) : (
          t('auth.signIn')
        )}
      </Button>

      {/* Divisor */}
      {onSwitchToPin && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">
                {t('auth.or')}
              </span>
            </div>
          </div>

          {/* Botão PIN */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onSwitchToPin}
            disabled={loading}
          >
            {t('auth.usePin')}
          </Button>
        </>
      )}
    </form>
  );
}

export default LoginForm;
