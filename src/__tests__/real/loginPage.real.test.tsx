import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/i18n';
import { AuthProvider } from '@/context/AuthContext';
import LoginPage from '@/pages/LoginPage';

vi.mock('@/services/authService', () => ({
  authService: {
    signIn: vi.fn(),
    signInWithPin: vi.fn(),
    getCurrentUser: vi.fn(() => null),
    onAuthStateChange: vi.fn(() => () => {}),
    isInitialized: vi.fn(() => true),
    initialize: vi.fn(),
    isOfflineMode: vi.fn(() => false),
    loginWithEmail: vi.fn(() => Promise.resolve({ success: true })),
    loginWithPin: vi.fn(() => Promise.resolve({ success: true })),
    logout: vi.fn(),
    sendPasswordReset: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/lib/pathResolver', () => ({
  isFranchiseMode: vi.fn(() => true),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>{children}</AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

describe('LoginPage - smoke', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renderiza componente', async () => {
    const { container } = render(<LoginPage />, { wrapper });
    
    // Aguarda renderização
    await waitFor(() => {
      expect(container.querySelector('div')).toBeTruthy();
    });
  });

  it('mostra opcao de PIN offline ou loading', async () => {
    render(<LoginPage />, { wrapper });
    
    // Pode mostrar PIN ou loading spinner
    await waitFor(() => {
      const pinElements = screen.queryAllByText(/pin/i);
      const spinner = document.querySelector('.animate-spin');
      expect(pinElements.length > 0 || spinner !== null).toBe(true);
    });
  });

  it('renderiza dentro de um container', () => {
    const { container } = render(<LoginPage />, { wrapper });
    
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('não mostra erro no console', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<LoginPage />, { wrapper });
    
    await waitFor(() => {
      // Componente renderiza sem erro crítico
      expect(consoleSpy).not.toHaveBeenCalled();
    });
    
    consoleSpy.mockRestore();
  });
});
