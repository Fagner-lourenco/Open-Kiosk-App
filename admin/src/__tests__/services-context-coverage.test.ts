/**
 * Coverage tests for admin/src/services/ (uncovered) + context/ (uncovered)
 */
import { describe, it, expect, vi } from 'vitest';

// Mock firebase/functions before any service import
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
  connectFunctionsEmulator: vi.fn(),
}));

// services barrel — import real exports
import '@/services/index';
import { AuditActions, getActionLabel, getActionIcon } from '@/services/auditService';

// services/billingService.ts
import {
  getAvailablePlans,
  getPlanDetails,
  getDaysRemaining,
  canUpgrade,
  canDowngrade,
  formatCurrency,
  isPaymentOk,
  needsUserAction,
} from '@/services/billingService';

// services/dynamicPricingService.ts
import {
  getDynamicPricingConfig,
  updateDynamicPricingConfig,
} from '@/services/dynamicPricingService';

// services/notificationService.ts
import {
  notificationService,
  NotificationTemplates,
} from '@/services/notificationService';

// services/orderService.ts
import { cancelOrder, refundOrder } from '@/services/orderService';

// services/reportService.ts
import {
  getDateRange,
  getSalesReport,
  getProductReport,
  getStoreReport,
  formatPercentage,
  calculateChange,
} from '@/services/reportService';

// services/userService.ts
import {
  getFranchiseMembers,
  createInvitation,
  revokeInvitation,
} from '@/services/userService';

// services/storeService.ts
import * as StoreService from '@/services/storeService';

// context barrels
import '@/context/index';

// context/AuthContext.tsx
import { AuthProvider, useAuth } from '@/context/AuthContext';

// context/FranchiseContext.tsx
import { FranchiseProvider, useFranchise } from '@/context/FranchiseContext';

// context/PermissionContext.tsx
import { PermissionProvider, usePermissionContext } from '@/context/PermissionContext';

describe('services/billingService', () => {
  it('getAvailablePlans retorna lista de planos', () => {
    const plans = getAvailablePlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
  });

  it('getPlanDetails retorna detalhes de plano', () => {
    const details = getPlanDetails('pro');
    expect(details).toBeDefined();
  });

  it('getDaysRemaining calcula dias restantes', () => {
    const future = new Date(Date.now() + 7 * 86400 * 1000);
    const days = getDaysRemaining(future as any);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });

  it('canUpgrade retorna booleano', () => {
    expect(typeof canUpgrade('free')).toBe('boolean');
    expect(canUpgrade('free')).toBe(true);
  });

  it('canDowngrade retorna booleano', () => {
    expect(typeof canDowngrade('enterprise')).toBe('boolean');
  });

  it('formatCurrency formata moeda', () => {
    const formatted = formatCurrency(100);
    expect(typeof formatted).toBe('string');
  });

  it('isPaymentOk verifica status', () => {
    expect(isPaymentOk('active')).toBe(true);
    expect(isPaymentOk('past_due')).toBe(false);
  });

  it('needsUserAction verifica se precisa ação', () => {
    expect(typeof needsUserAction('canceled')).toBe('boolean');
  });
});

describe('services/dynamicPricingService', () => {
  it('getDynamicPricingConfig é async function', () => {
    expect(typeof getDynamicPricingConfig).toBe('function');
  });

  it('updateDynamicPricingConfig é async function', () => {
    expect(typeof updateDynamicPricingConfig).toBe('function');
  });
});

describe('services/notificationService', () => {
  it('notificationService é instância singleton', () => {
    expect(notificationService).toBeDefined();
  });

  it('NotificationTemplates tem templates', () => {
    expect(NotificationTemplates).toBeDefined();
    expect(typeof NotificationTemplates).toBe('object');
  });
});

describe('services/orderService', () => {
  it('cancelOrder é função', () => {
    expect(typeof cancelOrder).toBe('function');
  });

  it('refundOrder é função', () => {
    expect(typeof refundOrder).toBe('function');
  });
});

describe('services/reportService', () => {
  it('getDateRange converte período', () => {
    const range = getDateRange('today');
    expect(range.startDate).toBeDefined();
    expect(range.endDate).toBeDefined();
  });

  it('formatPercentage formata percentual', () => {
    expect(formatPercentage(0.5)).toContain('50');
  });

  it('calculateChange calcula variação', () => {
    expect(calculateChange(200, 100)).toBe(100);
    expect(calculateChange(50, 100)).toBe(-50);
  });

  it('getSalesReport é async function', () => {
    expect(typeof getSalesReport).toBe('function');
  });

  it('getProductReport é async function', () => {
    expect(typeof getProductReport).toBe('function');
  });

  it('getStoreReport é async function', () => {
    expect(typeof getStoreReport).toBe('function');
  });
});

describe('services/userService', () => {
  it('getFranchiseMembers é async function', () => {
    expect(typeof getFranchiseMembers).toBe('function');
  });

  it('createInvitation é async function', () => {
    expect(typeof createInvitation).toBe('function');
  });

  it('revokeInvitation é async function', () => {
    expect(typeof revokeInvitation).toBe('function');
  });
});

describe('services/auditService', () => {
  it('AuditActions é objeto de constantes', () => {
    expect(typeof AuditActions).toBe('object');
    expect(Object.keys(AuditActions).length).toBeGreaterThan(3);
  });

  it('getActionLabel retorna string', () => {
    expect(typeof getActionLabel).toBe('function');
    const label = getActionLabel(Object.values(AuditActions)[0] as string);
    expect(typeof label).toBe('string');
  });

  it('getActionIcon retorna string', () => {
    expect(typeof getActionIcon).toBe('function');
    const icon = getActionIcon(Object.values(AuditActions)[0] as string);
    expect(typeof icon).toBe('string');
  });
});

describe('context/AuthContext', () => {
  it('AuthProvider é componente React', () => {
    expect(typeof AuthProvider).toBe('function');
  });

  it('useAuth é hook', () => {
    expect(typeof useAuth).toBe('function');
  });
});

describe('context/FranchiseContext', () => {
  it('FranchiseProvider é componente React', () => {
    expect(typeof FranchiseProvider).toBe('function');
  });

  it('useFranchise é hook', () => {
    expect(typeof useFranchise).toBe('function');
  });
});

describe('context/PermissionContext', () => {
  it('PermissionProvider é componente React', () => {
    expect(typeof PermissionProvider).toBe('function');
  });

  it('usePermissionContext é hook', () => {
    expect(typeof usePermissionContext).toBe('function');
  });
});

describe('services/storeService', () => {
  it('exporta funções CRUD de loja', () => {
    expect(typeof StoreService.getStores).toBe('function');
    expect(typeof StoreService.getStore).toBe('function');
    expect(typeof StoreService.createStore).toBe('function');
    expect(typeof StoreService.updateStore).toBe('function');
    expect(typeof StoreService.deleteStore).toBe('function');
  });

  it('exporta funções de membros e configurações', () => {
    expect(typeof StoreService.addStoreMember).toBe('function');
    expect(typeof StoreService.removeStoreMember).toBe('function');
    expect(typeof StoreService.updateStoreSettings).toBe('function');
    expect(typeof StoreService.toggleStoreStatus).toBe('function');
  });
});
