import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import React from 'react';

describe('Alert Components', () => {
  describe('Alert', () => {
    it('renderiza com children', () => {
      render(<Alert>Alert content</Alert>);
      expect(screen.getByText('Alert content')).toBeTruthy();
    });

    it('tem role alert', () => {
      render(<Alert>Content</Alert>);
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('aplica classes base', () => {
      render(<Alert data-testid="alert">Content</Alert>);
      const alert = screen.getByTestId('alert');
      expect(alert.className).toContain('rounded-lg');
      expect(alert.className).toContain('border');
      expect(alert.className).toContain('p-4');
    });

    it('aplica variant default por padrão', () => {
      render(<Alert data-testid="alert">Content</Alert>);
      const alert = screen.getByTestId('alert');
      expect(alert.className).toContain('bg-background');
    });

    it('aplica variant destructive', () => {
      render(<Alert variant="destructive" data-testid="alert">Error</Alert>);
      const alert = screen.getByTestId('alert');
      expect(alert.className).toContain('text-destructive');
    });

    it('aceita className customizada', () => {
      render(<Alert className="custom-alert" data-testid="alert">Custom</Alert>);
      const alert = screen.getByTestId('alert');
      expect(alert.className).toContain('custom-alert');
    });
  });

  describe('AlertTitle', () => {
    it('renderiza como h5', () => {
      render(<AlertTitle>Title</AlertTitle>);
      const title = screen.getByText('Title');
      expect(title.tagName).toBe('H5');
    });

    it('aplica classes de título', () => {
      render(<AlertTitle data-testid="title">Title</AlertTitle>);
      const title = screen.getByTestId('title');
      expect(title.className).toContain('font-medium');
    });
  });

  describe('AlertDescription', () => {
    it('renderiza com texto', () => {
      render(<AlertDescription>Description text</AlertDescription>);
      expect(screen.getByText('Description text')).toBeTruthy();
    });

    it('aplica classes de descrição', () => {
      render(<AlertDescription data-testid="desc">Desc</AlertDescription>);
      const desc = screen.getByTestId('desc');
      expect(desc.className).toContain('text-sm');
    });
  });

  describe('Alert completo', () => {
    it('renderiza todos os componentes juntos', () => {
      render(
        <Alert>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>This is a warning message</AlertDescription>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Warning')).toBeTruthy();
      expect(screen.getByText('This is a warning message')).toBeTruthy();
    });
  });
});
