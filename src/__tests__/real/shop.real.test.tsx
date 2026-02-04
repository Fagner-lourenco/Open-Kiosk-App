import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/i18n';
import Shop from '@/pages/Shop';

const mockProducts = [
  {
    id: 'product-1',
    title: 'Coca Cola',
    price: 5,
    description: 'Refrigerante',
    image: '',
    tags: ['bebida'],
    inStock: true,
    category: 'Refrigerantes',
    stock: 10,
  },
  {
    id: 'product-2',
    title: 'Água Mineral',
    price: 3,
    description: 'Água',
    image: '',
    tags: ['agua'],
    inStock: true,
    category: 'Água',
    stock: 5,
  },
];

vi.mock('@/hooks/useFirebaseProducts', () => ({
  useFirebaseProducts: () => ({ products: mockProducts, loading: false, updateProduct: vi.fn() }),
}));

vi.mock('@/hooks/useStoreSettings', () => ({
  useStoreSettings: () => ({ settings: { attractTimeoutSeconds: 5 }, loading: false, isInitialized: true }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useKioskIdle', () => ({
  useKioskIdle: () => ({ isIdle: false, resetIdle: vi.fn() }),
}));

vi.mock('@/context/ESP32Context', () => ({
  useESP32: () => ({ isConnected: true, isScanning: false, startScan: vi.fn(), stopScan: vi.fn() }),
  ESP32Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/kioskModeService', () => ({
  enterKioskMode: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/components/Cart', () => ({
  __esModule: true,
  default: ({ cartItems }: { cartItems: any[] }) => <div data-testid="cart-count">{cartItems.length}</div>,
}));

vi.mock('@/components/DrinkQuickCheckoutModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/components/DrinkPickupScreen', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/components/VoiceSearchButton', () => ({
  __esModule: true,
  default: () => <button>voice</button>,
}));

vi.mock('@/components/OnScreenKeyboard', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/components/AttractScreen', () => ({
  __esModule: true,
  default: ({ isVisible }: { isVisible: boolean }) => (isVisible ? <div data-testid="attract" /> : null),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <LanguageProvider>{children}</LanguageProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

describe('Shop Component - Testes Reais (simplificado)', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('renderiza produtos do hook', async () => {
    render(<Shop />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Coca Cola')).toBeTruthy());
    expect(screen.getByText('Água Mineral')).toBeTruthy();
  });

  it('adiciona item ao carrinho ao clicar', async () => {
    render(<Shop />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Coca Cola')).toBeTruthy());
    const addButtons = screen.getAllByRole('button', { name: /add to cart/i });
    fireEvent.click(addButtons[0]);

    expect(screen.getByTestId('cart-count').textContent).toBe('1');
  });

  it('renderiza VoiceSearchButton', async () => {
    render(<Shop />, { wrapper: Wrapper });
    
    await waitFor(() => expect(screen.getByText('voice')).toBeTruthy());
  });

  it('não mostra AttractScreen quando não está idle', async () => {
    render(<Shop />, { wrapper: Wrapper });
    
    await waitFor(() => expect(screen.getByText('Coca Cola')).toBeTruthy());
    
    // AttractScreen não deve estar visível quando isIdle = false
    expect(screen.queryByTestId('attract')).toBeNull();
  });

  it('renderiza o componente sem erros', async () => {
    const { container } = render(<Shop />, { wrapper: Wrapper });
    
    await waitFor(() => {
      expect(container.querySelector('div')).toBeTruthy();
    });
  });

  it('exibe múltiplos produtos', async () => {
    render(<Shop />, { wrapper: Wrapper });
    
    await waitFor(() => {
      const products = screen.getAllByText(/Coca Cola|Água Mineral/);
      expect(products.length).toBeGreaterThanOrEqual(2);
    });
  });
});
