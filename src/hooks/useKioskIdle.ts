import { useEffect, useRef, useState, useCallback } from 'react';

export type UseKioskIdleOptions = {
  timeoutSeconds?: number; // default 120s
  suppressed?: boolean; // pause idle tracking when true
};

export const useKioskIdle = (options: UseKioskIdleOptions = {}) => {
  const { timeoutSeconds = 120, suppressed = false } = options;
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isIdleRef = useRef(false); // mirror for event handler (avoids setState when already !idle)
  const suppressedRef = useRef(suppressed);
  const timeoutRef = useRef(timeoutSeconds);

  // Keep refs in sync
  suppressedRef.current = suppressed;
  timeoutRef.current = timeoutSeconds;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
    }, timeoutRef.current * 1000);
  }, [clearTimer]);

  const resetIdle = useCallback(() => {
    isIdleRef.current = false;
    setIsIdle(false);
    if (!suppressedRef.current) {
      startTimer();
    } else {
      clearTimer();
    }
  }, [startTimer, clearTimer]);

  useEffect(() => {
    const onAnyInteraction = () => {
      // Guard: skip setState when not idle (avoids thousands of no-op setStates on pointermove)
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
      }
      // Always restart timer
      if (!suppressedRef.current) {
        // Inline timer restart to use current ref values
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          isIdleRef.current = true;
          setIsIdle(true);
        }, timeoutRef.current * 1000);
      }
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
      startTimer();
    }

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onAnyInteraction));
      clearTimer();
    };
  }, [startTimer, clearTimer]);

  // If suppression toggles while idle, ensure consistent state
  useEffect(() => {
    if (suppressed) {
      clearTimer();
    } else if (!isIdleRef.current) {
      startTimer();
    }
  }, [suppressed, clearTimer, startTimer]);

  return { isIdle, resetIdle };
};
