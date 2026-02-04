import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/input';
import React from 'react';

describe('Input Component', () => {
  it('renderiza input de texto', () => {
    render(<Input placeholder="Digite algo" />);
    expect(screen.getByPlaceholderText('Digite algo')).toBeTruthy();
  });

  it('aplica type text por padrão', () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.getAttribute('type')).toBeNull(); // não definido = text implícito
  });

  it('aplica type password', () => {
    render(<Input type="password" data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.getAttribute('type')).toBe('password');
  });

  it('aplica type email', () => {
    render(<Input type="email" data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.getAttribute('type')).toBe('email');
  });

  it('aceita className customizada', () => {
    render(<Input className="custom-input" data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.className).toContain('custom-input');
  });

  it('captura onChange', () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} data-testid="input" />);
    
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'test' } });
    
    expect(onChange).toHaveBeenCalled();
  });

  it('renderiza como disabled', () => {
    render(<Input disabled data-testid="input" />);
    const input = screen.getByTestId('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('aceita value controlado', () => {
    render(<Input value="controlled" readOnly data-testid="input" />);
    const input = screen.getByTestId('input') as HTMLInputElement;
    expect(input.value).toBe('controlled');
  });
});
