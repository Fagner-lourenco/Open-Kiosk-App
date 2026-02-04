import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageContext';
import React from 'react';

// Componente de teste que usa o contexto
const TestComponent = () => {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="welcome">{t('common.welcome')}</span>
      <button onClick={() => setLanguage('pt-BR')}>PT-BR</button>
      <button onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
};

describe('LanguageContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('LanguageProvider', () => {
    it('provê idioma padrão en', () => {
      render(
        <LanguageProvider>
          <TestComponent />
        </LanguageProvider>
      );
      
      expect(screen.getByTestId('lang').textContent).toBe('en');
    });

    it('aceita initialLanguage', () => {
      render(
        <LanguageProvider initialLanguage="pt-BR">
          <TestComponent />
        </LanguageProvider>
      );
      
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });

    it('permite trocar idioma', () => {
      render(
        <LanguageProvider>
          <TestComponent />
        </LanguageProvider>
      );
      
      expect(screen.getByTestId('lang').textContent).toBe('en');
      
      fireEvent.click(screen.getByText('PT-BR'));
      
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });

    it('altera idioma na interface ao clicar', () => {
      render(
        <LanguageProvider>
          <TestComponent />
        </LanguageProvider>
      );
      
      expect(screen.getByTestId('lang').textContent).toBe('en');
      fireEvent.click(screen.getByText('PT-BR'));
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });

    it('usa idioma passado como initialLanguage quando localStorage vazio', () => {
      // localStorage está vazio após beforeEach clear
      render(
        <LanguageProvider initialLanguage="pt-BR">
          <TestComponent />
        </LanguageProvider>
      );
      
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });
  });

  describe('t (traduções)', () => {
    it('retorna tradução para chave existente', () => {
      render(
        <LanguageProvider>
          <TestComponent />
        </LanguageProvider>
      );
      
      // Verifica que existe algo no elemento de tradução
      expect(screen.getByTestId('welcome').textContent).toBeTruthy();
    });
  });
});
