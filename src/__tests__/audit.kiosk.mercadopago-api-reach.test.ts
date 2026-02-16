import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
    isPluginAvailable: vi.fn(() => true),
  },
  CapacitorHttp: {
    request: vi.fn(async () => ({ status: 200, data: {} })),
  },
  registerPlugin: vi.fn(() => ({})),
}));

describe('audit - kiosk mercadopagoAPI reach', () => {
  it('importa o modulo real sem usar o mock global', async () => {
    vi.resetModules();
    vi.unmock('@/services/mercadopagoAPI');

    const mod = await import('../services/mercadopagoAPI.ts');
    expect(mod.MercadoPagoAPI).toBeTypeOf('function');

    const api = mod.createMercadoPagoAPI({ accessToken: 'test-token', mode: 'sandbox' });
    expect(api).not.toBeNull();
  });
});
