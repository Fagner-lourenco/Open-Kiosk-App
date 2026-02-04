import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { 
  Sheet, 
  SheetTrigger, 
  SheetHeader, 
  SheetFooter
} from '@/components/ui/sheet';
import React from 'react';

describe('Sheet Components', () => {
  describe('Sheet', () => {
    it('renderiza com trigger', () => {
      render(
        <Sheet>
          <SheetTrigger>Open Sheet</SheetTrigger>
        </Sheet>
      );
      expect(screen.getByText('Open Sheet')).toBeTruthy();
    });
  });

  describe('SheetHeader', () => {
    it('renderiza com children', () => {
      render(<SheetHeader>Header content</SheetHeader>);
      expect(screen.getByText('Header content')).toBeTruthy();
    });

    it('aceita className customizada', () => {
      render(<SheetHeader className="custom-header" data-testid="header">Header</SheetHeader>);
      const header = screen.getByTestId('header');
      expect(header.className).toContain('custom-header');
    });
  });

  describe('SheetFooter', () => {
    it('renderiza com children', () => {
      render(<SheetFooter>Footer content</SheetFooter>);
      expect(screen.getByText('Footer content')).toBeTruthy();
    });

    it('aceita className customizada', () => {
      render(<SheetFooter className="custom-footer" data-testid="footer">Footer</SheetFooter>);
      const footer = screen.getByTestId('footer');
      expect(footer.className).toContain('custom-footer');
    });
  });
});
