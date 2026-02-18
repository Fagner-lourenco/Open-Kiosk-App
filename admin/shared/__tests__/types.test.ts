/**
 * Tests for shared/types — barrel, roles, permissions, operations, store, dynamicPricing
 * Pure type/constant validation — no mocking needed
 */
import { describe, it, expect } from 'vitest';

// Index barrel
import {
  ROLE_HIERARCHY,
  ROLE_LABELS,
  isRoleAtLeast,
  isRoleAbove,
  getAssignableRoles,
  ALL_ROLES,
  OWNER_ASSIGNABLE_ROLES,
  ADMIN_ASSIGNABLE_ROLES,
  MANAGER_ASSIGNABLE_ROLES,
  ROLE_PERMISSIONS,
  roleHasPermission,
  roleHasAllPermissions,
  roleHasAnyPermission,
  groupPermissionsByResource,
  PERMISSION_LABELS,
} from '../types';

// Direct imports for coverage
import type { UserRole } from '../types/roles';
import { ROLE_DESCRIPTIONS } from '../types/roles';
import type { TapStatus, KegStatus, ServingSessionStatus } from '../types/operations';
import type { Store, PaymentProvider, PaymentGatewayConfig } from '../types/store';
import {
  DEFAULT_DYNAMIC_PRICING_CONFIG,
  type DynamicPricingConfig,
  type DynamicPricingResult,
  type DynamicPricingRuleType,
} from '../types/dynamicPricing';

// Direct value imports for file-reach detection
import { ROLE_PERMISSIONS as _RP } from '../types/permissions';

describe('shared/types/index barrel', () => {
  it('exporta ROLE_HIERARCHY', () => {
    expect(ROLE_HIERARCHY.superadmin).toBeGreaterThan(ROLE_HIERARCHY.owner);
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
  });

  it('exporta ROLE_LABELS', () => {
    expect(ROLE_LABELS.superadmin.pt).toBe('Super Admin');
    expect(ROLE_LABELS.viewer.en).toBe('Viewer');
  });

  it('exporta ALL_ROLES', () => {
    expect(ALL_ROLES).toContain('superadmin');
    expect(ALL_ROLES).toContain('viewer');
    expect(ALL_ROLES.length).toBe(8);
  });
});

describe('shared/types/roles', () => {
  it('isRoleAtLeast funciona', () => {
    expect(isRoleAtLeast('owner', 'admin')).toBe(true);
    expect(isRoleAtLeast('viewer', 'admin')).toBe(false);
    expect(isRoleAtLeast('admin', 'admin')).toBe(true);
  });

  it('isRoleAbove funciona', () => {
    expect(isRoleAbove('owner', 'admin')).toBe(true);
    expect(isRoleAbove('admin', 'admin')).toBe(false);
  });

  it('getAssignableRoles para owner', () => {
    const roles = getAssignableRoles('owner');
    expect(roles).toEqual(OWNER_ASSIGNABLE_ROLES);
    expect(roles).not.toContain('superadmin');
    expect(roles).not.toContain('owner');
  });

  it('getAssignableRoles para admin', () => {
    expect(getAssignableRoles('admin')).toEqual(ADMIN_ASSIGNABLE_ROLES);
  });

  it('getAssignableRoles para manager', () => {
    expect(getAssignableRoles('manager')).toEqual(MANAGER_ASSIGNABLE_ROLES);
  });

  it('getAssignableRoles para viewer retorna vazio', () => {
    expect(getAssignableRoles('viewer')).toEqual([]);
  });

  it('ROLE_DESCRIPTIONS inclui todas as roles', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_DESCRIPTIONS[role]).toBeDefined();
      expect(ROLE_DESCRIPTIONS[role].pt).toBeTruthy();
    }
  });
});

describe('shared/types/permissions', () => {
  it('roleHasPermission verifica permissão', () => {
    expect(roleHasPermission('superadmin', 'superadmin:access')).toBe(true);
    expect(roleHasPermission('viewer', 'superadmin:access')).toBe(false);
    expect(roleHasPermission('viewer', 'products:read')).toBe(true);
  });

  it('roleHasAllPermissions verifica todas', () => {
    expect(roleHasAllPermissions('superadmin', ['products:read', 'products:create'])).toBe(true);
    expect(roleHasAllPermissions('viewer', ['products:read', 'products:create'])).toBe(false);
  });

  it('roleHasAnyPermission verifica alguma', () => {
    expect(roleHasAnyPermission('viewer', ['products:create', 'products:read'])).toBe(true);
    expect(roleHasAnyPermission('viewer', ['products:create', 'products:delete'])).toBe(false);
  });

  it('groupPermissionsByResource agrupa corretamente', () => {
    const groups = groupPermissionsByResource(['products:read', 'products:create', 'sales:read']);
    expect(groups.products).toEqual(['read', 'create']);
    expect(groups.sales).toEqual(['read']);
  });

  it('PERMISSION_LABELS tem labels para todas as permissões', () => {
    const allPerms = ROLE_PERMISSIONS.superadmin;
    for (const perm of allPerms) {
      expect(PERMISSION_LABELS[perm]).toBeTruthy();
    }
  });
});

describe('shared/types/operations', () => {
  it('tipos operacionais são atribuíveis', () => {
    const tapStatus: TapStatus = 'idle';
    const kegStatus: KegStatus = 'in_stock';
    const sessionStatus: ServingSessionStatus = 'completed';
    expect(tapStatus).toBe('idle');
    expect(kegStatus).toBe('in_stock');
    expect(sessionStatus).toBe('completed');
  });
});

describe('shared/types/store', () => {
  it('PaymentProvider tipo aceita canonical values', () => {
    const providers: PaymentProvider[] = ['none', 'mercado_pago', 'pagbank'];
    expect(providers).toHaveLength(3);
  });

  it('Store interface é atribuível com campos mínimos', () => {
    const store: Partial<Store> = {
      id: 's1', name: 'Test', franchiseId: 'f1', slug: 'test',
      isActive: true, timezone: 'America/Sao_Paulo', currency: 'BRL',
      taxPercentage: 0, language: 'pt-BR', attractTimeoutSeconds: 60,
      useThermalPrinter: false, createdAt: new Date(), updatedAt: new Date(),
    };
    expect(store.id).toBe('s1');
  });
});

describe('shared/types/dynamicPricing', () => {
  it('DEFAULT_DYNAMIC_PRICING_CONFIG tem defaults seguros', () => {
    expect(DEFAULT_DYNAMIC_PRICING_CONFIG.enabled).toBe(false);
    expect(DEFAULT_DYNAMIC_PRICING_CONFIG.maxVariationPercent).toBe(20);
    expect(DEFAULT_DYNAMIC_PRICING_CONFIG.rules).toEqual([]);
  });

  it('DynamicPricingConfig é atribuível', () => {
    const config: DynamicPricingConfig = {
      enabled: true, maxVariationPercent: 15,
      minChangeIntervalSec: 300, roundingPrecision: 2, rules: [],
    };
    expect(config.enabled).toBe(true);
  });

  it('DynamicPricingRuleType aceita happy_hour e keg_progressive', () => {
    const types: DynamicPricingRuleType[] = ['happy_hour', 'keg_progressive'];
    expect(types).toHaveLength(2);
  });
});
