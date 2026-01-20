/**
 * ============================================================================
 * AcceptInvite Page - Aceitar Convite de Franquia/Loja
 * ============================================================================
 * 
 * Página para aceitar convites enviados por email.
 * URL: /invite?token=xxx
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { franchiseService } from '@/services/franchiseService';
import { useTranslation } from '@/i18n';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Mail, 
  Lock, 
  User,
  Building2,
  Store
} from 'lucide-react';
import type { PendingInvite } from '@/types/franchise';

type InviteStep = 'loading' | 'invalid' | 'register' | 'login' | 'accepting' | 'success';

/**
 * Helper para obter label do role
 */
function getRoleLabel(role: string, t: (key: string) => string): string {
  const roleKey = `roles.${role}`;
  return t(roleKey);
}

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loginWithEmail } = useAuth();

  const token = searchParams.get('token');

  const [step, setStep] = useState<InviteStep>('loading');
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isNewUser, setIsNewUser] = useState(true);

  // Validar token
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setStep('invalid');
        setError(t('invite.noToken'));
        return;
      }

      try {
        const result = await franchiseService.validateInviteToken(token);
        
        if (!result.valid || !result.invite) {
          setStep('invalid');
          setError(result.error || t('invite.invalidToken'));
          return;
        }

        setInvite(result.invite);
        setEmail(result.invite.email);

        // Se já está logado com o email do convite
        if (user && user.email === result.invite.email) {
          setStep('accepting');
          acceptInvite();
        } else if (user) {
          // Logado com outro email
          setError(t('invite.wrongEmail'));
          setStep('login');
        } else {
          // Não está logado - mostrar formulário
          setStep('register');
        }
      } catch (err) {
        console.error('Error validating invite:', err);
        setStep('invalid');
        setError(t('invite.error'));
      }
    }

    validateToken();
  }, [token, user]);

  // Aceitar convite
  const acceptInvite = async () => {
    if (!token) return;
    
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await franchiseService.acceptInvite(token);
      
      if (result.success) {
        setStep('success');
      } else {
        setError(result.error || t('invite.acceptError'));
        setStep('register');
      }
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError(t('invite.acceptError'));
      setStep('register');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Login existente
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await loginWithEmail(email, password);
      
      if (result.success) {
        // Após login, aceitar convite
        setStep('accepting');
        await acceptInvite();
      } else {
        setError(result.error || t('auth.loginError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Registrar novo usuário
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Criar conta via authService
      const { authService } = await import('@/services/authService');
      const registerResult = await authService.registerWithEmail(email, password, displayName);
      
      if (!registerResult.success) {
        setError(registerResult.error || t('auth.registerError'));
        return;
      }

      // Aceitar convite
      setStep('accepting');
      await acceptInvite();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ir para admin
  const goToAdmin = () => {
    navigate('/admin');
  };

  // Renderizar baseado no step
  const renderContent = () => {
    switch (step) {
      case 'loading':
        return (
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">
              {t('invite.validating')}
            </p>
          </div>
        );

      case 'invalid':
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t('invite.invalidTitle')}
            </h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <Button onClick={() => navigate('/login')}>
              {t('invite.goToLogin')}
            </Button>
          </div>
        );

      case 'accepting':
        return (
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">
              {t('invite.accepting')}
            </p>
          </div>
        );

      case 'success':
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t('invite.successTitle')}
            </h2>
            <p className="text-gray-500 mb-6">
              {t('invite.successDesc')}
            </p>
            
            {invite && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{invite.franchiseName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{invite.storeName}</span>
                </div>
              </div>
            )}

            <Button onClick={goToAdmin} className="w-full">
              {t('invite.goToAdmin')}
            </Button>
          </div>
        );

      case 'login':
      case 'register':
        return (
          <div className="space-y-6">
            {/* Invite Info */}
            {invite && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">
                  {t('invite.youAreInvited')}
                </h3>
                <div className="text-sm text-blue-700 space-y-1">
                  <p className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {invite.franchiseName}
                  </p>
                  <p className="flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    {invite.storeName}
                  </p>
                  <p className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {getRoleLabel(invite.role, t)}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Toggle */}
            <div className="flex gap-2">
              <Button
                variant={isNewUser ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setIsNewUser(true)}
              >
                {t('invite.newUser')}
              </Button>
              <Button
                variant={!isNewUser ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setIsNewUser(false)}
              >
                {t('invite.existingUser')}
              </Button>
            </div>

            {/* Form */}
            <form onSubmit={isNewUser ? handleRegister : handleLogin} className="space-y-4">
              {/* Name (only for new users) */}
              {isNewUser && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t('auth.name')}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder={t('auth.namePlaceholder')}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="pl-10"
                      required={isNewUser}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-gray-50"
                    required
                    disabled // Email vem do convite
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">
                  {isNewUser 
                    ? t('auth.createPassword') 
                    : t('auth.password')
                  }
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    disabled={isSubmitting}
                    minLength={6}
                  />
                </div>
                {isNewUser && (
                  <p className="text-xs text-gray-500">
                    {t('auth.passwordHint')}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isNewUser 
                      ? t('auth.creating') 
                      : t('auth.signingIn')
                    }
                  </>
                ) : (
                  isNewUser 
                    ? t('invite.createAndAccept') 
                    : t('invite.loginAndAccept')
                )}
              </Button>
            </form>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AuthLayout
      title={t('invite.title')}
      subtitle={t('invite.subtitle')}
    >
      {renderContent()}
    </AuthLayout>
  );
}

export default AcceptInvitePage;
