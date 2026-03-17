import { useEffect, useRef, useState, useCallback } from 'react';

export type UseKioskIdleOptions = {
  timeoutSeconds?: number; // default 120s
  suppressed?: boolean; // pause idle tracking when true
  debugLabel?: string;
  suppressedReason?: string;
};

export const useKioskIdle = (options: UseKioskIdleOptions = {}) => {
  const {
    timeoutSeconds = 120,
    suppressed = false,
    debugLabel = 'kiosk-idle',
    suppressedReason,
  } = options;
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isIdleRef = useRef(false); // mirror for event handler (avoids setState when already !idle)
  const suppressedRef = useRef(suppressed);
  const timeoutRef = useRef(timeoutSeconds);
  const lastSuppressedRef = useRef(suppressed);
  const log = useCallback((event: string, extra: Record<string, unknown> = {}) => {
    console.log(`[useKioskIdle] ${JSON.stringify({
      label: debugLabel,
      event,
      timeoutSeconds: timeoutRef.current,
      suppressed: suppressedRef.current,
      suppressedReason: suppressedReason || null,
      ...extra,
    })}`);
  }, [debugLabel, suppressedReason]);

  // Keep refs in sync
  suppressedRef.current = suppressed;
  timeoutRef.current = timeoutSeconds;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback((reason: string) => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
      log('idle-reached', { reason });
    }, timeoutRef.current * 1000);
    if (!reason.startsWith('interaction:')) {
      log('timer-started', { reason });
    }
  }, [clearTimer, log]);

  const resetIdle = useCallback(() => {
    isIdleRef.current = false;
    setIsIdle(false);
    if (!suppressedRef.current) {
      startTimer('manual-reset');
      log('timer-reset', { reason: 'manual-reset' });
    } else {
      clearTimer();
      log('timer-cleared', { reason: 'manual-reset-suppressed' });
    }
  }, [startTimer, clearTimer, log]);

  useEffect(() => {
    const onAnyInteraction = (event: Event) => {
      // Guard: skip setState when not idle (avoids thousands of no-op setStates on pointermove)
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
        log('timer-reset', { reason: 'interaction-from-idle', interactionType: event.type });
      }

      if (suppressedRef.current) {
        clearTimer();
        return;
      }

      startTimer(`interaction:${event.type}`);
    };

    const events: (keyof WindowEventMap)[] = [
      'pointermove',
      'mousedown',
      'click',
      'touchstart',
      'keydown',
      'wheel',
    ];

    events.forEach((evt) => window.addEventListener(evt, onAnyInteraction, { passive: true }));

    if (!suppressedRef.current) {
      startTimer('mount');
    }

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onAnyInteraction));
      clearTimer();
    };
  }, [startTimer, clearTimer, log]);

  // If suppression toggles while idle, ensure consistent state
  useEffect(() => {
    if (suppressed) {
      clearTimer();
      if (!lastSuppressedRef.current) {
        log('suppressed', { reason: suppressedReason || 'unspecified' });
      }
    } else if (!isIdleRef.current) {
      if (lastSuppressedRef.current) {
        log('timer-reset', { reason: 'suppression-ended' });
      }
      startTimer('suppression-ended');
    }
    lastSuppressedRef.current = suppressed;
  }, [suppressed, suppressedReason, clearTimer, startTimer, log]);

  useEffect(() => {
    if (suppressedRef.current || isIdleRef.current) {
      return;
    }

    startTimer('timeout-changed');
    log('timer-reset', { reason: 'timeout-changed' });
  }, [timeoutSeconds, startTimer, log]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer();
        log('timer-cleared', { reason: 'app-hidden' });
        return;
      }

      if (!suppressedRef.current && !isIdleRef.current) {
        startTimer('app-visible');
        log('timer-reset', { reason: 'app-visible' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [startTimer, clearTimer, log]);

  return { isIdle, resetIdle };
};
