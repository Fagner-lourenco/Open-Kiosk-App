import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioVoice } from '@/hooks/useAudioVoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, UserCheck, Clock } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { salesService } from '@/services/salesService';
import { registerCustomer, type KnownCustomer } from '@/utils/knownCustomers';

// ---------------------------------------------------------------------------
// CPF mask helper
// ---------------------------------------------------------------------------

function applyCpfMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function stripCpfMask(value: string): string {
  return value.replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RankingOptInProps {
  /** Order number to enrich with customer data */
  orderNumber: string;
  /** Store ID for Firestore write */
  storeId: string;
  /** Fingerprints built from payment data, for customer registration */
  fingerprints: string[];
  /** Previously recognised customer (pre-populates form), or null */
  recognizedCustomer: KnownCustomer | null;
  /** Called after successful submission */
  onDone: () => void;
  /** Called when user skips or countdown expires */
  onSkip: () => void;
  /** Whether voice prompts are enabled (inherited from parent) */
  soundEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const COUNTDOWN_SECONDS = 30;

export function RankingOptIn({
  orderNumber,
  storeId,
  fingerprints,
  recognizedCustomer,
  onDone,
  onSkip,
  soundEnabled = true,
}: RankingOptInProps) {
  const { t } = useTranslation();
  const { playGuarded } = useAudioVoice(soundEnabled);

  // Form fields — pre-populate from recognised customer
  const [name, setName] = useState(recognizedCustomer?.name || '');
  const [cpf, setCpf] = useState(
    recognizedCustomer?.cpf ? applyCpfMask(recognizedCustomer.cpf) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Countdown
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipCalledRef = useRef(false);

  // Guard: stable onSkip ref so interval cleanup doesn't re-create
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;

  // Voz: convidar ao ranking no mount
  useEffect(() => {
    playGuarded('isis_ranking_invite', orderNumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start countdown on mount
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (!skipCalledRef.current) {
            skipCalledRef.current = true;
            // Defer to avoid setState during render
            setTimeout(() => onSkipRef.current(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Reset countdown on any user interaction (touch/click)
  const resetCountdown = useCallback(() => {
    setSecondsLeft(COUNTDOWN_SECONDS);
  }, []);

  // ------------------------------------------
  // Submit handler
  // ------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!name.trim() || submitting || submitted) return;

    setSubmitting(true);
    try {
      const cpfDigits = stripCpfMask(cpf);

      // Write customerName (+ CPF) to Firestore → triggers ranking Cloud Function
      await salesService.enrichOrderWithCustomerData(
        orderNumber,
        {
          customerName: name.trim(),
          customerIdentification: cpfDigits || undefined,
        },
        storeId,
      );

      // Save to localStorage for future recognition
      registerCustomer(name.trim(), cpfDigits, fingerprints);

      setSubmitted(true);
      playGuarded('ranking_thanks', orderNumber);
      // Brief success flash then close
      setTimeout(() => onDone(), 800);
    } catch (err) {
      console.warn('[RankingOptIn] Submit failed:', err);
      // Non-blocking — close anyway after brief delay
      setTimeout(() => onDone(), 400);
    }
  }, [name, cpf, orderNumber, storeId, fingerprints, submitting, submitted, onDone]);

  const handleSkip = useCallback(() => {
    if (skipCalledRef.current) return;
    skipCalledRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onSkip();
  }, [onSkip]);

  // ------------------------------------------
  // Render
  // ------------------------------------------

  if (submitted) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-4 animate-in fade-in"
        role="status"
      >
        <div className="w-14 h-14 rounded-full bg-yellow-100 flex items-center justify-center">
          <Trophy className="w-7 h-7 text-yellow-600" />
        </div>
        <p className="text-lg font-semibold text-gray-700">
          {t('checkout.rankingAdded')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto py-2"
      onPointerDown={resetCountdown}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        {recognizedCustomer ? (
          <>
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
              <UserCheck className="w-7 h-7 text-blue-600" />
            </div>
            <p className="text-lg font-semibold text-gray-700">
              {t('checkout.rankingWelcomeBack', { name: recognizedCustomer.name.split(' ')[0] })}
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-yellow-100 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-yellow-600" />
            </div>
            <p className="text-lg font-semibold text-gray-700">
              {t('checkout.rankingTitle')}
            </p>
            <p className="text-sm text-gray-500">
              {t('checkout.rankingSubtitle')}
            </p>
          </>
        )}
      </div>

      {/* Form */}
      <div className="w-full space-y-3">
        <div>
          <Label htmlFor="ranking-name" className="text-sm font-medium">
            {t('checkout.rankingName')}
          </Label>
          <Input
            id="ranking-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={e => { setName(e.target.value); resetCountdown(); }}
            placeholder="Ex: João Silva"
            className="h-14 text-lg mt-1"
            disabled={submitting}
            maxLength={60}
          />
        </div>
        <div>
          <Label htmlFor="ranking-cpf" className="text-sm font-medium">
            {t('checkout.rankingCpf')}
          </Label>
          <Input
            id="ranking-cpf"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={e => { setCpf(applyCpfMask(e.target.value)); resetCountdown(); }}
            placeholder="000.000.000-00"
            className="h-14 text-lg mt-1"
            disabled={submitting}
          />
          <p className="text-xs text-gray-400 mt-1">{t('checkout.rankingCpfHint')}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full space-y-2 mt-1">
        <Button
          className="w-full h-14 text-lg font-semibold"
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
        >
          {submitting ? (
            <span className="animate-pulse">{t('checkout.rankingSubmitting')}</span>
          ) : (
            <>
              <Trophy className="w-5 h-5 mr-2" />
              {t('checkout.rankingSubmit')}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          className="w-full h-10 text-sm text-gray-400"
          onClick={handleSkip}
          disabled={submitting}
        >
          {t('checkout.rankingSkip')}
        </Button>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-1 text-xs text-gray-300">
        <Clock className="w-3 h-3" />
        <span>{t('checkout.rankingClosingIn', { seconds: secondsLeft })}</span>
      </div>
    </div>
  );
}
