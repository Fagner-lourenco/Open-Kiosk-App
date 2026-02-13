import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReactNode } from 'react';

const mockProducts = [
  { id: '1', title: 'Produto 1', price: 10, stock: 100, active: true },
  { id: '2', title: 'Produto 2', price: 20, stock: 50, active: true },
];

vi.mock('@/hooks/useFirebaseProducts', () => ({
  useFirebaseProducts: () => ({ products: mockProducts, loading: false }),
}));

const mockActions = {
  moveToStep: vi.fn(),
  goBack: vi.fn(),
  updateProcessingProgress: vi.fn(),
};

vi.mock('@/hooks/useCheckoutFlow', () => ({
  useCheckoutFlow: () => ({ state: { currentStep: 1, processingProgress: 0 }, actions: mockActions }),
}));

vi.mock('@/hooks/useKioskIdle', () => ({
  useKioskIdle: ({ suppressed = false } = {}) => ({ isIdle: suppressed, resetIdle: vi.fn() }),
}));

import { useFirebaseProducts } from '@/hooks/useFirebaseProducts';
import { useCheckoutFlow } from '@/hooks/useCheckoutFlow';
import { useKioskIdle } from '@/hooks/useKioskIdle';

const wrapper = ({ children }: { children: React.ReactNode }) => <BrowserRouter>{children}</BrowserRouter>;

describe('Hooks reais (mockados)', () => {
  it('useFirebaseProducts retorna lista mockada', () => {
    const { result } = renderHook(() => useFirebaseProducts(), { wrapper });
    expect(result.current.products).toHaveLength(2);
    expect(result.current.products?.[0].title).toBe('Produto 1');
    expect(result.current.loading).toBe(false);
  });

  it('useCheckoutFlow exp�e estado inicial', () => {
    const { result } = renderHook(() => useCheckoutFlow(), { wrapper });
    expect(result.current.state.currentStep).toBe(1);
    result.current.actions.moveToStep(2);
    expect(mockActions.moveToStep).toHaveBeenCalledWith(2);
  });

  it('useKioskIdle fornece controle de idle', () => {
    const { result } = renderHook(() => useKioskIdle({ suppressed: false }), { wrapper });
    expect(result.current.isIdle).toBe(false);
    result.current.resetIdle();
  });
});
