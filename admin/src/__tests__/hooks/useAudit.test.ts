import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudit } from '@/hooks/useAudit';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import { logUserAction } from '@/services/auditService';

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/context/FranchiseContext', () => ({
  useFranchise: vi.fn(),
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseFranchise = vi.mocked(useFranchise);
const mockedLogUserAction = vi.mocked(logUserAction);

describe('useAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: {
        uid: 'u-1',
        email: 'user@test.com',
        displayName: 'Audit User',
      },
    } as any);
    mockedUseFranchise.mockReturnValue({
      currentFranchise: {
        id: 'f-1',
        name: 'Franchise Test',
      },
    } as any);
  });

  it('encaminha evento para auditService com actor normalizado', async () => {
    const { result } = renderHook(() => useAudit());

    await result.current.log(
      'customer.create',
      { type: 'customer', id: 'c-1', name: 'Cliente 1' },
      { storeId: 's-1', source: 'manual' },
    );

    expect(mockedLogUserAction).toHaveBeenCalledWith(
      'f-1',
      'customer.create',
      {
        id: 'u-1',
        email: 'user@test.com',
        name: 'Audit User',
      },
      { type: 'customer', id: 'c-1', name: 'Cliente 1' },
      { storeId: 's-1', source: 'manual' },
    );
  });

  it('nao chama auditService quando falta contexto de usuario ou franquia', async () => {
    const { result, rerender } = renderHook(() => useAudit());

    mockedUseAuth.mockReturnValueOnce({ user: null } as any);
    mockedUseFranchise.mockReturnValueOnce({
      currentFranchise: { id: 'f-1' },
    } as any);
    rerender();
    await result.current.log('customer.update');

    mockedUseAuth.mockReturnValueOnce({
      user: { uid: 'u-1', email: 'user@test.com', displayName: 'Audit User' },
    } as any);
    mockedUseFranchise.mockReturnValueOnce({ currentFranchise: null } as any);
    rerender();
    await result.current.log('customer.delete');

    expect(mockedLogUserAction).not.toHaveBeenCalled();
  });

  it('silencia erro do auditService para nao bloquear fluxo principal', async () => {
    mockedLogUserAction.mockRejectedValueOnce(new Error('audit failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useAudit());

    await expect(result.current.log('customer.update')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[audit] Falha ao registrar customer.update:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
