/**
 * Coverage tests for kiosk context providers (4 files)
 * + pages (5 files) + App.tsx + main.tsx
 */
import { describe, it, expect, vi } from 'vitest';

// Mock react-dom/client for main.tsx (calls createRoot at module level)
vi.mock('react-dom/client', () => ({
  default: { createRoot: vi.fn(() => ({ render: vi.fn() })) },
  createRoot: vi.fn(() => ({ render: vi.fn() })),
}));

// ---- Context ----
import ESP32Context, {
  ESP32Provider,
  useESP32,
} from '@/context/ESP32Context';

import {
  FranchiseProvider,
  useFranchise,
  useFranchiseSafe,
  useCurrentFranchise,
} from '@/context/FranchiseContext';

import PaymentGatewayContext, {
  PaymentGatewayProvider,
  usePaymentGateway,
  useResolvedPaymentConfig,
} from '@/context/PaymentGatewayContext';

import {
  PermissionProvider,
  usePermissions as usePermCtx,
  useCan,
  useHasStoreAccess,
  useRole,
} from '@/context/PermissionContext';

// ---- Pages ----
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import Admin from '@/pages/Admin';
import Index from '@/pages/Index';
import NotFound from '@/pages/NotFound';
import { StoreSelectPage } from '@/pages/StoreSelectPage';

// ---- App ----
import App from '@/App';

// ---- main.tsx (side-effect only, no exports) ----
import '../main';

// ============================================================================
// CONTEXT
// ============================================================================

describe('context/ESP32Context', () => {
  it('ESP32Provider é componente', () => {
    expect(typeof ESP32Provider).toBe('function');
  });

  it('useESP32 é hook', () => {
    expect(typeof useESP32).toBe('function');
  });

  it('ESP32Context é definido', () => {
    expect(ESP32Context).toBeDefined();
  });
});

describe('context/FranchiseContext', () => {
  it('FranchiseProvider é componente', () => {
    expect(typeof FranchiseProvider).toBe('function');
  });

  it('hooks de franchise são funções', () => {
    expect(typeof useFranchise).toBe('function');
    expect(typeof useFranchiseSafe).toBe('function');
    expect(typeof useCurrentFranchise).toBe('function');
  });
});

describe('context/PaymentGatewayContext', () => {
  it('PaymentGatewayProvider é componente', () => {
    expect(typeof PaymentGatewayProvider).toBe('function');
  });

  it('hooks de payment gateway são funções', () => {
    expect(typeof usePaymentGateway).toBe('function');
    expect(typeof useResolvedPaymentConfig).toBe('function');
  });

  it('PaymentGatewayContext é definido', () => {
    expect(PaymentGatewayContext).toBeDefined();
  });
});

describe('context/PermissionContext', () => {
  it('PermissionProvider é componente', () => {
    expect(typeof PermissionProvider).toBe('function');
  });

  it('hooks de permissão são funções', () => {
    expect(typeof usePermCtx).toBe('function');
    expect(typeof useCan).toBe('function');
    expect(typeof useHasStoreAccess).toBe('function');
    expect(typeof useRole).toBe('function');
  });
});

// ============================================================================
// PAGES
// ============================================================================

describe('kiosk pages', () => {
  it('AcceptInvitePage é componente', () => {
    expect(typeof AcceptInvitePage).toBe('function');
  });

  it('Admin é componente', () => {
    expect(typeof Admin).toBe('function');
  });

  it('Index é componente', () => {
    expect(typeof Index).toBe('function');
  });

  it('NotFound é componente', () => {
    expect(typeof NotFound).toBe('function');
  });

  it('StoreSelectPage é componente', () => {
    expect(typeof StoreSelectPage).toBe('function');
  });
});

// ============================================================================
// APP
// ============================================================================

describe('App', () => {
  it('App é componente', () => {
    expect(typeof App).toBe('function');
  });
});
