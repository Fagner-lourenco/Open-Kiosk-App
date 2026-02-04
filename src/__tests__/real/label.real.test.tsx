import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';
import React from 'react';

describe('Label Component', () => {
  it('renderiza com texto', () => {
    render(<Label>Test Label</Label>);
    expect(screen.getByText('Test Label')).toBeTruthy();
  });

  it('aplica classes base', () => {
    render(<Label data-testid="label">Label</Label>);
    const label = screen.getByTestId('label');
    expect(label.className).toContain('text-sm');
    expect(label.className).toContain('font-medium');
  });

  it('aceita className customizada', () => {
    render(<Label className="custom-label" data-testid="label">Custom</Label>);
    const label = screen.getByTestId('label');
    expect(label.className).toContain('custom-label');
  });

  it('aceita htmlFor', () => {
    render(<Label htmlFor="input-id">For Input</Label>);
    const label = screen.getByText('For Input');
    expect(label.getAttribute('for')).toBe('input-id');
  });
});
