/**
 * Coverage tests for kiosk hooks (14 uncovered hook files)
 */
import { describe, it, expect } from 'vitest';

// ---- Hooks ----
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast, toast } from '@/hooks/use-toast';
import { useCachedVideo } from '@/hooks/useCachedVideo';
import { useConfigImport } from '@/hooks/useConfigImport';
import { useDispensers } from '@/hooks/useDispensers';
import { useESP32AutoConnect } from '@/hooks/useESP32AutoConnect';
import { useESP32Reconnect } from '@/hooks/useESP32Reconnect';
import { useMercadoPagoPolling, POLLING_MAX_ATTEMPTS } from '@/hooks/useMercadoPagoPolling';
import { useNetworkStatus, useIsOnline } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useReports } from '@/hooks/useReports';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useTapConfiguration } from '@/hooks/useTapConfiguration';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';

const hookRegistry: Record<string, Function> = {
  useIsMobile,
  useToast,
  useCachedVideo,
  useConfigImport,
  useDispensers,
  useESP32AutoConnect,
  useESP32Reconnect,
  useMercadoPagoPolling,
  useNetworkStatus,
  useIsOnline,
  usePermissions,
  useReports,
  useStoreSettings,
  useTapConfiguration,
  useVoiceSearch,
};

describe('kiosk hooks — todos são funções', () => {
  it.each(Object.entries(hookRegistry))('%s é função', (_name, hook) => {
    expect(typeof hook).toBe('function');
  });
});

describe('kiosk hooks — exports auxiliares', () => {
  it('toast de use-toast é função', () => {
    expect(typeof toast).toBe('function');
  });

  it('POLLING_MAX_ATTEMPTS é número', () => {
    expect(typeof POLLING_MAX_ATTEMPTS).toBe('number');
    expect(POLLING_MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});
