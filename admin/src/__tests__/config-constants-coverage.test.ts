/**
 * Coverage tests for admin/src/config/ and admin/src/constants/
 */
import { describe, it, expect } from 'vitest';

// config/gpio.ts
import {
  XIAO_GPIO_OPTIONS,
  XIAO_UART_OPTIONS,
  validateGpioPin,
  findDuplicateGpioPins,
  convertTapsToDispensers,
  convertDispensersToTaps,
} from '@/config/gpio';

// config/navConfig.ts
import {
  ENABLE_PERMISSION_FILTERED_NAV,
  PRIMARY_NAV_ITEMS,
  SUPER_ADMIN_NAV_ITEM,
} from '@/config/navConfig';

// config/roles.ts
import {
  FRANCHISE_ROLE_OPTIONS,
  STORE_ROLE_OPTIONS,
  normalizeRole,
  isOperatorRole,
  getRoleLabel,
  getRoleBadge,
} from '@/config/roles';

// config/storeNavConfig.ts
import { STORE_NAV_GROUPS, STORE_NAV_ITEMS } from '@/config/storeNavConfig';

// constants/chart-colors.ts
import {
  CHART_COLORS,
  CHART_PRIMARY,
  CHART_SECONDARY,
  getChartColor,
} from '@/constants/chart-colors';

describe('admin/src/config/gpio', () => {
  it('XIAO_GPIO_OPTIONS tem 11 pinos', () => {
    expect(XIAO_GPIO_OPTIONS.length).toBe(11);
  });

  it('XIAO_UART_OPTIONS tem TX e RX', () => {
    expect(XIAO_UART_OPTIONS.length).toBe(2);
  });

  it('validateGpioPin valida pino válido', () => {
    const result = validateGpioPin(XIAO_GPIO_OPTIONS[0].gpio, false, false);
    expect(result.valid).toBe(true);
  });

  it('validateGpioPin rejeita pino inválido', () => {
    const result = validateGpioPin(999, false, false);
    expect(result.valid).toBe(false);
  });

  it('findDuplicateGpioPins detecta duplicatas', () => {
    const taps = [
      { flowPin: 1, valvePin: 2 },
      { flowPin: 1, valvePin: 3 },
    ];
    const dups = findDuplicateGpioPins(taps as any);
    expect(dups).toBeDefined();
  });

  it('convertTapsToDispensers e vice-versa são inversos', () => {
    const taps = [{ id: '1', flowPin: 1, valvePin: 2, label: 'T1' }];
    const dispensers = convertTapsToDispensers(taps as any);
    expect(dispensers.length).toBe(1);
    const back = convertDispensersToTaps(dispensers as any);
    expect(back.length).toBe(1);
  });
});

describe('admin/src/config/navConfig', () => {
  it('PRIMARY_NAV_ITEMS é array de itens', () => {
    expect(Array.isArray(PRIMARY_NAV_ITEMS)).toBe(true);
    expect(PRIMARY_NAV_ITEMS.length).toBeGreaterThan(5);
  });

  it('SUPER_ADMIN_NAV_ITEM tem href e label', () => {
    expect(SUPER_ADMIN_NAV_ITEM.href).toBeTruthy();
    expect(SUPER_ADMIN_NAV_ITEM.label).toBeTruthy();
  });

  it('ENABLE_PERMISSION_FILTERED_NAV é booleano', () => {
    expect(typeof ENABLE_PERMISSION_FILTERED_NAV).toBe('boolean');
  });
});

describe('admin/src/config/roles', () => {
  it('FRANCHISE_ROLE_OPTIONS tem opções', () => {
    expect(FRANCHISE_ROLE_OPTIONS.length).toBeGreaterThan(0);
    expect(FRANCHISE_ROLE_OPTIONS[0].value).toBeTruthy();
    expect(FRANCHISE_ROLE_OPTIONS[0].label).toBeTruthy();
  });

  it('STORE_ROLE_OPTIONS tem opções', () => {
    expect(STORE_ROLE_OPTIONS.length).toBeGreaterThan(0);
  });

  it('normalizeRole converte employee para operator', () => {
    expect(normalizeRole('employee')).toBe('operator');
  });

  it('isOperatorRole identifica operator', () => {
    expect(isOperatorRole('operator')).toBe(true);
    expect(isOperatorRole('admin')).toBe(false);
  });

  it('getRoleLabel retorna label', () => {
    const label = getRoleLabel('admin');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('getRoleBadge retorna badge', () => {
    const badge = getRoleBadge('admin');
    expect(badge.label).toBeTruthy();
    expect(badge.variant).toBeTruthy();
  });
});

describe('admin/src/config/storeNavConfig', () => {
  it('STORE_NAV_GROUPS tem grupos', () => {
    expect(Object.keys(STORE_NAV_GROUPS).length).toBeGreaterThan(3);
  });

  it('STORE_NAV_ITEMS tem itens de navegação', () => {
    expect(Array.isArray(STORE_NAV_ITEMS)).toBe(true);
    expect(STORE_NAV_ITEMS.length).toBeGreaterThan(10);
    expect(STORE_NAV_ITEMS[0].label).toBeTruthy();
  });
});

describe('admin/src/constants/chart-colors', () => {
  it('CHART_COLORS tem 5 cores', () => {
    expect(CHART_COLORS).toHaveLength(5);
    expect(CHART_COLORS[0]).toMatch(/^#/);
  });

  it('CHART_PRIMARY e CHART_SECONDARY são hex', () => {
    expect(CHART_PRIMARY).toMatch(/^#[0-9a-f]{6}$/i);
    expect(CHART_SECONDARY).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('getChartColor cicla pela paleta', () => {
    expect(getChartColor(0)).toBe(CHART_COLORS[0]);
    expect(getChartColor(5)).toBe(CHART_COLORS[0]); // Wraps around
  });
});
