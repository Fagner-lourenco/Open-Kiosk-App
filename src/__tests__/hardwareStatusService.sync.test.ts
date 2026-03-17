import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDoc } from 'firebase/firestore';

const mockGetFirebaseAuth = vi.fn(() => ({ currentUser: { uid: 'user-1' } }));
const mockGetFirebaseDb = vi.fn(() => ({ name: 'mock-db' }));
const mockGetCurrentStoreId = vi.fn(() => 'store-1');
const mockGetCurrentFranchiseId = vi.fn(() => 'franchise-1');
const mockSystemLogError = vi.fn();

vi.mock('@/services/firebase', () => ({
  getFirebaseAuth: mockGetFirebaseAuth,
  getFirebaseDb: mockGetFirebaseDb,
  getCurrentStoreId: mockGetCurrentStoreId,
  getCurrentFranchiseId: mockGetCurrentFranchiseId,
}));

vi.mock('@/services/systemLogService', () => ({
  systemLogService: {
    start: vi.fn(),
    stop: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mockSystemLogError,
    debug: vi.fn(),
  },
}));

describe('hardwareStatusService sync failures', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(setDoc).mockResolvedValue(undefined);
    mockGetFirebaseAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
  });

  it('expõe erro e registra telemetria quando a escrita falha', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(Object.assign(new Error('missing or insufficient permissions'), {
      code: 'permission-denied',
    }));

    const { hardwareStatusService } = await import('@/services/hardwareStatusService');
    await hardwareStatusService.updateStatus({ esp32Connected: true, esp32Ip: '192.168.4.1' });

    expect(mockSystemLogError).toHaveBeenCalledWith(
      'esp32',
      '[HardwareStatus] Erro ao atualizar status no Firestore',
      expect.objectContaining({ code: 'permission-denied' })
    );
    expect(hardwareStatusService.getLastSyncError()).toEqual(expect.objectContaining({
      code: 'permission-denied',
      message: '[HardwareStatus] Erro ao atualizar status no Firestore',
    }));
    expect(hardwareStatusService.getCurrentStatus().lastError).toBe('[HardwareStatus] Erro ao atualizar status no Firestore');
  });

  it('limpa o erro quando a sincronização volta a funcionar', async () => {
    vi.mocked(setDoc)
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'permission-denied' }))
      .mockResolvedValueOnce(undefined);

    const { hardwareStatusService } = await import('@/services/hardwareStatusService');
    await hardwareStatusService.updateStatus({ esp32Connected: true });
    await hardwareStatusService.updateStatus({ esp32Connected: true });

    expect(hardwareStatusService.getLastSyncError()).toBeNull();
    expect(hardwareStatusService.getCurrentStatus().lastError).toBeNull();
  });
});
