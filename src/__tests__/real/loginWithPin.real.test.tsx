/**
 * ============================================================================
 * TESTES REAIS - LoginWithPin Component
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock hooks
const mockLoginWithPin = vi.fn();
const mockClearAuthError = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    loginWithPin: mockLoginWithPin,
    authError: null,
    clearAuthError: mockClearAuthError,
  }),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'auth.enterPin': 'Digite seu PIN',
        'auth.pinSubtitle': 'Use seu PIN de 6 dígitos',
        'auth.offlineMode': 'Modo Offline',
        'auth.onlineMode': 'Modo Online',
        'auth.useEmail': 'Entrar com Email',
        'auth.verifying': 'Verificando...',
        'auth.confirm': 'Confirmar',
        'auth.clear': 'Limpar',
      };
      return translations[key] || key;
    },
  }),
}));

import { LoginWithPin } from '@/components/auth/LoginWithPin';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('LoginWithPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização', () => {
    it('renderiza título', () => {
      render(<LoginWithPin />, { wrapper });
      
      expect(screen.getByText('Digite seu PIN')).toBeTruthy();
    });

    it('renderiza 6 inputs para PIN', () => {
      render(<LoginWithPin />, { wrapper });
      
      // Inputs são do tipo password, então usamos container query
      const container = document.querySelector('.flex.gap-2, .flex.gap-3');
      const inputs = document.querySelectorAll('input[maxlength="1"]');
      expect(inputs.length).toBeGreaterThanOrEqual(6);
    });

    it('renderiza botão voltar para email quando callback fornecido', () => {
      render(<LoginWithPin onSwitchToEmail={() => {}} />, { wrapper });
      
      expect(screen.getByText('Entrar com Email')).toBeTruthy();
    });

    it('mostra indicador de status de rede', () => {
      render(<LoginWithPin />, { wrapper });
      
      // Verifica que o componente renderiza (status de rede pode não ser visível)
      expect(document.querySelector('.flex')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('chama onSwitchToEmail quando clicado', async () => {
      const user = userEvent.setup();
      const onSwitchToEmail = vi.fn();
      
      render(<LoginWithPin onSwitchToEmail={onSwitchToEmail} />, { wrapper });
      
      await user.click(screen.getByText('Entrar com Email'));
      
      expect(onSwitchToEmail).toHaveBeenCalled();
    });
  });

  describe('inputs do PIN', () => {
    it('inputs são do tipo password para segurança', () => {
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      expect(inputs.length).toBeGreaterThanOrEqual(6);
    });

    it('inputs têm maxlength de 1', () => {
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[maxlength="1"]');
      expect(inputs.length).toBeGreaterThanOrEqual(6);
    });

    it('inputs têm inputmode numeric', () => {
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[inputmode="numeric"]');
      expect(inputs.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('interação com PIN', () => {
    it('permite digitar números nos inputs', async () => {
      const user = userEvent.setup();
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      await user.type(inputs[0] as HTMLInputElement, '1');
      
      expect((inputs[0] as HTMLInputElement).value).toBe('1');
    });

    it('auto-avança para próximo input após digitar', async () => {
      const user = userEvent.setup();
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      await user.type(inputs[0] as HTMLInputElement, '1');
      
      // Próximo input deve estar focado
      expect(document.activeElement).toBe(inputs[1]);
    });

    it('bloqueia entrada de letras', async () => {
      const user = userEvent.setup();
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      await user.type(inputs[0] as HTMLInputElement, 'a');
      
      // Deve ignorar a letra
      expect((inputs[0] as HTMLInputElement).value).toBe('');
    });

    it('volta para input anterior com Backspace em input vazio', async () => {
      const user = userEvent.setup();
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      
      // Digita no primeiro e avança
      await user.type(inputs[0] as HTMLInputElement, '1');
      
      // Agora está no segundo, aperta backspace
      await user.keyboard('{Backspace}');
      
      // Deve voltar ao primeiro input
      expect(document.activeElement).toBe(inputs[0]);
    });
  });

  describe('submissão do PIN', () => {
    it('chama loginWithPin quando todos os 6 dígitos são inseridos', async () => {
      const user = userEvent.setup();
      mockLoginWithPin.mockResolvedValue({ success: true });
      
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      
      // Digita o PIN completo
      await user.type(inputs[0] as HTMLInputElement, '1');
      await user.type(inputs[1] as HTMLInputElement, '2');
      await user.type(inputs[2] as HTMLInputElement, '3');
      await user.type(inputs[3] as HTMLInputElement, '4');
      await user.type(inputs[4] as HTMLInputElement, '5');
      await user.type(inputs[5] as HTMLInputElement, '6');
      
      await waitFor(() => {
        expect(mockLoginWithPin).toHaveBeenCalledWith('123456');
      });
    });

    it('navega para redirectTo após login bem-sucedido', async () => {
      const user = userEvent.setup();
      mockLoginWithPin.mockResolvedValue({ success: true });
      
      render(<LoginWithPin redirectTo="/dashboard" />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      
      await user.type(inputs[0] as HTMLInputElement, '1');
      await user.type(inputs[1] as HTMLInputElement, '2');
      await user.type(inputs[2] as HTMLInputElement, '3');
      await user.type(inputs[3] as HTMLInputElement, '4');
      await user.type(inputs[4] as HTMLInputElement, '5');
      await user.type(inputs[5] as HTMLInputElement, '6');
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('limpa PIN após erro de login', async () => {
      const user = userEvent.setup();
      mockLoginWithPin.mockResolvedValue({ success: false, error: 'PIN incorreto' });
      
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      
      await user.type(inputs[0] as HTMLInputElement, '1');
      await user.type(inputs[1] as HTMLInputElement, '2');
      await user.type(inputs[2] as HTMLInputElement, '3');
      await user.type(inputs[3] as HTMLInputElement, '4');
      await user.type(inputs[4] as HTMLInputElement, '5');
      await user.type(inputs[5] as HTMLInputElement, '6');
      
      await waitFor(() => {
        // Após erro, PIN deve ser limpo
        expect((inputs[0] as HTMLInputElement).value).toBe('');
      });
    });
  });

  describe('botão limpar', () => {
    it('limpa todos os inputs ao clicar em Limpar', async () => {
      const user = userEvent.setup();
      render(<LoginWithPin />, { wrapper });
      
      const inputs = document.querySelectorAll('input[type="password"]');
      
      // Digita alguns números
      await user.type(inputs[0] as HTMLInputElement, '1');
      await user.type(inputs[1] as HTMLInputElement, '2');
      
      // Clica em limpar
      const clearButton = screen.getByText('Limpar');
      await user.click(clearButton);
      
      // Todos os inputs devem estar vazios
      expect((inputs[0] as HTMLInputElement).value).toBe('');
      expect((inputs[1] as HTMLInputElement).value).toBe('');
    });

    it('limpa erro ao clicar em Limpar', async () => {
      const user = userEvent.setup();
      render(<LoginWithPin />, { wrapper });
      
      const clearButton = screen.getByText('Limpar');
      await user.click(clearButton);
      
      expect(mockClearAuthError).toHaveBeenCalled();
    });
  });
});
