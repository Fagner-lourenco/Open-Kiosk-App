import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from '@/components/ui/badge';
import React from 'react';

describe('Badge Component', () => {
  it('renderiza com texto', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeTruthy();
  });

  it('aplica variant default por padrão', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('bg-primary');
  });

  it('aplica variant secondary', () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText('Secondary');
    expect(badge.className).toContain('bg-secondary');
  });

  it('aplica variant destructive', () => {
    render(<Badge variant="destructive">Destructive</Badge>);
    const badge = screen.getByText('Destructive');
    expect(badge.className).toContain('bg-destructive');
  });

  it('aplica variant outline', () => {
    render(<Badge variant="outline">Outline</Badge>);
    const badge = screen.getByText('Outline');
    expect(badge.className).toContain('text-foreground');
  });

  it('aceita className customizada', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge.className).toContain('custom-class');
  });
});

describe('badgeVariants', () => {
  it('retorna classes base', () => {
    const classes = badgeVariants();
    expect(classes).toContain('inline-flex');
    expect(classes).toContain('rounded-full');
  });

  it('retorna classes para variant específica', () => {
    const classes = badgeVariants({ variant: 'destructive' });
    expect(classes).toContain('bg-destructive');
  });
});
