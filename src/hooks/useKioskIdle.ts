import { useEffect, useRef, useState } from 'react';

export type UseKioskIdleOptions = {
  timeoutSeconds?: number; // default 120s
  suppressed?: boolean; // pause idle tracking when true
};

export const useKioskIdle = (options: UseKioskIdleOptions = {}) => {
  const { timeoutSeconds = 120, suppressed = false } = options;
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<number | null>(null);
  const listenersRegisteredRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setIsIdle(true);
    }, timeoutSeconds * 1000);
  };

  const resetIdle = () => {
    setIsIdle(false);
    if (!suppressed) {
      startTimer();
    } else {
      clearTimer();
    }
  };

  useEffect(() => {
    const onAnyInteraction = () => {
      if (isIdle) {
        setIsIdle(false);
      }
      if (!suppressed) {
        startTimer();
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

    // Avoid duplicate listeners if effect re-runs unexpectedly
    if (listenersRegisteredRef.current) {
      events.forEach((evt) => window.removeEventListener(evt, onAnyInteraction));
    }

    events.forEach((evt) => window.addEventListener(evt, onAnyInteraction, { passive: true }));
    listenersRegisteredRef.current = true;

    if (!suppressed) {
      startTimer();
    }

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onAnyInteraction));
      listenersRegisteredRef.current = false;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed, timeoutSeconds]);

  // If suppression toggles while idle, ensure consistent state
  useEffect(() => {
    if (suppressed) {
      clearTimer();
    } else if (!isIdle) {
      startTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed]);

  return { isIdle, resetIdle };
};
