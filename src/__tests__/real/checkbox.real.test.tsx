import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from '@/components/ui/checkbox';
import React from 'react';

describe('Checkbox Component', () => {
  it('renderiza checkbox', () => {
    render(<Checkbox data-testid="checkbox" />);
    expect(screen.getByTestId('checkbox')).toBeTruthy();
  });

  it('tem role checkbox', () => {
    render(<Checkbox />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('aplica classes base', () => {
    render(<Checkbox data-testid="checkbox" />);
    const checkbox = screen.getByTestId('checkbox');
    expect(checkbox.className).toContain('h-4');
    expect(checkbox.className).toContain('w-4');
    expect(checkbox.className).toContain('rounded-sm');
  });

  it('aceita className customizada', () => {
    render(<Checkbox className="custom-checkbox" data-testid="checkbox" />);
    const checkbox = screen.getByTestId('checkbox');
    expect(checkbox.className).toContain('custom-checkbox');
  });

  it('pode ser disabled', () => {
    render(<Checkbox disabled data-testid="checkbox" />);
    const checkbox = screen.getByTestId('checkbox');
    expect(checkbox.hasAttribute('disabled')).toBe(true);
  });

  it('alterna estado ao clicar', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange} />);
    
    fireEvent.click(screen.getByRole('checkbox'));
    
    expect(onCheckedChange).toHaveBeenCalled();
  });

  it('pode iniciar checked', () => {
    render(<Checkbox checked />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('data-state')).toBe('checked');
  });
});
