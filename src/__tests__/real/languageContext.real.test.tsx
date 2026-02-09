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
        <LanguageProvider initialLanguage="pt-BR" isKiosk={true} storeId="store-1">
          <TestComponent />
        </LanguageProvider>
      );

      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });

    it('Firestore sobrescreve localStorage se não houver override manual (Fonte Única)', () => {
      localStorage.setItem('kiosk_language_store-1', 'en');

      render(
        <LanguageProvider initialLanguage="pt-BR" isKiosk={true} storeId="store-1">
          <TestComponent />
        </LanguageProvider>
      );

      // Deve mudar de 'en' para 'pt-BR' porque veio do initialLanguage (Firebase)
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });

    it('mantém idioma local se houver override manual nesta sessão', () => {
      const { rerender } = render(
        <LanguageProvider initialLanguage="en" isKiosk={true} storeId="store-1">
          <TestComponent />
        </LanguageProvider>
      );

      // Simula mudança manual
      fireEvent.click(screen.getByText('PT-BR'));
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');

      // Simula update vindo do Firebase (mudou para 'en' de novo na nuvem)
      rerender(
        <LanguageProvider initialLanguage="en" isKiosk={true} storeId="store-1">
          <TestComponent />
        </LanguageProvider>
      );

      // Deve MANTER 'pt-BR' porque houve override manual nesta sessão
      expect(screen.getByTestId('lang').textContent).toBe('pt-BR');
    });

    it('usa chaves de storage diferentes para Admin e Kiosk', () => {
      // Setup Admin
      const { unmount: unmountAdmin } = render(
        <LanguageProvider initialLanguage="pt-BR" isKiosk={false}>
          <TestComponent />
        </LanguageProvider>
      );
      fireEvent.click(screen.getByText('PT-BR'));
      unmountAdmin();

      // Setup Kiosk
      render(
        <LanguageProvider initialLanguage="en" isKiosk={true} storeId="store-1">
          <TestComponent />
        </LanguageProvider>
      );

      // Admin salvou 'pt-BR' em 'admin_language', mas Kiosk deve carregar 'en' (Firestore)
      // porque 'kiosk_language_store-1' está vazio/não tem override
      expect(screen.getByTestId('lang').textContent).toBe('en');
      expect(localStorage.getItem('admin_language')).toBe('pt-BR');
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
