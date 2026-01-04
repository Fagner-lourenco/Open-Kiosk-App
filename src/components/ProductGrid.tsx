
import { useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Package } from "lucide-react";
import { Product } from "@/types/product";
import { useTranslation } from "@/i18n";
import { useCurrentCurrency } from "@/hooks/useSettings";

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

// Extrair lógica de preço para função pura (evitar recriação)
const getDisplayPrice = (product: Product): number => {
  if (product.isDrink && product.defaultSizeKey) {
    return product.sizes?.find(s => s.key === product.defaultSizeKey)?.price ?? product.price;
  }
  return product.price;
};

// Componente memoizado para cada produto (evita re-render de todos quando um muda)
const ProductCard = memo(({ product, onAddToCart, currencySymbol, t }: {
  product: Product;
  onAddToCart: (product: Product) => void;
  currencySymbol: string;
  t: (key: string) => string;
}) => {
  const displayPrice = useMemo(() => getDisplayPrice(product), [product]);
  const drinkMl = product.totalMlAvailable;
  const hasStock = product.isDrink ? (drinkMl ?? 0) > 0 : product.inStock;
  
  return (
    <Card className="group hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-0">
        {product.image ? (
          <div className="aspect-[4/3] overflow-hidden rounded-t-lg bg-gray-100">
            <img
              src={product.image}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-[4/3] bg-gray-200 rounded-t-lg flex items-center justify-center">
            <Package className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400" />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-2 sm:p-4">
        <div className="space-y-2 sm:space-y-3">
          <div>
            <h3 className="font-semibold text-sm sm:text-lg line-clamp-1">{product.title}</h3>
            <p className="text-gray-600 text-xs sm:text-sm line-clamp-2 hidden sm:block">{product.description}</p>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-xl font-bold text-green-600">
              {currencySymbol}{displayPrice.toFixed(2)}
            </span>
            {product.isDrink ? (
              <Badge variant={hasStock ? "default" : "destructive"} className="text-xs">
                {drinkMl != null ? `${drinkMl}ml` : t('shop.noStockData')}
              </Badge>
            ) : (
              <Badge variant={product.inStock ? "default" : "destructive"} className="text-xs">
                {product.inStock ? t('shop.inStock') : t('shop.outOfStock')}
              </Badge>
            )}
          </div>
          
          <div className="flex flex-wrap gap-1 hidden sm:flex">
            {product.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {product.tags.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{product.tags.length - 2}
              </Badge>
            )}
          </div>
          
          <Button 
            className="w-full text-xs sm:text-sm min-h-[44px] touch-manipulation" 
            onClick={() => onAddToCart(product)}
            disabled={!hasStock}
            size="sm"
          >
            <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            {product.isDrink ? t('shop.selectSize') : t('shop.addToCart')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

ProductCard.displayName = 'ProductCard';

const ProductGrid = ({ products, onAddToCart }: ProductGridProps) => {
  const { t } = useTranslation();
  const currentCurrency = useCurrentCurrency();

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('shop.noProducts')}</h3>
          <p className="text-gray-500">{t('shop.adjustSearch')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={onAddToCart}
          currencySymbol={currentCurrency.symbol}
          t={t}
        />
      ))}
    </div>
  );
};

export default ProductGrid;
