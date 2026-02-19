/**
 * ShopProductCard — Card de produto para a Shop page com suporte a Dynamic Pricing
 *
 * Componente extraído para poder usar o hook useDynamicPrice por produto,
 * já que hooks não podem ser chamados dentro de loops.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDynamicPrice } from "@/hooks/useDynamicPrice";
import { useTranslation } from "@/i18n";
import type { Product } from "@/types/product";

interface ShopProductCardProps {
  product: Product;
  currencySymbol: string;
  isEsp32Healthy: boolean;
  onAddToCart: (product: Product) => void;
}

export default function ShopProductCard({
  product,
  currencySymbol,
  isEsp32Healthy,
  onAddToCart,
}: ShopProductCardProps) {
  const { t } = useTranslation();

  // Resolver size padrão para drinks
  const defaultSize = product.isDrink && product.defaultSizeKey
    ? product.sizes?.find(s => s.key === product.defaultSizeKey)
    : undefined;

  const basePrice = defaultSize?.price ?? product.price;
  const sizeMl = defaultSize?.ml;

  // Dynamic Pricing: calcula preço efetivo (hook reativo a config + tempo)
  const dp = useDynamicPrice(
    product.isDrink ? basePrice : undefined,
    product.isDrink ? sizeMl : undefined,
  );

  const displayPrice = product.isDrink ? (dp.effectivePrice ?? basePrice) : product.price;

  return (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className="space-y-3">
          {product.image && (
            <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
              <img
                src={product.image}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div>
            <h3 className="font-semibold text-sm line-clamp-2">{product.title}</h3>
            <p className="text-gray-600 text-xs line-clamp-2 mt-1">{product.description}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`font-medium text-sm ${dp.isModified ? 'text-orange-600' : 'text-green-600'}`}>
                {dp.isModified && (
                  <span className="line-through text-gray-400 text-xs mr-1">
                    {currencySymbol}{basePrice.toFixed(2)}
                  </span>
                )}
                {currencySymbol}{displayPrice.toFixed(2)}
                {dp.isModified && dp.deltaPercent < 0 && (
                  <span className="ml-1 text-xs text-green-600 font-bold">
                    {dp.deltaPercent.toFixed(0)}%
                  </span>
                )}
              </span>
              <Badge
                variant={(product.isDrink ? (product.totalMlAvailable || 0) > 0 : (product.stock || 0) > 0) ? "default" : "destructive"}
                className="text-xs"
              >
                {product.isDrink
                  ? `${product.totalMlAvailable || 0}ml`
                  : (product.stock || 0) > 0
                    ? t('shop.stockCount', { count: product.stock })
                    : t('shop.outOfStock')}
              </Badge>
            </div>
          </div>

          <Button
            onClick={() => onAddToCart(product)}
            disabled={product.isDrink
              ? (product.totalMlAvailable || 0) <= 0 || !isEsp32Healthy
              : (product.stock || 0) <= 0}
            className="w-full text-sm py-2"
            size="sm"
          >
            {product.isDrink
              ? ((product.totalMlAvailable || 0) <= 0
                ? t('shop.outOfStock')
                : (!isEsp32Healthy
                  ? 'Sistema temporariamente indisponível'
                  : t('shop.selectSize')))
              : ((product.stock || 0) <= 0 ? t('shop.outOfStock') : t('shop.addToCart'))}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
