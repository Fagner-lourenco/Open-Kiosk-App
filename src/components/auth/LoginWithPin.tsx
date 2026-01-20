/**
 * ============================================================================
 * LoginWithPin - Formulário de Login com PIN (Offline)
 * ============================================================================
 * 
 * Fallback para autenticação offline via PIN.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Wifi, WifiOff, ArrowLeft } from 'lucide-react';

interface LoginWithPinProps {
  onSwitchToEmail?: () => void;
  redirectTo?: string;
}

export function LoginWithPin({ 
  onSwitchToEmail,
  redirectTo = '/admin' 
}: LoginWithPinProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginWithPin, authError, clearAuthError } = useAuth();

  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Monitorar status de rede
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Focar no primeiro input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Apenas números
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto-avançar para próximo input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit quando completo
    if (value && index === 5) {
      const fullPin = newPin.join('');
      if (fullPin.length === 6) {
        handleSubmit(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Backspace: voltar para input anterior
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    
    if (pastedData.length > 0) {
      const newPin = [...pin];
      for (let i = 0; i < pastedData.length && i < 6; i++) {
        newPin[i] = pastedData[i];
      }
      setPin(newPin);
      
      // Focar no próximo input vazio ou último
      const nextEmpty = newPin.findIndex(d => !d);
      const focusIndex = nextEmpty === -1 ? 5 : nextEmpty;
      inputRefs.current[focusIndex]?.focus();

      // Auto-submit se completo
      if (pastedData.length === 6) {
        handleSubmit(pastedData);
      }
    }
  };

  const handleSubmit = async (pinValue?: string) => {
    clearAuthError();
    setIsSubmitting(true);

    const fullPin = pinValue || pin.join('');
    
    if (fullPin.length < 4) {
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await loginWithPin(fullPin);
      
      if (result.success) {
        navigate(redirectTo);
      } else {
        // Limpar PIN em caso de erro
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = () => {
    setPin(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
    clearAuthError();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-orange-500" />
          )}
          <span className={`text-sm ${isOnline ? 'text-green-600' : 'text-orange-600'}`}>
            {isOnline ? t('auth.online') : t('auth.offline')}
          </span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t('auth.enterPin')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('auth.pinSubtitle')}
        </p>
      </div>

      {/* Erro */}
      {authError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      )}

      {/* Inputs de PIN */}
      <div className="flex justify-center gap-2">
        {pin.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            disabled={isSubmitting}
            className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-lg 
                       focus:border-blue-500 focus:ring-2 focus:ring-blue-200 
                       outline-none transition-all disabled:bg-gray-100
                       border-gray-300"
          />
        ))}
      </div>

      {/* Botões */}
      <div className="space-y-3">
        <Button 
          onClick={() => handleSubmit()} 
          className="w-full" 
          disabled={isSubmitting || pin.join('').length < 4}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('auth.verifying')}
            </>
          ) : (
            t('auth.confirm')
          )}
        </Button>

        <Button 
          type="button"
          variant="ghost" 
          className="w-full" 
          onClick={handleClear}
          disabled={isSubmitting}
        >
          {t('auth.clear')}
        </Button>
      </div>

      {/* Voltar para Email */}
      {onSwitchToEmail && isOnline && (
        <div className="pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onSwitchToEmail}
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('auth.useEmail')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default LoginWithPin;
