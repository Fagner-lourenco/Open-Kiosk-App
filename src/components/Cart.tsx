import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { CartItem } from "@/types/product";
import { getCartItemKey } from "@/utils/productUtils";
import { useTranslation } from "@/i18n";
import { useCurrentCurrency } from "@/hooks/useSettings";
import { useState } from "react";
import Checkout from "./Checkout";

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (cartItemKey: string, quantity: number) => void;
  onClearCart: () => void;
  onCheckoutStateChange?: (isCheckoutOpen: boolean) => void;
}

const Cart = ({ isOpen, onClose, cartItems, onUpdateQuantity, onClearCart, onCheckoutStateChange }: CartProps) => {
  const { t } = useTranslation();
  const currentCurrency = useCurrentCurrency();
  const [showCheckout, setShowCheckout] = useState(false);

  // Notify parent when checkout state changes
  const updateCheckoutState = (open: boolean) => {
    setShowCheckout(open);
    onCheckoutStateChange?.(open);
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  };

  // On Proceed to Checkout: Close Cart sheet first, then show Checkout
  const handleCheckout = () => {
    onClose();
    // Open checkout on the next frame to avoid relying on animation timing
    requestAnimationFrame(() => updateCheckoutState(true));
  };

  const handleCheckoutComplete = () => {
    updateCheckoutState(false);
    // Don't call onClose here, since the cart sheet is already closed
    // onClearCart is called by Checkout component after successful payment
  };

  if (cartItems.length === 0) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              {t('nav.cart')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center justify-center h-64">
            <ShoppingCart className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-center">{t('cart.emptyCart')}</p>
            <p className="text-sm text-gray-400 text-center mt-2">{t('cart.emptyCartHint')}</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <ShoppingCart className="w-5 h-5 mr-2" />
                {t('cart.shoppingCart')}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{cartItems.length} {t('cart.items')}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearCart}
                  className="text-red-600 hover:text-red-700"
                >
                  {t('cart.clearCart')}
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>
          
          {/* Make this section scrollable if too many items */}
          <div className="flex-1 overflow-y-auto py-4 min-h-0">
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div key={getCartItemKey(item.product.id, item.sizeKey)} className="flex items-start gap-4 p-4 border rounded-lg">
                  {item.product.image ? (
                    <img
                      src={item.product.image}
                      alt={item.product.title}
                      className="w-16 h-16 object-cover rounded-md"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center">
                      <ShoppingCart className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-2">
                      {item.product.title}
                      {item.sizeLabel && (
                        <span className="text-gray-500"> ({item.sizeLabel})</span>
                      )}
                    </h4>
                    <p className="text-sm text-gray-500">{currentCurrency.symbol}{item.unitPrice.toFixed(2)}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUpdateQuantity(getCartItemKey(item.product.id, item.sizeKey), item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-medium min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUpdateQuantity(getCartItemKey(item.product.id, item.sizeKey), item.quantity + 1)}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {currentCurrency.symbol}{(item.unitPrice * item.quantity).toFixed(2)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUpdateQuantity(getCartItemKey(item.product.id, item.sizeKey), 0)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>{t('cart.total')}:</span>
              <span>{currentCurrency.symbol}{getTotalPrice().toFixed(2)}</span>
            </div>
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleCheckout}
            >
              {t('cart.proceedToCheckout')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Only show the Checkout when showCheckout is true */}
      <Checkout
        isOpen={showCheckout}
        onClose={() => updateCheckoutState(false)}
        cartItems={cartItems}
        onComplete={handleCheckoutComplete}
        onUpdateQuantity={onUpdateQuantity}
        onClearCart={onClearCart}
      />
    </>
  );
};

export default Cart;
