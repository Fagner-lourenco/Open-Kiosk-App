import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from '@/components/ui/button';
import React from 'react';

describe('Button Component', () => {
  it('renderiza com texto', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeTruthy();
  });

  it('aplica variant default por padrão', () => {
    render(<Button>Default</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-primary');
  });

  it('aplica variant destructive', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-destructive');
  });

  it('aplica variant outline', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('border');
  });

  it('aplica variant ghost', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('hover:bg-accent');
  });

  it('aplica size sm', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('h-9');
  });

  it('aplica size lg', () => {
    render(<Button size="lg">Large</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('h-11');
  });

  it('aplica size icon', () => {
    render(<Button size="icon">I</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-10');
  });

  it('aceita className customizada', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
  });

  it('chama onClick quando clicado', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('não chama onClick quando disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Disabled</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('buttonVariants', () => {
  it('retorna classes base', () => {
    const classes = buttonVariants();
    expect(classes).toContain('inline-flex');
    expect(classes).toContain('rounded-md');
  });

  it('retorna classes para variant específica', () => {
    const classes = buttonVariants({ variant: 'secondary' });
    expect(classes).toContain('bg-secondary');
  });

  it('retorna classes para size específico', () => {
    const classes = buttonVariants({ size: 'lg' });
    expect(classes).toContain('h-11');
  });
});
