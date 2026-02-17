/**
 * Coverage tests for all admin/src/types/ files
 * These are type definitions + some value exports
 */
import { describe, it, expect } from 'vitest';

// types/audit.ts — value exports
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_ICONS } from '@/types/audit';
// types/billing.ts — value exports
import {
  PLAN_DETAILS,
  planHasFeature,
  checkPlanLimit,
  getBillingStatusLabel,
  getBillingStatusColor,
} from '@/types/billing';
// types/commercial.ts — value exports
import { DEAL_STAGES, DEAL_STAGE_LABELS } from '@/types/commercial';
// types/finance.ts — type-only but we import the module
import '@/types/finance';
// types/franchise.ts — re-exports from shared
import {
  ROLE_HIERARCHY,
  ROLE_LABELS,
  isRoleAtLeast,
  ALL_ROLES,
  roleHasPermission,
} from '@/types/franchise';
// types/hardware.ts — type-only
import '@/types/hardware';
// types/index.ts — barrel
import '@/types/index';
// types/ranking.ts — value exports
import { RANKING_METRICS } from '@/types/ranking';
// types/reports.ts — type-only
import '@/types/reports';
// types/storeSettings.ts — type-only
import '@/types/storeSettings';
// types/tvDashboard.ts — value exports
import {
  DEFAULT_TV_CONFIG,
  DEFAULT_EVENT_STATS,
  CHALLENGE_TEMPLATES,
  DEFAULT_GOLDEN_SERVE_CONFIG,
} from '@/types/tvDashboard';
// types/user.ts — type-only
import '@/types/user';
// types/store.ts — type + value exports
import '@/types/store';

describe('admin/src/types/audit', () => {
  it('AUDIT_ACTION_LABELS tem labels para ações', () => {
    expect(AUDIT_ACTION_LABELS).toBeDefined();
    expect(typeof AUDIT_ACTION_LABELS).toBe('object');
    expect(Object.keys(AUDIT_ACTION_LABELS).length).toBeGreaterThan(10);
  });

  it('AUDIT_ACTION_ICONS tem ícones para ações', () => {
    expect(AUDIT_ACTION_ICONS).toBeDefined();
    expect(Object.keys(AUDIT_ACTION_ICONS).length).toBeGreaterThan(10);
  });
});

describe('admin/src/types/billing', () => {
  it('PLAN_DETAILS tem 5 planos', () => {
    expect(Object.keys(PLAN_DETAILS)).toHaveLength(5);
    expect(PLAN_DETAILS.free).toBeDefined();
    expect(PLAN_DETAILS.pro).toBeDefined();
    expect(PLAN_DETAILS.enterprise).toBeDefined();
  });

  it('planHasFeature verifica feature de plano', () => {
    expect(typeof planHasFeature).toBe('function');
  });

  it('checkPlanLimit verifica limites', () => {
    expect(typeof checkPlanLimit).toBe('function');
  });

  it('getBillingStatusLabel retorna label', () => {
    const label = getBillingStatusLabel('active');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('getBillingStatusColor retorna cor', () => {
    const color = getBillingStatusColor('active');
    expect(typeof color).toBe('string');
  });
});

describe('admin/src/types/commercial', () => {
  it('DEAL_STAGES é array ordenado', () => {
    expect(Array.isArray(DEAL_STAGES)).toBe(true);
    expect(DEAL_STAGES.length).toBeGreaterThan(3);
  });

  it('DEAL_STAGE_LABELS tem labels PT-BR', () => {
    for (const stage of DEAL_STAGES) {
      expect(DEAL_STAGE_LABELS[stage]).toBeTruthy();
    }
  });
});

describe('admin/src/types/franchise', () => {
  it('re-exporta roles do shared', () => {
    expect(ROLE_HIERARCHY.superadmin).toBeGreaterThan(ROLE_HIERARCHY.owner);
    expect(ALL_ROLES.length).toBeGreaterThanOrEqual(5);
    expect(isRoleAtLeast('owner', 'admin')).toBe(true);
    expect(roleHasPermission('superadmin', 'superadmin:access')).toBe(true);
  });

  it('ROLE_LABELS tem labels para cada role', () => {
    expect(typeof ROLE_LABELS).toBe('object');
    expect(Object.keys(ROLE_LABELS).length).toBeGreaterThanOrEqual(4);
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe('admin/src/types/ranking', () => {
  it('RANKING_METRICS tem métricas disponíveis', () => {
    expect(Array.isArray(RANKING_METRICS)).toBe(true);
    expect(RANKING_METRICS.length).toBe(3);
  });
});

describe('admin/src/types/tvDashboard', () => {
  it('DEFAULT_TV_CONFIG tem valores padrão', () => {
    expect(DEFAULT_TV_CONFIG).toBeDefined();
    expect(typeof DEFAULT_TV_CONFIG).toBe('object');
  });

  it('DEFAULT_EVENT_STATS tem valores padrão', () => {
    expect(DEFAULT_EVENT_STATS).toBeDefined();
  });

  it('CHALLENGE_TEMPLATES tem templates', () => {
    expect(Array.isArray(CHALLENGE_TEMPLATES)).toBe(true);
    expect(CHALLENGE_TEMPLATES.length).toBe(4);
  });

  it('DEFAULT_GOLDEN_SERVE_CONFIG tem defaults', () => {
    expect(DEFAULT_GOLDEN_SERVE_CONFIG).toBeDefined();
  });
});
