import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => true),
    getPlatform: vi.fn(() => 'web'),
  },
  registerPlugin: vi.fn(() => ({})),
  CapacitorHttp: {
    request: vi.fn(async () => ({ status: 200, data: {} })),
  },
}));

vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: unknown }) => children,
  Panel: ({ children }: { children: unknown }) => children,
  PanelResizeHandle: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/services/esp32CommunicationService', () => ({
  __esModule: true,
  default: {
    getConnectionSupervisorStatus: vi.fn(() => ({ mode: 'idle' })),
    getConnectionStatus: vi.fn(() => ({ connected: false, type: 'none' })),
    activateConnectionSupervisor: vi.fn(),
    onConnectionChange: vi.fn(() => () => {}),
    onSupervisorStatusChange: vi.fn(() => () => {}),
    onBluetoothData: vi.fn(() => () => {}),
    onUsbData: vi.fn(() => () => {}),
    connectUSB: vi.fn(async () => true),
    connectWifi: vi.fn(async () => true),
    connectBluetooth: vi.fn(async () => true),
    sendCommand: vi.fn(async () => true),
    disconnect: vi.fn(async () => {}),
    reconnectNow: vi.fn(async () => false),
    ping: vi.fn(async () => true),
    verifyConnection: vi.fn(async () => true),
    getLastConnection: vi.fn(() => null),
    configureMultipleTaps: vi.fn(async () => true),
    getSettings: vi.fn(async () => true),
    saveCalibration: vi.fn(async () => true),
    setConnectionOrder: vi.fn(),
    connect: vi.fn(async () => true),
  },
  getESP32WiFiIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/services/esp32SerialService', () => ({
  __esModule: true,
  default: {
    onMessage: vi.fn(() => () => {}),
    onRawLine: vi.fn(() => () => {}),
    onConnectionChange: vi.fn(() => () => {}),
    tryAutoReconnect: vi.fn(async () => false),
  },
}));

describe('audit - kiosk uncovered module reach', () => {
  it('importa os modulos de producao ainda descobertos sem erro', async () => {
    const modules = [
      '../components/ui/resizable.tsx',
      '../context/AuthContext.tsx',
      '../context/ESP32Context.tsx',
      '../hooks/usePermissions.ts',
      '../hooks/useSettings.tsx',
      '../hooks/useStoreSettings.tsx',
      '../i18n/index.ts',
      '../plugins/plugpagTerminal.ts',
      '../services/kioskModeService.ts',
      '../services/mercadopagoAPI.ts',
    ] as const;

    const settled = await Promise.allSettled(modules.map((modulePath) => import(modulePath)));

    const failures = settled
      .map((result, index) => ({ result, modulePath: modules[index] }))
      .filter((entry) => entry.result.status === 'rejected')
      .map((entry) => {
        const reason = (entry.result as PromiseRejectedResult).reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        return `${entry.modulePath} :: ${message}`;
      });

    expect(failures).toEqual([]);
  }, 120000);
});
