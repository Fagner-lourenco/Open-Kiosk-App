import { CartItem, Product } from '@/types/product';

export const getCartItemKey = (productId: string, sizeKey?: string): string => {
  return sizeKey ? `${productId}#${sizeKey}` : productId;
};

export const getMaxQuantity = (
  product: Product,
  sizeKey?: string,
  cartItems?: CartItem[]
): number => {
  if (product.isDrink && product.sizes && product.totalMlAvailable) {
    const mlInCart = cartItems
      ?.filter((item) => item.product.id === product.id)
      .reduce((sum, item) => sum + ((item.mlPerUnit || 0) * item.quantity), 0) || 0;

    const mlAvailable = product.totalMlAvailable - mlInCart;

    const size = sizeKey
      ? product.sizes.find((s) => s.key === sizeKey)
      : product.sizes.find((s) => s.key === product.defaultSizeKey);

    if (!size || !size.ml || size.ml <= 0) return 0;
    return Math.max(0, Math.floor(mlAvailable / size.ml));
  }

  const qtyInCart = cartItems
    ?.filter((item) => item.product.id === product.id && !item.sizeKey)
    .reduce((sum, item) => sum + item.quantity, 0) || 0;

  return Math.max(0, (product.stock || 0) - qtyInCart);
};

export const getStockDisplay = (product: Product): string => {
  if (product.isDrink) {
    return `${product.totalMlAvailable || 0}ml disponivel`;
  }
  return `${product.stock || 0} em estoque`;
};

export const isLowStock = (product: Product): boolean => {
  if (product.isDrink) {
    return (product.totalMlAvailable || 0) < 500;
  }
  return (product.stock || 0) > 0 && (product.stock || 0) <= (product.minStock || 5);
};
