import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LanguageProvider } from '@/i18n/LanguageContext';
import React from 'react';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('AuthLayout', () => {
  it('renderiza children', () => {
    render(
      <AuthLayout>
        <div>Child content</div>
      </AuthLayout>,
      { wrapper }
    );
    expect(screen.getByText('Child content')).toBeTruthy();
  });

  it('mostra título padrão quando não fornecido', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>,
      { wrapper }
    );
    expect(screen.getByText('Open Kiosk')).toBeTruthy();
  });

  it('mostra título customizado', () => {
    render(
      <AuthLayout title="Custom Title">
        <div>Content</div>
      </AuthLayout>,
      { wrapper }
    );
    expect(screen.getByText('Custom Title')).toBeTruthy();
  });

  it('mostra subtitle quando fornecido', () => {
    render(
      <AuthLayout title="Title" subtitle="Custom Subtitle">
        <div>Content</div>
      </AuthLayout>,
      { wrapper }
    );
    expect(screen.getByText('Custom Subtitle')).toBeTruthy();
  });

  it('mostra copyright com ano atual', () => {
    const currentYear = new Date().getFullYear().toString();
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>,
      { wrapper }
    );
    expect(screen.getByText(new RegExp(currentYear))).toBeTruthy();
  });

  it('tem emoji de cerveja no logo', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>,
      { wrapper }
    );
    expect(screen.getByText('🍺')).toBeTruthy();
  });
});
