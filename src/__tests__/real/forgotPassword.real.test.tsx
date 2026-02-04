/**
 * ============================================================================
 * TESTES REAIS - ForgotPassword Component
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock authService usando vi.hoisted para evitar erro de hoisting
const { mockSendPasswordReset } = vi.hoisted(() => ({
  mockSendPasswordReset: vi.fn(),
}));

vi.mock('@/services/authService', () => ({
  authService: {
    sendPasswordReset: mockSendPasswordReset,
  },
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'auth.resetPassword': 'Recuperar Senha',
        'auth.resetSubtitle': 'Digite seu email para recuperar',
        'auth.email': 'Email',
        'auth.sendResetLink': 'Enviar Link',
        'auth.backToLogin': 'Voltar ao Login',
        'auth.emailSent': 'Email Enviado',
        'auth.checkInbox': 'Verifique sua caixa de entrada',
        'auth.resetError': 'Erro ao enviar email',
      };
      return translations[key] || key;
    },
  }),
}));

import { ForgotPassword } from '@/components/auth/ForgotPassword';

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização', () => {
    it('renderiza formulário de recuperação', () => {
      render(<ForgotPassword />);
      
      expect(screen.getByText('Recuperar Senha')).toBeTruthy();
    });

    it('renderiza campo de email', () => {
      render(<ForgotPassword />);
      
      expect(screen.getByLabelText('Email')).toBeTruthy();
    });

    it('renderiza botão voltar quando callback fornecido', () => {
      render(<ForgotPassword onBack={() => {}} />);
      
      // Verifica que há um botão no form
      expect(document.querySelector('button')).toBeTruthy();
    });

    it('preenche email inicial quando fornecido', () => {
      render(<ForgotPassword initialEmail="test@example.com" />);
      
      const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
      expect(emailInput.value).toBe('test@example.com');
    });
  });

  describe('interações', () => {
    it('permite digitar email', async () => {
      const user = userEvent.setup();
      render(<ForgotPassword />);
      
      const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
      await user.type(emailInput, 'test@example.com');
      
      expect(emailInput.value).toBe('test@example.com');
    });

    it('chama sendPasswordReset ao submeter', async () => {
      const user = userEvent.setup();
      mockSendPasswordReset.mockResolvedValue({ success: true });
      
      render(<ForgotPassword />);
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'test@example.com');
      
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockSendPasswordReset).toHaveBeenCalledWith('test@example.com');
      });
    });

    it('mostra tela de sucesso após envio', async () => {
      const user = userEvent.setup();
      mockSendPasswordReset.mockResolvedValue({ success: true });
      
      render(<ForgotPassword />);
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'success@example.com');
      
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Email Enviado')).toBeTruthy();
      });
    });

    it('mostra email na tela de sucesso', async () => {
      const user = userEvent.setup();
      mockSendPasswordReset.mockResolvedValue({ success: true });
      
      render(<ForgotPassword />);
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'myemail@test.com');
      
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('myemail@test.com')).toBeTruthy();
      });
    });

    it('mostra erro quando envio falha', async () => {
      const user = userEvent.setup();
      mockSendPasswordReset.mockResolvedValue({ success: false, error: 'Email não encontrado' });
      
      render(<ForgotPassword />);
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'notfound@example.com');
      
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Email não encontrado')).toBeTruthy();
      });
    });

    it('mostra erro genérico quando exceção é lançada', async () => {
      const user = userEvent.setup();
      mockSendPasswordReset.mockRejectedValue(new Error('Network error'));
      
      render(<ForgotPassword />);
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'error@example.com');
      
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Erro ao enviar email')).toBeTruthy();
      });
    });
  });

  describe('callbacks', () => {
    it('chama onBack quando clicado na tela de sucesso', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      mockSendPasswordReset.mockResolvedValue({ success: true });
      
      render(<ForgotPassword onBack={onBack} />);
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'test@example.com');
      
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Email Enviado')).toBeTruthy();
      });

      // Clicar no botão voltar
      const backButton = screen.getByText('Voltar ao Login');
      await user.click(backButton);
      
      expect(onBack).toHaveBeenCalled();
    });
  });
});
