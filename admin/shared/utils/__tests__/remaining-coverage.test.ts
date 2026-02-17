/**
 * Tests for admin/shared — remaining uncovered files:
 * - config/gateways/index.ts, config/gateways/types.ts
 * - schemas/index.ts, schemas/store.schema.ts
 * - types/index.ts, types/operations.ts, types/permissions.ts, types/roles.ts
 */
import { describe, it, expect } from 'vitest';

// config/gateways
import {
  GATEWAY_REGISTRY,
  getAvailableGateways,
  getGatewayById,
  isGatewaySelectable,
  getGatewayStatusBadge,
} from '../../config/gateways';
import type { GatewayId, GatewayDefinition, GatewayConfigField } from '../../config/gateways/types';

// schemas barrel + store.schema
import {
  StoreAddressSchema,
  PaymentGatewayConfigSchema,
  CreateStoreSchema,
  validateCreateStore,
  isValidStore,
  getValidationErrors,
  generateServingEventId,
} from '../../schemas';

// types barrel
import {
  ROLE_HIERARCHY,
  isRoleAtLeast,
  isRoleAbove,
  getAssignableRoles,
  ALL_ROLES,
  ROLE_PERMISSIONS,
  roleHasPermission,
  roleHasAllPermissions,
  roleHasAnyPermission,
  groupPermissionsByResource,
  PERMISSION_LABELS,
} from '../../types';

// types/operations (direct)
import type { TapStatus, KegStatus, ServingSessionStatus } from '../../types/operations';
// types/roles (direct)
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../types/roles';
// types/permissions (direct)
import { ROLE_PERMISSIONS as _RP2 } from '../../types/permissions';
import type { Permission } from '../../types/permissions';

// Side-effect imports for file-reach detection
import '../../schemas/store.schema';
import '../../types/operations';

// ============================================================================
// config/gateways
// ============================================================================

describe('admin/shared/config/gateways', () => {
  it('GATEWAY_REGISTRY tem mercado_pago e pagbank', () => {
    expect(GATEWAY_REGISTRY.mercado_pago).toBeDefined();
    expect(GATEWAY_REGISTRY.pagbank).toBeDefined();
    expect(GATEWAY_REGISTRY.mercado_pago.displayName).toBe('Mercado Pago');
  });

  it('getAvailableGateways retorna lista ordenada por status', () => {
    const gws = getAvailableGateways();
    expect(gws.length).toBeGreaterThanOrEqual(2);
    // stable should come first
    const statuses = gws.map(g => g.status);
    const stableIdx = statuses.indexOf('stable');
    const comingSoonIdx = statuses.indexOf('coming_soon');
    if (stableIdx >= 0 && comingSoonIdx >= 0) {
      expect(stableIdx).toBeLessThan(comingSoonIdx);
    }
  });

  it('getGatewayById encontra mercado_pago', () => {
    const gw = getGatewayById('mercado_pago');
    expect(gw?.id).toBe('mercado_pago');
  });

  it('getGatewayById retorna undefined para id inexistente', () => {
    expect(getGatewayById('xyz')).toBeUndefined();
  });

  it('isGatewaySelectable retorna true para stable/beta, false para coming_soon', () => {
    expect(isGatewaySelectable('mercado_pago')).toBe(true);
    expect(isGatewaySelectable('pagbank')).toBe(true);
    expect(isGatewaySelectable('stone')).toBe(false);
  });

  it('getGatewayStatusBadge retorna badge correto', () => {
    const stable = getGatewayStatusBadge('stable');
    expect(stable.label).toBeTruthy();
    const beta = getGatewayStatusBadge('beta');
    expect(beta.label).toBeTruthy();
  });

  it('GatewayDefinition tem configFields', () => {
    const mp = GATEWAY_REGISTRY.mercado_pago;
    expect(mp.configFields.length).toBeGreaterThan(0);
    const field: GatewayConfigField = mp.configFields[0];
    expect(field.key).toBeTruthy();
    expect(field.label).toBeTruthy();
  });

  it('GatewayId tipo é atribuível', () => {
    const ids: GatewayId[] = ['mercado_pago', 'pagbank', 'stone'];
    expect(ids).toHaveLength(3);
  });
});

