import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowLeft, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useESP32 } from "@/context/ESP32Context";
import { useToast } from "@/hooks/use-toast";
import ProductGrid from "@/components/ProductGrid";
import Cart from "@/components/Cart";
import VoiceSearchButton from "@/components/VoiceSearchButton";
import OnScreenKeyboard from "@/components/OnScreenKeyboard";
import { CartItem, Product } from "@/types/product";
import { useFirebaseProducts } from "@/hooks/useFirebaseProducts";
import { useSettings } from "@/hooks/useSettings";
import { getCartItemKey, getMaxQuantity } from "@/utils/productUtils";
import DrinkQuickCheckoutModal from "@/components/DrinkQuickCheckoutModal";
import DrinkPickupScreen from "@/components/DrinkPickupScreen";
import AttractScreen from "@/components/AttractScreen";
import { useKioskIdle } from "@/hooks/useKioskIdle";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useTranslation } from "@/i18n";
import { useDebounce } from "@/hooks/useDebounce";
import { enterKioskMode } from "@/services/kioskModeService";

type DrinkCheckoutResult = {
  orderNumber: string;
  drinkData: {
    product: Product;
    sizeKey: string;
    sizeLabel: string;
    mlPerUnit: number;
    price: number;
    quantity: number;
    totalAmount: number;
  };
};

const INITIAL_LOAD_LIMIT = 50;

