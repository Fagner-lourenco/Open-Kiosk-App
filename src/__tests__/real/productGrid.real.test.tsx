import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from '@/i18n';
import ProductGrid from '@/components/ProductGrid';

const products = [
  { id: '1', title: 'Coca Cola', price: 5, description: '', image: '', tags: [], inStock: true, category: 'bebidas', stock: 10 },
  { id: '2', title: 'Água', price: 3, description: '', image: '', tags: [], inStock: true, category: 'bebidas', stock: 5 },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <LanguageProvider>{children}</LanguageProvider>
  </BrowserRouter>
);

describe('ProductGrid - testes simplificados', () => {
  it('renderiza produtos', () => {
    render(<ProductGrid products={products} onAddToCart={() => {}} />, { wrapper });
    expect(screen.getByText('Coca Cola')).toBeTruthy();
    expect(screen.getByText('Água')).toBeTruthy();
  });

  it('aciona onAddToCart', () => {
    const onAddToCart = vi.fn();
    render(<ProductGrid products={products} onAddToCart={onAddToCart} />, { wrapper });
    const buttons = screen.getAllByRole('button', { name: /add to cart/i });
    fireEvent.click(buttons[0]);
    expect(onAddToCart).toHaveBeenCalledWith(products[0]);
  });
});
