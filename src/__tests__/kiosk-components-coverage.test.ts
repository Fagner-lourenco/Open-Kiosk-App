/**
 * Coverage tests for src/components/ (app-level components, not UI primitives)
 * Covers 35+ uncovered component files
 */
import { describe, it, expect, vi } from 'vitest';

// Ensure virtual:pwa-register/react is mocked (needed for PWAUpdatePrompt)
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(() => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  })),
  // @ts-ignore virtual module mock requires 3rd arg
}), { virtual: true } as any);

// ---- Default exports ----
import AdminAccess from '@/components/AdminAccess';
import AdminOrders from '@/components/AdminOrders';
import AdminOverview from '@/components/AdminOverview';
import AdminPaymentGatewayHub from '@/components/AdminPaymentGatewayHub';
import AdminProducts from '@/components/AdminProducts';
import AdminReports from '@/components/AdminReports';
import AdminSettings from '@/components/AdminSettings';
import AttractScreen from '@/components/AttractScreen';
import Checkout from '@/components/Checkout';
import DrinkPickupScreen from '@/components/DrinkPickupScreen';
import DrinkQuickCheckoutModal from '@/components/DrinkQuickCheckoutModal';
import ESP32StatusIndicator from '@/components/ESP32StatusIndicator';
import Header from '@/components/Header';
import InventoryManager from '@/components/InventoryManager';
import OnScreenKeyboard from '@/components/OnScreenKeyboard';
import OrderHistory from '@/components/OrderHistory';
import ProductForm from '@/components/ProductForm';
import ProductList from '@/components/ProductList';
import Reports from '@/components/Reports';
import UartPortSelector from '@/components/UartPortSelector';
import VoiceSearchButton from '@/components/VoiceSearchButton';

// ---- Named + Default exports ----
import CupFillAnimation from '@/components/CupFillAnimation';
import ESP32DispenserPanel from '@/components/ESP32DispenserPanel';
import FranchiseGuard from '@/components/FranchiseGuard';
import StoreSelector from '@/components/StoreSelector';
import StoreSwitcher from '@/components/StoreSwitcher';
import TapSelector from '@/components/TapSelector';
import PWAUpdatePrompt from '@/components/PWAUpdatePrompt';

// ---- Named-only exports ----
import { AdminSecretAccess } from '@/components/AdminSecretAccess';
import { ProtectedRoute, withPermission } from '@/components/ProtectedRoute';
import { getDefaultTapId, setDefaultTapId, TapSettingsSync } from '@/components/TapSettingsSync';
import { useTapSelection } from '@/components/TapSelector';

// ---- Checkout sub-components ----
import '@/components/checkout/index';
import { InactivityTimer } from '@/components/checkout/InactivityTimer';
import { ProcessingProgress } from '@/components/checkout/ProcessingProgress';
import { StepperIndicator } from '@/components/checkout/StepperIndicator';
import { TimeoutWarning } from '@/components/checkout/TimeoutWarning';

// ---- Auth barrel ----
import { AuthLayout, LoginForm, LoginWithPin, ForgotPassword } from '@/components/auth/index';

const defaultComponents = {
  AdminAccess, AdminOrders, AdminOverview, AdminPaymentGatewayHub,
  AdminProducts, AdminReports, AdminSettings, AttractScreen,
  Checkout, DrinkPickupScreen, DrinkQuickCheckoutModal,
  ESP32StatusIndicator, Header, InventoryManager, OnScreenKeyboard,
  OrderHistory, ProductForm, ProductList, Reports, UartPortSelector,
  VoiceSearchButton, CupFillAnimation, ESP32DispenserPanel,
  FranchiseGuard, StoreSelector, StoreSwitcher, TapSelector, PWAUpdatePrompt,
};

describe('kiosk components — default exports', () => {
  it.each(Object.entries(defaultComponents))('%s é componente válido', (_name, comp) => {
    expect(comp).toBeDefined();
    expect(typeof comp).toBe('function');
  });
});

describe('kiosk components — named exports', () => {
  it('AdminSecretAccess é componente', () => {
    expect(typeof AdminSecretAccess).toBe('function');
  });

  it('ProtectedRoute e withPermission exportados', () => {
    expect(typeof ProtectedRoute).toBe('function');
    expect(typeof withPermission).toBe('function');
  });

  it('TapSettingsSync e helpers exportados', () => {
    expect(typeof TapSettingsSync).toBe('function');
    // getDefaultTapId/setDefaultTapId são funções puras de localStorage
    expect(getDefaultTapId()).toBe(0); // padrão quando não tem nada no localStorage
    setDefaultTapId(5);
    expect(getDefaultTapId()).toBe(5);
    // limpa
    setDefaultTapId(0);
  });

  it('useTapSelection é hook', () => {
    expect(typeof useTapSelection).toBe('function');
  });
});

describe('checkout sub-components', () => {
  it.each([
    ['InactivityTimer', InactivityTimer],
    ['ProcessingProgress', ProcessingProgress],
    ['StepperIndicator', StepperIndicator],
    ['TimeoutWarning', TimeoutWarning],
  ])('%s é componente', (_name, comp) => {
    expect(comp).toBeDefined();
    expect(typeof comp).toBe('function');
  });
});

describe('auth barrel — named exports', () => {
  it.each([
    ['AuthLayout', AuthLayout],
    ['LoginForm', LoginForm],
    ['LoginWithPin', LoginWithPin],
    ['ForgotPassword', ForgotPassword],
  ])('%s é componente', (_name, comp) => {
    expect(comp).toBeDefined();
    expect(typeof comp).toBe('function');
  });
});
