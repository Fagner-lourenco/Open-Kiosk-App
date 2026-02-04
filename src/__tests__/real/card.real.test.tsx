import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import React from 'react';

describe('Card Components', () => {
  describe('Card', () => {
    it('renderiza com children', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeTruthy();
    });

    it('aplica classes base', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card.className).toContain('rounded-lg');
      expect(card.className).toContain('border');
    });

    it('aceita className customizada', () => {
      render(<Card className="custom-card" data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card.className).toContain('custom-card');
    });
  });

  describe('CardHeader', () => {
    it('renderiza com children', () => {
      render(<CardHeader>Header content</CardHeader>);
      expect(screen.getByText('Header content')).toBeTruthy();
    });

    it('aplica classes de padding', () => {
      render(<CardHeader data-testid="header">Content</CardHeader>);
      const header = screen.getByTestId('header');
      expect(header.className).toContain('p-6');
    });
  });

  describe('CardTitle', () => {
    it('renderiza como h3', () => {
      render(<CardTitle>Title</CardTitle>);
      const title = screen.getByText('Title');
      expect(title.tagName).toBe('H3');
    });

    it('aplica classes de título', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title.className).toContain('text-2xl');
      expect(title.className).toContain('font-semibold');
    });
  });

  describe('CardDescription', () => {
    it('renderiza com texto', () => {
      render(<CardDescription>Description text</CardDescription>);
      expect(screen.getByText('Description text')).toBeTruthy();
    });

    it('aplica classes de descrição', () => {
      render(<CardDescription data-testid="desc">Desc</CardDescription>);
      const desc = screen.getByTestId('desc');
      expect(desc.className).toContain('text-sm');
    });
  });

  describe('CardContent', () => {
    it('renderiza com children', () => {
      render(<CardContent>Content here</CardContent>);
      expect(screen.getByText('Content here')).toBeTruthy();
    });
  });

  describe('CardFooter', () => {
    it('renderiza com children', () => {
      render(<CardFooter>Footer content</CardFooter>);
      expect(screen.getByText('Footer content')).toBeTruthy();
    });
  });

  describe('Card completo', () => {
    it('renderiza todos os componentes juntos', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>My Card</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent>Main content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      );

      expect(screen.getByText('My Card')).toBeTruthy();
      expect(screen.getByText('Card description')).toBeTruthy();
      expect(screen.getByText('Main content')).toBeTruthy();
      expect(screen.getByText('Footer')).toBeTruthy();
    });
  });
});
