import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CartItem, Product } from '@/types/product';
import { useTranslation } from '@/i18n';
import { useCurrentCurrency } from '@/hooks/useSettings';

interface SizeSelectorModalProps {
  isOpen: boolean;
  product: Product | null;
  currentCartItems: CartItem[];
  onSelect: (selection: {
    sizeKey: string;
    sizeLabel: string;
    mlPerUnit: number;
    price: number;
    quantity: number;
  }) => void;
  onClose: () => void;
}

export default function SizeSelectorModal({
  isOpen,
  product,
  currentCartItems,
  onSelect,
  onClose,
}: SizeSelectorModalProps) {
  const { t } = useTranslation();
  const currentCurrency = useCurrentCurrency();
  const [selectedSizeKey, setSelectedSizeKey] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [maxQty, setMaxQty] = useState(0);

  useEffect(() => {
    if (product?.sizes && product.sizes.length > 0) {
      setSelectedSizeKey(product.defaultSizeKey || product.sizes[0].key);
    }
  }, [product]);

  useEffect(() => {
    if (!product || !selectedSizeKey) return;
    const size = product.sizes?.find((s) => s.key === selectedSizeKey);
    if (!size) return;
    const mlInCart = currentCartItems
      .filter((i) => i.product.id === product.id)
      .reduce((sum, i) => sum + ((i.mlPerUnit || 0) * i.quantity), 0);
    const mlAvailable = (product.totalMlAvailable || 0) - mlInCart;
    const max = Math.floor(mlAvailable / size.ml);
    setMaxQty(max);
    setQuantity((prev) => Math.min(prev, max));
  }, [selectedSizeKey, product, currentCartItems]);

  if (!product) return null;
  const selectedSize = product.sizes?.find((s) => s.key === selectedSizeKey);

  const handleConfirm = () => {
    if (!selectedSize || quantity <= 0) return;
    onSelect({
      sizeKey: selectedSize.key,
      sizeLabel: selectedSize.label,
      mlPerUnit: selectedSize.ml,
      price: selectedSize.price,
      quantity,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('sizeSelector.selectSizeFor', { product: product.title })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t('sizeSelector.size')}</label>
            <Select value={selectedSizeKey} onValueChange={setSelectedSizeKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {product.sizes?.map((size) => (
                  <SelectItem key={size.key} value={size.key}>
                    {size.label} - {currentCurrency.symbol} {size.price.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">{t('sizeSelector.quantity')}</label>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label={t('sizeSelector.decreaseQuantity') || 'Diminuir quantidade'}
              >
                -
              </Button>
              <span className="text-lg font-medium w-12 text-center" aria-live="polite">{quantity}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                aria-label={t('sizeSelector.increaseQuantity') || 'Aumentar quantidade'}
              >
                +
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('sizeSelector.maxAvailable', { max: maxQty })}</p>
          </div>

          {selectedSize && (
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm">{t('sizeSelector.total')}: {currentCurrency.symbol} {(selectedSize.price * quantity).toFixed(2)}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirm} className="flex-1" disabled={maxQty === 0}>
              {t('sizeSelector.addToCart')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
