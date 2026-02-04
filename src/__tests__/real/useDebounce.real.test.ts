import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDebounce } from '@/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna valor inicial imediatamente', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('atualiza valor após delay', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );

    expect(result.current).toBe('initial');

    rerender({ value: 'updated' });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('cancela timer anterior quando valor muda antes do delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'first' } }
    );

    rerender({ value: 'second' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'third' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe('first');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('third');
  });

  it('usa delay padrão de 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'test' } }
    );

    rerender({ value: 'updated' });
    
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('test');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('updated');
  });

  it('funciona com diferentes tipos de dados', () => {
    const { result: numResult } = renderHook(() => useDebounce(42, 100));
    expect(numResult.current).toBe(42);

    const { result: objResult } = renderHook(() => useDebounce({ a: 1 }, 100));
    expect(objResult.current).toEqual({ a: 1 });

    const { result: nullResult } = renderHook(() => useDebounce(null, 100));
    expect(nullResult.current).toBe(null);
  });
});