const Shop = () => {
  const navigate = useNavigate();
  const { products, loading, updateProduct } = useFirebaseProducts();
  const { settings } = useStoreSettings();
  const { t } = useTranslation();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LOAD_LIMIT);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const { currentCurrency } = useSettings();
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);
  const [isDrinkCheckoutOpen, setIsDrinkCheckoutOpen] = useState(false);
  const [drinkPickupData, setDrinkPickupData] = useState<DrinkCheckoutResult | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // 🔒 PRODUÇÃO: Verificar conexão ESP32 antes de checkout de bebida
  const { status: esp32Status, ping } = useESP32();
  const { toast } = useToast();

  // Kiosk idle overlay (suppressed when any modal/overlay is active)
  const isSuppressed = isCartOpen || isDrinkCheckoutOpen || !!drinkPickupData || isKeyboardVisible || isCheckoutOpen;
  const attractTimeout = settings?.attractTimeoutSeconds ?? 15;
  const { isIdle, resetIdle } = useKioskIdle({ timeoutSeconds: attractTimeout, suppressed: isSuppressed });

  // Debounce searchQuery para evitar re-renders excessivos durante digitação/voz
  const debouncedSearchQuery = useDebounce(searchQuery, 200);

  /**
   * Ativar kiosk mode ao entrar na tela de Shop
   * Bloqueia o dispositivo no app, impedindo saída do usuário
   * Executa apenas uma vez na montagem do componente
   */
  useEffect(() => {
    const activateKiosk = async () => {
      try {
        console.log('[Shop] Ativando kiosk mode...');
        const success = await enterKioskMode();
        if (success) {
          console.log('[Shop] ✅ Kiosk mode ativado com sucesso');
        } else {
          console.warn('[Shop] ⚠️ Falha ao ativar kiosk mode (pode estar em dev/web)');
        }
      } catch (error) {
        console.error('[Shop] Erro ao ativar kiosk mode:', error);
      }
    };

    activateKiosk();
  }, []); // Executar apenas uma vez na montagem

  useEffect(() => {
    if (products) {
      // Sort products by most sold (assuming we track sales in a field like 'salesCount')
      // For now, we'll sort by stock level as a proxy (lower stock = more sold)
      const sortedByMostSold = [...products].sort((a, b) => {
        // Products with lower stock are considered "more sold"
        const stockA = a.stock || 0;
        const stockB = b.stock || 0;

        // If both have stock, sort by lowest stock first (most sold)
        if (stockA > 0 && stockB > 0) {
          return stockA - stockB;
        }

        // In-stock items come before out-of-stock
        if (stockA > 0 && stockB === 0) return -1;
        if (stockA === 0 && stockB > 0) return 1;

        return 0;
      });

      const filtered = sortedByMostSold.filter(product =>
        product.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        product.tags?.some(tag => tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
      );
      setFilteredProducts(filtered);
    }
  }, [products, debouncedSearchQuery]);

  useEffect(() => {
    setDisplayedProducts(filteredProducts.slice(0, displayLimit));
  }, [filteredProducts, displayLimit]);

  const loadMore = () => {
    setDisplayLimit(prev => prev + 50);
  };

  const hasMoreProducts = displayLimit < filteredProducts.length;

  const addToCart = async (product: Product) => {
    // Bebida: verificar conexão ESP32 antes de abrir checkout
    if (product.isDrink) {
      // 🔒 PRODUÇÃO: Verificar se dispenser está online
      if (!esp32Status.connected) {
        // Tentar ping rápido para confirmar
        const isOnline = await ping();
        if (!isOnline) {
          toast({
            title: '⚠️ Máquina Offline',
            description: 'O dispenser de bebidas não está disponível no momento. Por favor, tente novamente em alguns instantes.',
            variant: 'destructive',
          });
          return;
        }
      }

      setSelectedDrink(product);
      setIsDrinkCheckoutOpen(true);
      return;
    }

    // Produto normal
    if ((product.stock || 0) <= 0) return;

    setCartItems(prevItems => {
      const existingItem = prevItems.find(
        item => item.product.id === product.id && !item.sizeKey
      );

      if (existingItem) {
        const newQuantity = existingItem.quantity + 1;
        const maxQty = getMaxQuantity(product, undefined, prevItems);

        if (newQuantity <= maxQty) {
          return prevItems.map(item =>
            item.product.id === product.id && !item.sizeKey
              ? { ...item, quantity: newQuantity }
              : item
          );
        }
        return prevItems;
      } else {
        return [...prevItems, {
          product,
          quantity: 1,
          unitPrice: product.price
        }];
      }
    });
  };

  const handleDrinkCheckoutComplete = (data: DrinkCheckoutResult) => {
    setIsDrinkCheckoutOpen(false);
    setSelectedDrink(null);
    setDrinkPickupData(data);
  };

  const handleDrinkCheckoutCancel = () => {
    setIsDrinkCheckoutOpen(false);
    setSelectedDrink(null);
  };

  const handleClosePickup = () => {
    setDrinkPickupData(null);
  };

  const updateCartQuantity = (cartItemKey: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems(prevItems =>
        prevItems.filter(item => getCartItemKey(item.product.id, item.sizeKey) !== cartItemKey)
      );
    } else {
      setCartItems(prevItems =>
        prevItems.map(item => {
          const key = getCartItemKey(item.product.id, item.sizeKey);
          if (key !== cartItemKey) return item;
          const maxQty = getMaxQuantity(item.product, item.sizeKey, prevItems);
          return { ...item, quantity: Math.min(quantity, maxQty) };
        })
      );
    }
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const handleVoiceTranscript = (transcript: string) => {
    setSearchQuery(transcript);
  };

  const handleKeyPress = (key: string) => {
    if (key === 'BACKSPACE') {
      setSearchQuery(prev => prev.slice(0, -1));
    } else if (key === 'CLEAR') {
      setSearchQuery('');
    } else if (key === ' ') {
      setSearchQuery(prev => prev + ' ');
    } else if (key.length === 1) {
      setSearchQuery(prev => prev + key);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">{t('shop.loadingProducts')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Bar */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={t('shop.searchProducts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsKeyboardVisible(true)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <VoiceSearchButton onTranscript={handleVoiceTranscript} />
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCartOpen(true)}
                className="relative"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {t('shop.cart')}
                {getTotalItems() > 0 && (
                  <Badge variant="destructive" className="ml-2 px-1 min-w-[1.2rem] h-5">
                    {getTotalItems()}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Products with improved image sizing */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {displayedProducts.map((product) => (
            <Card key={product.id} className="h-full">
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
                      <span className="font-medium text-green-600 text-sm">
                        {(() => {
                          const displayPrice = product.isDrink && product.defaultSizeKey
                            ? product.sizes?.find(s => s.key === product.defaultSizeKey)?.price ?? product.price
                            : product.price;
                          return `${currentCurrency.symbol}${displayPrice.toFixed(2)}`;
                        })()}
                      </span>
                      <Badge variant={(product.isDrink ? (product.totalMlAvailable || 0) > 0 : (product.stock || 0) > 0) ? "default" : "destructive"} className="text-xs">
                        {product.isDrink
                          ? `${product.totalMlAvailable || 0}ml`
                          : (product.stock || 0) > 0 ? t('shop.stockCount', { count: product.stock }) : t('shop.outOfStock')}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    onClick={() => addToCart(product)}
                    disabled={product.isDrink ? (product.totalMlAvailable || 0) <= 0 : (product.stock || 0) <= 0}
                    className="w-full text-sm py-2"
                    size="sm"
                  >
                    {product.isDrink
                      ? ((product.totalMlAvailable || 0) <= 0 ? t('shop.outOfStock') : t('shop.selectSize'))
                      : ((product.stock || 0) <= 0 ? t('shop.outOfStock') : t('shop.addToCart'))}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Show More Button */}
        {hasMoreProducts && (
          <div className="flex justify-center mt-8">
            <Button onClick={loadMore} variant="outline" size="lg">
              {t('shop.showMore')} ({filteredProducts.length - displayLimit} {t('shop.remaining')})
            </Button>
          </div>
        )}

        {/* Results Info */}
        <div className="text-center mt-4 text-gray-500 text-sm">
          {t('shop.showingProducts', { displayed: displayedProducts.length, total: filteredProducts.length })}
        </div>
      </div>

      {/* Cart */}
      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={updateCartQuantity}
        onClearCart={clearCart}
        onCheckoutStateChange={setIsCheckoutOpen}
      />
      <DrinkQuickCheckoutModal
        isOpen={isDrinkCheckoutOpen}
        product={selectedDrink}
        currentCartItems={cartItems}
        onComplete={handleDrinkCheckoutComplete}
        onCancel={handleDrinkCheckoutCancel}
      />
      <DrinkPickupScreen
        isOpen={!!drinkPickupData}
        orderNumber={drinkPickupData?.orderNumber || ""}
        drinkData={drinkPickupData?.drinkData || null}
        timeoutSeconds={80}
        onComplete={handleClosePickup}
        onTimeout={handleClosePickup}
      />

      {/* On-Screen Keyboard */}
      <OnScreenKeyboard
        isVisible={isKeyboardVisible}
        onKeyPress={handleKeyPress}
        onClose={() => setIsKeyboardVisible(false)}
      />

      {/* Attract Screen Overlay */}
      <AttractScreen
        visible={isIdle && (settings?.attractScreenEnabled ?? true)}
        onStart={resetIdle}
        title={t('shop.orderHere')}
        subtitle={t('shop.touchToStart')}
        attractVideoConfig={settings?.attractVideoConfig}
      />
    </div>
  );
};

export default Shop;
