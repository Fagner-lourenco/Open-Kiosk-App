/**
 * ============================================================================
 * ForgotPassword - Recuperação de Senha
 * ============================================================================
 * 
 * Formulário para envio de email de recuperação de senha.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState } from 'react';
import { authService } from '@/services/authService';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

interface ForgotPasswordProps {
  onBack?: () => void;
  initialEmail?: string;
}

export function ForgotPassword({ onBack, initialEmail = '' }: ForgotPasswordProps) {
  const { t } = useTranslation();
  
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authService.sendPasswordReset(email);
      
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || t('auth.resetError'));
      }
    } catch (err) {
      setError(t('auth.resetError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('auth.emailSent')}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {t('auth.checkInbox')}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {email}
          </p>
        </div>

        {onBack && (
          <Button onClick={onBack} variant="outline" className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('auth.backToLogin')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Título */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          {t('auth.resetPassword')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('auth.resetSubtitle')}
        </p>
      </div>

      {/* Erro */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="reset-email">{t('auth.email')}</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="reset-email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            required
            disabled={isSubmitting}
            autoComplete="email"
          />
        </div>
      </div>

      {/* Botões */}
      <div className="space-y-3">
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('auth.sending')}
            </>
          ) : (
            t('auth.sendResetLink')
          )}
        </Button>

        {onBack && (
          <Button 
            type="button" 
            variant="outline" 
            className="w-full" 
            onClick={onBack}
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('auth.backToLogin')}
          </Button>
        )}
      </div>
    </form>
  );
}

export default ForgotPassword;
