import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from '@/i18n';
import Cart from '@/components/Cart';

vi.mock('@/components/Checkout', () => ({
  __esModule: true,
  default: () => null,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <LanguageProvider>{children}</LanguageProvider>
  </BrowserRouter>
);

const product = {
  id: 'p1',
  title: 'Coca Cola',
  price: 5,
  description: 'bebida',
  image: '',
  tags: [],
  inStock: true,
  category: 'bebidas',
  stock: 10,
};

describe('Cart - testes simplificados', () => {
  it('mostra estado vazio', () => {
    render(
      <Cart
        isOpen
        onClose={() => {}}
        cartItems={[]}
        onUpdateQuantity={() => {}}
        onClearCart={() => {}}
      />,
      { wrapper }
    );

    expect(screen.getByText(/your cart is empty/i)).toBeTruthy();
  });

  it('mostra item e total', () => {
    render(
      <Cart
        isOpen
        onClose={() => {}}
        cartItems={[{ product, quantity: 2, unitPrice: 5 }]}
        onUpdateQuantity={() => {}}
        onClearCart={() => {}}
      />,
      { wrapper }
    );

    expect(screen.getByText('Coca Cola')).toBeTruthy();
    const totals = screen.getAllByText(/10\.00/);
    expect(totals.length).toBeGreaterThan(0);
  });
});
