import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKioskIdle } from '@/hooks/useKioskIdle';

const setVisibilityState = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
};

describe('useKioskIdle behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    setVisibilityState('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reinicia o countdown quando o timeout muda', () => {
    const { result, rerender } = renderHook(
      ({ timeoutSeconds }) => useKioskIdle({ timeoutSeconds }),
      { initialProps: { timeoutSeconds: 1 } },
    );

    act(() => {
      vi.advanceTimersByTime(900);
    });

    rerender({ timeoutSeconds: 5 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4800);
    });

    expect(result.current.isIdle).toBe(true);
  });

  it('pausa em background e recomeca ao voltar para o foreground', () => {
    const { result } = renderHook(() => useKioskIdle({ timeoutSeconds: 1 }));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    setVisibilityState('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isIdle).toBe(false);

    setVisibilityState('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isIdle).toBe(true);
  });
});