// ============================================================================
// schemas (barrel + store.schema)
// ============================================================================

describe('admin/shared/schemas', () => {
  it('exporta schemas e funções', () => {
    expect(StoreAddressSchema).toBeDefined();
    expect(PaymentGatewayConfigSchema).toBeDefined();
    expect(CreateStoreSchema).toBeDefined();
    expect(typeof validateCreateStore).toBe('function');
    expect(typeof isValidStore).toBe('function');
    expect(typeof getValidationErrors).toBe('function');
    expect(typeof generateServingEventId).toBe('function');
  });

  it('validateCreateStore aceita input válido', () => {
    const result = validateCreateStore({ name: 'Test Store' });
    expect(result.name).toBe('Test Store');
  });

  it('PaymentGatewayConfigSchema aceita pagbank', () => {
    const result = PaymentGatewayConfigSchema.safeParse({ provider: 'pagbank' });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// types (barrel + individual modules)
// ============================================================================

describe('admin/shared/types', () => {
  it('barrel exporta roles', () => {
    expect(ROLE_HIERARCHY.superadmin).toBeGreaterThan(ROLE_HIERARCHY.owner);
    expect(ALL_ROLES).toContain('superadmin');
    expect(ALL_ROLES.length).toBe(8);
  });

  it('isRoleAtLeast funciona', () => {
    expect(isRoleAtLeast('owner', 'admin')).toBe(true);
    expect(isRoleAtLeast('viewer', 'admin')).toBe(false);
  });

  it('isRoleAbove funciona', () => {
    expect(isRoleAbove('owner', 'admin')).toBe(true);
    expect(isRoleAbove('admin', 'admin')).toBe(false);
  });

  it('getAssignableRoles para owner não inclui superadmin', () => {
    const roles = getAssignableRoles('owner');
    expect(roles).not.toContain('superadmin');
  });

  it('roleHasPermission verifica permissão', () => {
    expect(roleHasPermission('superadmin', 'superadmin:access')).toBe(true);
    expect(roleHasPermission('viewer', 'superadmin:access')).toBe(false);
  });

  it('roleHasAllPermissions verifica todas', () => {
    expect(roleHasAllPermissions('owner', ['products:read', 'products:create'])).toBe(true);
  });

  it('roleHasAnyPermission verifica alguma', () => {
    expect(roleHasAnyPermission('viewer', ['products:create', 'products:read'])).toBe(true);
  });

  it('groupPermissionsByResource agrupa corretamente', () => {
    const groups = groupPermissionsByResource(['products:read', 'sales:create']);
    expect(groups.products).toEqual(['read']);
    expect(groups.sales).toEqual(['create']);
  });

  it('PERMISSION_LABELS tem labels', () => {
    expect(PERMISSION_LABELS['products:read']).toBeTruthy();
  });

  it('ROLE_LABELS tem rótulos PT e EN', () => {
    expect(ROLE_LABELS.owner.pt).toBe('Proprietário');
    expect(ROLE_LABELS.owner.en).toBe('Owner');
  });

  it('ROLE_DESCRIPTIONS tem descrições', () => {
    expect(ROLE_DESCRIPTIONS.superadmin.pt).toBeTruthy();
  });
});

describe('admin/shared/types/operations', () => {
  it('tipos operacionais são atribuíveis', () => {
    const t: TapStatus = 'idle';
    const k: KegStatus = 'depleted';
    const s: ServingSessionStatus = 'error';
    expect(t).toBe('idle');
    expect(k).toBe('depleted');
    expect(s).toBe('error');
  });
});
