/**
 * ============================================================================
 * TESTES REAIS - AuthContext
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

vi.unmock('@/context/AuthContext');

// Mock authService usando vi.hoisted para evitar erro de hoisting
const {
  mockOnAuthStateChange,
  mockLoginWithEmail,
  mockLoginWithPin,
  mockLogout,
  mockIsInitialized,
  mockInitialize,
  mockIsOfflineMode,
  mockIsFranchiseMode,
} = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(() => () => { }),
  mockLoginWithEmail: vi.fn(),
  mockLoginWithPin: vi.fn(),
  mockLogout: vi.fn(),
  mockIsInitialized: vi.fn(() => true),
  mockInitialize: vi.fn(),
  mockIsOfflineMode: vi.fn(() => false),
  mockIsFranchiseMode: vi.fn(() => false),
}));

vi.mock('@/services/authService', () => ({
  authService: {
    onAuthStateChange: mockOnAuthStateChange,
    loginWithEmail: mockLoginWithEmail,
    loginWithPin: mockLoginWithPin,
    logout: mockLogout,
    isInitialized: mockIsInitialized,
    initialize: mockInitialize,
    isOfflineMode: mockIsOfflineMode,
  },
}));

vi.mock('@/lib/pathResolver', () => ({
  isFranchiseMode: mockIsFranchiseMode,
}));

import { AuthContextProvider, useAuth } from '@/context/AuthContext';

// Componente de teste
const TestConsumer = () => {
  const {
    user,
    isAuthenticated,
    isOfflineMode,
    isLoading,
    sessionTimeout,
    authError,
    setIsAuthenticated,
    setSessionTimeout,
    logout,
    loginWithEmail,
    loginWithPin,
    clearAuthError,
  } = useAuth();

  return (
    <div>
      <span data-testid="user">{user?.email || 'null'}</span>
      <span data-testid="authenticated">{isAuthenticated.toString()}</span>
      <span data-testid="offline">{isOfflineMode.toString()}</span>
      <span data-testid="loading">{isLoading.toString()}</span>
      <span data-testid="timeout">{sessionTimeout}</span>
      <span data-testid="error">{authError || 'null'}</span>
      <button onClick={() => setIsAuthenticated(true)}>Set Auth</button>
      <button onClick={() => setSessionTimeout(60)}>Set Timeout</button>
      <button onClick={logout}>Logout</button>
      <button onClick={() => loginWithEmail('test@test.com', 'pass')}>Login Email</button>
      <button onClick={() => loginWithPin('123456')}>Login PIN</button>
      <button onClick={clearAuthError}>Clear Error</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFranchiseMode.mockReturnValue(false);
  });

  describe('AuthContextProvider', () => {
    it('renderiza children', () => {
      render(
        <AuthContextProvider>
          <div data-testid="child">Child content</div>
        </AuthContextProvider>
      );

      expect(screen.getByTestId('child')).toBeTruthy();
    });

    it('provê estado inicial de não autenticado', () => {
      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });

    it('provê timeout de sessão padrão de 30 minutos', () => {
      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(screen.getByTestId('timeout').textContent).toBe('30');
    });

    it('inicia sem erro', () => {
      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(screen.getByTestId('error').textContent).toBe('null');
    });

    it('user é null quando não autenticado', () => {
      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(screen.getByTestId('user').textContent).toBe('null');
    });
  });

  describe('useAuth', () => {
    it('lança erro quando usado fora do Provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('useAuth deve ser usado dentro de AuthContextProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('setIsAuthenticated', () => {
    it('atualiza estado de autenticação', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(screen.getByTestId('authenticated').textContent).toBe('false');

      await user.click(screen.getByText('Set Auth'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });
    });
  });

  describe('setSessionTimeout', () => {
    it('atualiza timeout de sessão', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(screen.getByTestId('timeout').textContent).toBe('30');

      await user.click(screen.getByText('Set Timeout'));

      await waitFor(() => {
        expect(screen.getByTestId('timeout').textContent).toBe('60');
      });
    });
  });

  describe('logout', () => {
    it('reseta estado de autenticação', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      // Primeiro autentica
      await user.click(screen.getByText('Set Auth'));
      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      // Depois faz logout
      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
    });
  });

  describe('modo franquia', () => {
    it('inicializa authService em modo franquia', () => {
      mockIsFranchiseMode.mockReturnValue(true);
      mockIsInitialized.mockReturnValue(false);

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(mockInitialize).toHaveBeenCalled();
    });

    it('registra listener de auth state', () => {
      mockIsFranchiseMode.mockReturnValue(true);

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });
  });

  describe('loginWithEmail', () => {
    it('chama authService.loginWithEmail', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      mockLoginWithEmail.mockResolvedValue({ success: true });

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      await user.click(screen.getByText('Login Email'));

      await waitFor(() => {
        expect(mockLoginWithEmail).toHaveBeenCalledWith('test@test.com', 'pass');
      });
    });
  });

  describe('loginWithPin', () => {
    it('chama authService.loginWithPin em modo franquia', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      mockIsFranchiseMode.mockReturnValue(true);
      mockLoginWithPin.mockResolvedValue({ success: true });

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      await user.click(screen.getByText('Login PIN'));

      await waitFor(() => {
        expect(mockLoginWithPin).toHaveBeenCalledWith('123456');
      });
    });

    it('marca autenticado via PIN em modo legado sem chamar authService', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      mockIsFranchiseMode.mockReturnValue(false);

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      await user.click(screen.getByText('Login PIN'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      // Não deve chamar authService em modo legado
      expect(mockLoginWithPin).not.toHaveBeenCalled();
    });
  });

  describe('clearAuthError', () => {
    it('limpa erro de autenticação', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();

      render(
        <AuthContextProvider>
          <TestConsumer />
        </AuthContextProvider>
      );

      await user.click(screen.getByText('Clear Error'));

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('null');
      });
    });
  });
});
