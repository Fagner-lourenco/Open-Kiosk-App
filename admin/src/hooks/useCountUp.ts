import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Easing: exponential ease-out (fast start, smooth deceleration)
 */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * useCountUp — Animate a number from previous value to new target.
 *
 * Uses requestAnimationFrame with throttle to limit re-renders.
 * Default 20fps (50ms) is visually smooth for numbers while saving CPU.
 *
 * @param target   The target number to animate toward
 * @param duration Animation duration in ms (default 1500)
 * @param throttleMs Minimum ms between state updates (default 50 = ~20fps)
 * @returns        The current animated value (number)
 */
export function useCountUp(target: number, duration = 1500, throttleMs = 50): number {
  const [current, setCurrent] = useState(target);
  const prevTargetRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(target);
  const currentRef = useRef(target);
  const lastSetRef = useRef(0);

  // Always keep currentRef fresh
  currentRef.current = current;

  const animate = useCallback(
    (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);

      const from = startValueRef.current;
      const to = prevTargetRef.current;
      const value = from + (to - from) * easedProgress;

      // Throttle: only call setCurrent if enough time passed or animation finished
      const now = performance.now();
      if (progress >= 1 || now - lastSetRef.current >= throttleMs) {
        lastSetRef.current = now;
        setCurrent(value);
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    },
    [duration, throttleMs],
  );

  useEffect(() => {
    if (target !== prevTargetRef.current) {
      // Start new animation from current displayed value (using ref to avoid stale closure)
      startValueRef.current = currentRef.current;
      prevTargetRef.current = target;
      startTimeRef.current = null;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, animate]);

  return current;
}
