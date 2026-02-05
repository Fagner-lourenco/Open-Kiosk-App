
export interface ProductSize {
  key: string;
  label: string;
  price: number;
  ml: number;
}

export interface Product {
  id: string;
  title: string;
  price: number;
  description: string;
  image?: string;
  tags: string[];
  inStock: boolean;
  category: string;
  stock: number;
  minStock?: number;

  isDrink?: boolean;
  sizes?: ProductSize[];
  defaultSizeKey?: string;
  totalMlAvailable?: number;
  
  // Multi-store support
  storeId?: string;
  
  // Metadados
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;

  sizeKey?: string;
  sizeLabel?: string;
  mlPerUnit?: number;
}
