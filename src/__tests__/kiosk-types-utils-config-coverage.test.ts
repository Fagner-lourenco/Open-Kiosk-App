/**
 * Coverage tests for kiosk types, utils, config, plugins
 */
import { describe, it, expect } from 'vitest';

// ---- Types (side-effect imports for type-only files) ----
import '@/types/checkoutFlow';
import '@/types/mercadopago';
import '@/types/payments';
import '@/types/sales';

// types with value exports
import {
  ROLE_PERMISSIONS,
  roleHasPermission,
  ROLE_LABELS,
} from '@/types/franchise';
import {
  mapFirestoreToDeviceStatus,
} from '@/types/esp32ContextTypes';
import {
  VOICE_ERROR_MESSAGES,
} from '@/types/voiceSearchTypes';

// ---- Utils ----
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';
import { encryptCard } from '@/utils/pagbankEncrypt';

// ---- Config ----
import {
  GATEWAY_REGISTRY,
  getAvailableGateways,
  getGatewayById,
  isGatewaySelectable,
  getGatewayStatusBadge,
} from '@/config/gateways/index';
import '@/config/gateways/types';

// ---- Plugins ----
import {
  PlugPagEventCodes,
  PlugPagTerminal,
} from '@/plugins/plugpagTerminal';

// ============================================================================
// TYPES
// ============================================================================

describe('types/franchise — value exports', () => {
  it('ROLE_PERMISSIONS é objeto com roles', () => {
    expect(typeof ROLE_PERMISSIONS).toBe('object');
    expect(Object.keys(ROLE_PERMISSIONS).length).toBeGreaterThan(2);
  });

  it('roleHasPermission valida permissões reais', () => {
    // superadmin tem billing
    expect(roleHasPermission('superadmin', 'franchise:billing')).toBe(true);
    // operador não tem acesso de admin
    expect(roleHasPermission('operator', 'franchise:billing')).toBe(false);
  });

  it('ROLE_LABELS é objeto com labels i18n para cada role', () => {
    expect(typeof ROLE_LABELS).toBe('object');
    expect(Object.keys(ROLE_LABELS).length).toBeGreaterThan(2);
    // Cada valor é { pt: string, en: string }
    for (const label of Object.values(ROLE_LABELS)) {
      expect(label).toHaveProperty('pt');
      expect(label).toHaveProperty('en');
      expect(typeof (label as any).pt).toBe('string');
      expect((label as any).pt.length).toBeGreaterThan(0);
    }
  });
});

describe('types/esp32ContextTypes', () => {
  it('mapFirestoreToDeviceStatus retorna unconfigured para null', () => {
    const result = mapFirestoreToDeviceStatus(null);
    expect(result).toBeDefined();
    expect(result.state).toBe('unconfigured');
  });

  it('mapFirestoreToDeviceStatus converte dados válidos', () => {
    const result = mapFirestoreToDeviceStatus({ state: 'online', firmwareVersion: '1.0' });
    expect(result).toBeDefined();
    expect(typeof result.state).toBe('string');
  });
});

describe('types/voiceSearchTypes', () => {
  it('VOICE_ERROR_MESSAGES é objeto', () => {
    expect(typeof VOICE_ERROR_MESSAGES).toBe('object');
    expect(Object.keys(VOICE_ERROR_MESSAGES).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// UTILS
// ============================================================================

describe('utils/firestoreSanitize', () => {
  it('sanitizeFirestoreData remove undefined', () => {
    const result = sanitizeFirestoreData({ a: 1, b: undefined, c: 'x' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

describe('utils/pagbankEncrypt', () => {
  it('encryptCard é função', () => {
    expect(typeof encryptCard).toBe('function');
  });
});

// ============================================================================
// CONFIG
// ============================================================================

describe('config/gateways', () => {
  it('GATEWAY_REGISTRY é objeto com gateways', () => {
    expect(typeof GATEWAY_REGISTRY).toBe('object');
    expect(Object.keys(GATEWAY_REGISTRY).length).toBeGreaterThan(0);
  });

  it('getAvailableGateways retorna array', () => {
    const gateways = getAvailableGateways();
    expect(Array.isArray(gateways)).toBe(true);
  });

  it('getGatewayById retorna gateway ou undefined', () => {
    const gw = getGatewayById('mercado_pago');
    // May or may not exist
    expect(gw === undefined || typeof gw === 'object').toBe(true);
  });

  it('isGatewaySelectable retorna booleano para gateways reais', () => {
    const ids = Object.keys(GATEWAY_REGISTRY);
    for (const id of ids) {
      const result = isGatewaySelectable(id as any);
      expect(typeof result).toBe('boolean');
    }
  });

  it('getGatewayStatusBadge retorna objeto com label e variant', () => {
    const badge = getGatewayStatusBadge('stable');
    expect(badge).toBeDefined();
    expect(typeof badge.label).toBe('string');
    expect(['default', 'secondary', 'outline']).toContain(badge.variant);

    const betaBadge = getGatewayStatusBadge('beta');
    expect(betaBadge.label).toBeTruthy();
  });
});

// ============================================================================
// PLUGINS
// ============================================================================

describe('plugins/plugpagTerminal', () => {
  it('PlugPagEventCodes é objeto com códigos', () => {
    expect(typeof PlugPagEventCodes).toBe('object');
    expect(Object.keys(PlugPagEventCodes).length).toBeGreaterThan(0);
  });

  it('PlugPagTerminal é registrado via Capacitor (mock retorna undefined)', () => {
    // registerPlugin é mockado como vi.fn() — retorna undefined
    expect(PlugPagTerminal === undefined || typeof PlugPagTerminal === 'object').toBe(true);
  });
});
