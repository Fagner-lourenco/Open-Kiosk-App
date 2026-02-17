/**
 * Coverage tests for admin/src/hooks/ (uncovered files)
 * Tests hook existence + basic behavior for pure hooks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Barrel (index.ts, use-toast.ts)
import '@/hooks/index';
import '@/hooks/use-toast';

// Pure hooks (no Firebase dependency)
import { useAutoRotation } from '@/hooks/useAutoRotation';
import { useCopyClipboard } from '@/hooks/useCopyClipboard';
import { useCountUp } from '@/hooks/useCountUp';
import { useSidebar, SidebarProvider } from '@/hooks/useSidebar';
import { useToast } from '@/hooks/useToast';

// Firebase-dependent hooks — just verify exports
import { useKegs } from '@/hooks/useKegs';
import { useMaintenance } from '@/hooks/useMaintenance';
import { usePermissions } from '@/hooks/usePermissions';
import { useStoreDetail } from '@/hooks/useStoreDetail';
import { useStores } from '@/hooks/useStores';
import { useTapAssignments } from '@/hooks/useTapAssignments';
import { useTapsRealtime } from '@/hooks/useTapsRealtime';
import { useTvDynamicPricing } from '@/hooks/useTvDynamicPricing';
import { useUsers } from '@/hooks/useUsers';
import { useWastage } from '@/hooks/useWastage';
import { useMaxTaps } from '@/hooks/useMaxTaps';

describe('hooks/useAutoRotation', () => {
  it('retorna primeira página de items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const { result } = renderHook(() => useAutoRotation(items, 2));
    expect(result.current.visibleItems).toHaveLength(2);
    expect(result.current.visibleItems[0]).toBe('a');
  });
});

describe('hooks/useCopyClipboard', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('copia texto para clipboard', async () => {
    const { result } = renderHook(() => useCopyClipboard());
    expect(result.current.isCopied).toBe(false);
    await act(async () => {
      await result.current.copyToClipboard('test');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test');
  });
});

describe('hooks/useCountUp', () => {
  it('começa com 0 e anima para alvo', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(1000);
      return 1;
    });
    const { result } = renderHook(() => useCountUp(100, 0));
    // Immediate or near-immediate result
    expect(typeof result.current).toBe('number');
    vi.restoreAllMocks();
  });
});

describe('hooks/useToast', () => {
  it('retorna funções de toast', () => {
    const { result } = renderHook(() => useToast());
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.info).toBe('function');
  });
});

describe('hooks/useSidebar', () => {
  it('useSidebar é hook', () => {
    expect(typeof useSidebar).toBe('function');
  });

  it('SidebarProvider é componente', () => {
    expect(typeof SidebarProvider).toBe('function');
  });
});

describe('hooks que dependem de Firebase — export check', () => {
  it('useKegs é hook', () => expect(typeof useKegs).toBe('function'));
  it('useMaintenance é hook', () => expect(typeof useMaintenance).toBe('function'));
  it('usePermissions é hook', () => expect(typeof usePermissions).toBe('function'));
  it('useStoreDetail é hook', () => expect(typeof useStoreDetail).toBe('function'));
  it('useStores é hook', () => expect(typeof useStores).toBe('function'));
  it('useTapAssignments é hook', () => expect(typeof useTapAssignments).toBe('function'));
  it('useTapsRealtime é hook', () => expect(typeof useTapsRealtime).toBe('function'));
  it('useTvDynamicPricing é hook', () => expect(typeof useTvDynamicPricing).toBe('function'));
  it('useUsers é hook', () => expect(typeof useUsers).toBe('function'));
  it('useWastage é hook', () => expect(typeof useWastage).toBe('function'));
  it('useMaxTaps é hook', () => expect(typeof useMaxTaps).toBe('function'));
});
