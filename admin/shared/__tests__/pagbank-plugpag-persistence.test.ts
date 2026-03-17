/**
 * Tests: plugpagDeviceId persistence in tap serialization
 */
import { describe, it, expect } from 'vitest';

function loadTapFromFirestore(t: any) {
  return {
    id: t.id,
    name: t.name,
    enabled: t.enabled ?? true,
    valvePin: t.valvePin,
    sensorPin: t.sensorPin,
    calibration: {
      pulsesPerLiter: t.calibration?.pulsesPerLiter,
      mlPerSecond: t.calibration?.mlPerSecond,
    },
    productId: t.productId,
    productName: t.productName,
    plugpagDeviceId: t.plugpagDeviceId,
  };
}

function saveTapToFirestore(t: any) {
  return {
    id: t.id,
    name: t.name,
    enabled: t.enabled,
    valvePin: t.valvePin,
    sensorPin: t.sensorPin,
    calibration: t.calibration
      ? {
          pulsesPerLiter: t.calibration.pulsesPerLiter,
          mlPerSecond: t.calibration.mlPerSecond,
        }
      : undefined,
    productId: t.productId,
    productName: t.productName,
    plugpagDeviceId: t.plugpagDeviceId,
  };
}

describe('plugpagDeviceId persistence', () => {
  const IDENTIFIER = 'PRO-1733203195';

  const firestoreTap = {
    id: 1,
    name: 'Torneira 1',
    enabled: true,
    valvePin: 2,
    sensorPin: 3,
    calibration: { pulsesPerLiter: 450, mlPerSecond: 35 },
    productId: 'prod-123',
    productName: 'Chopp Pilsen',
    plugpagDeviceId: IDENTIFIER,
  };

  it('LOAD: preserves plugpagDeviceId from Firestore', () => {
    const loaded = loadTapFromFirestore(firestoreTap);
    expect(loaded.plugpagDeviceId).toBe(IDENTIFIER);
  });

  it('LOAD: handles undefined plugpagDeviceId gracefully', () => {
    const { plugpagDeviceId, ...tapWithoutMac } = firestoreTap;
    const loaded = loadTapFromFirestore(tapWithoutMac);
    expect(loaded.plugpagDeviceId).toBeUndefined();
  });

  it('SAVE: preserves plugpagDeviceId to Firestore payload', () => {
    const saved = saveTapToFirestore(firestoreTap);
    expect(saved.plugpagDeviceId).toBe(IDENTIFIER);
  });

  it('SAVE: handles undefined plugpagDeviceId gracefully', () => {
    const { plugpagDeviceId, ...tapWithoutMac } = firestoreTap;
    const saved = saveTapToFirestore(tapWithoutMac);
    expect(saved.plugpagDeviceId).toBeUndefined();
  });

  it('round-trip: load -> save preserves plugpagDeviceId', () => {
    const loaded = loadTapFromFirestore(firestoreTap);
    const saved = saveTapToFirestore(loaded);
    expect(saved.plugpagDeviceId).toBe(IDENTIFIER);
  });

  it('round-trip: load -> edit -> save preserves plugpagDeviceId', () => {
    const loaded = loadTapFromFirestore(firestoreTap);
    loaded.name = 'Torneira Modificada';
    const saved = saveTapToFirestore(loaded);
    expect(saved.plugpagDeviceId).toBe(IDENTIFIER);
    expect(saved.name).toBe('Torneira Modificada');
  });

  it('multiple taps: each preserves its own plugpagDeviceId', () => {
    const taps = [
      { ...firestoreTap, id: 1, plugpagDeviceId: 'PRO-1733203195' },
      { ...firestoreTap, id: 2, plugpagDeviceId: 'AA:BB:CC:DD:EE:FF' },
      { ...firestoreTap, id: 3, plugpagDeviceId: undefined },
    ];

    const loaded = taps.map(loadTapFromFirestore);
    const saved = loaded.map(saveTapToFirestore);

    expect(saved[0].plugpagDeviceId).toBe('PRO-1733203195');
    expect(saved[1].plugpagDeviceId).toBe('AA:BB:CC:DD:EE:FF');
    expect(saved[2].plugpagDeviceId).toBeUndefined();
  });
});

describe('PagBank storeConfig normalization (no clientId needed)', () => {
  it('normalizePaymentGatewayConfig preserves pagbank without clientId', () => {
    const normalizePaymentGatewayConfig = (storeData?: Record<string, unknown> | null) => {
      if (!storeData) return null;
      const legacy = storeData as Record<string, any>;
      const current = legacy.paymentGatewayConfig as Record<string, any> | undefined;
      const legacyGateway = legacy.paymentGateway as Record<string, any> | undefined;
      const provider = current?.provider || legacyGateway?.provider || 'mercado_pago';

      return {
        provider: provider === 'mercadopago' ? 'mercado_pago' : provider,
        environment: current?.environment || legacyGateway?.environment || legacyGateway?.mode || 'sandbox',
        enabledMethods: current?.enabledMethods || {
          cash: true,
          pix: true,
          credit: true,
          debit: true,
        },
        providers: {
          pagbank: {
            ...(current?.providers?.pagbank || {}),
            publicKey: current?.providers?.pagbank?.publicKey || legacyGateway?.publicKey,
          },
        },
      };
    };

    const storeData = {
      paymentGatewayConfig: {
        provider: 'pagbank',
        environment: 'production',
        enabledMethods: { cash: true, pix: true, credit: false, debit: false },
        providers: {
          pagbank: {
            clientId: '',
            publicKey: '',
            merchantId: '',
          },
        },
      },
    };

    const config = normalizePaymentGatewayConfig(storeData);
    expect(config).not.toBeNull();
    expect(config?.provider).toBe('pagbank');
    expect(config?.environment).toBe('production');
    expect(config?.providers?.pagbank?.clientId).toBeFalsy();
  });
});
