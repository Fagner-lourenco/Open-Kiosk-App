import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Search, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useESP32 } from "@/context/ESP32Context";
import { useToast } from "@/hooks/use-toast";
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
import { systemLogService } from "@/services/systemLogService";
import { deviceHeartbeatService } from "@/services/deviceHeartbeatService";
import ShopProductCard from "@/components/ShopProductCard";
import DrinkCard from "@/components/DrinkCard";

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
  /** Enrichment data for ranking opt-in (fingerprinting) */
  enrichData?: {
    customerName?: string;
    customerIdentification?: string;
    payerId?: string;
    cardFirstDigits?: string;
    cardLastDigits?: string;
  } | null;
  storeId?: string;
};

const INITIAL_LOAD_LIMIT = 50;

const Shop = () => {
  const { products, loading } = useFirebaseProducts();
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
  const { status: esp32Status, supervisorStatus } = useESP32();
  const { toast } = useToast();

  const lastOkAgeMs = supervisorStatus.lastOkAt ? Date.now() - supervisorStatus.lastOkAt : Number.POSITIVE_INFINITY;
  const isEsp32Healthy = esp32Status.connected && lastOkAgeMs <= 30000;

  // Kiosk idle overlay (suppressed when any modal/overlay is active)
  const isSuppressed = isCartOpen || isDrinkCheckoutOpen || !!drinkPickupData || isKeyboardVisible || isCheckoutOpen;
  const attractTimeout = settings?.attractTimeoutSeconds ?? 15;
  const suppressionReasons = [
    isCartOpen ? 'cart-open' : null,
    isDrinkCheckoutOpen ? 'drink-checkout-open' : null,
    drinkPickupData ? 'drink-pickup-active' : null,
    isKeyboardVisible ? 'keyboard-visible' : null,
    isCheckoutOpen ? 'checkout-open' : null,
  ].filter(Boolean).join(',');
  const { isIdle, resetIdle } = useKioskIdle({
    timeoutSeconds: attractTimeout,
    suppressed: isSuppressed,
    debugLabel: 'shop-attract',
    suppressedReason: suppressionReasons || undefined,
  });
  const isAttractVisible = isIdle && (settings?.attractScreenEnabled ?? true);

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
        // Iniciar heartbeat ANTES do lock task para que o dialog de permissão GPS apareça
        await deviceHeartbeatService.start();

        console.log('[Shop] Ativando kiosk mode...');
        const success = await enterKioskMode();
        if (success) {
          console.log('[Shop] ✅ Kiosk mode ativado com sucesso');
        } else {
          console.warn('[Shop] ⚠️ Falha ao ativar kiosk mode (pode estar em dev/web)');
          systemLogService.warn('kiosk', 'Falha ao ativar kiosk mode');
        }
      } catch (error) {
        console.error('[Shop] Erro ao ativar kiosk mode:', error);
        systemLogService.error('kiosk', `Erro ao ativar kiosk mode: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    activateKiosk();

    return () => {
      deviceHeartbeatService.stop();
    };
  }, []); // Executar apenas uma vez na montagem

  useEffect(() => {
    console.log('[Shop] Attract configuration updated:', {
      attractTimeoutSeconds: attractTimeout,
      attractScreenEnabled: settings?.attractScreenEnabled ?? true,
      hasVideoConfig: !!settings?.attractVideoConfig?.isEnabled,
    });
  }, [attractTimeout, settings?.attractScreenEnabled, settings?.attractVideoConfig?.isEnabled]);

  useEffect(() => {
    if (!isSuppressed) {
      console.log('[Shop] Attract screen timer active');
      return;
    }

    console.log('[Shop] Attract screen suppressed:', {
      reasons: suppressionReasons.split(',').filter(Boolean),
    });
  }, [isSuppressed, suppressionReasons]);

  useEffect(() => {
    console.log('[Shop] Attract visibility changed:', {
      visible: isAttractVisible,
      isIdle,
      attractScreenEnabled: settings?.attractScreenEnabled ?? true,
    });
  }, [isAttractVisible, isIdle, settings?.attractScreenEnabled]);

  useEffect(() => {
    if (products) {
      // Sort products by most sold (assuming we track sales in a field like 'salesCount')
      // For now, we'll sort by stock level as a proxy (lower stock = more sold)
      const sortedByMostSold = [...products].sort((a, b) => {
        // [FIX BUG-CAT-06] Usar totalMlAvailable para drinks, stock para produtos normais
        const stockA = a.isDrink ? (a.totalMlAvailable || 0) : (a.stock || 0);
        const stockB = b.isDrink ? (b.totalMlAvailable || 0) : (b.stock || 0);

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
        product.tags?.some(tag => tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase())) ||
        product.style?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
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
      if (!isEsp32Healthy) {
        systemLogService.warn('kiosk', 'Checkout bebida bloqueado: ESP32 não saudável', { productId: product.id, esp32Connected: esp32Status.connected });
        toast({
          title: t('shop.tempUnavailable'),
          description: t('shop.tryAgainSoon'),
          variant: 'destructive',
        });
        return;
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

  // Separate drink and normal products for different card styles
  const drinkProducts = displayedProducts.filter(p => p.isDrink);
  const normalProducts = displayedProducts.filter(p => !p.isDrink);
  const isSingleDrink = drinkProducts.length === 1 && normalProducts.length === 0;
  const hasDrinks = drinkProducts.length > 0;
  const isDrinkOnlyMode = hasDrinks && normalProducts.length === 0;

  // ---------- Dark mode ----------
  // Applied via className on the Shop container div (NOT on <html>)
  // so that portal-based modals (checkout, cart) stay in light mode.
  // Keep useEffect as a no-op to preserve hook count across renders.
  useEffect(() => {
    // Dark mode is now scoped to the Shop container div.
    // Ensure <html> never has stale .dark from a previous version.
    document.documentElement.classList.remove('dark');
  }, [hasDrinks]);

  const noResults = displayedProducts.length === 0 && searchQuery.trim().length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="ml-4 text-muted-foreground">{t('shop.loadingProducts')}</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${hasDrinks ? 'bg-gradient-to-b from-[#0B0B0B] to-[#111827]' : 'bg-background'} text-foreground${hasDrinks ? ' dark' : ''}`}>
      {/* Search Bar — hidden in drink-only mode */}
      {!isDrinkOnlyMode && (
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder={t('shop.searchProducts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsKeyboardVisible(true)}
                aria-label={t('shop.searchProducts')}
                className="w-full pl-10 pr-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent touch-target"
              />
            </div>
            <VoiceSearchButton onTranscript={handleVoiceTranscript} />
            <div>
              <Button
                variant="outline"
                size="default"
                onClick={() => setIsCartOpen(true)}
                className="relative touch-target"
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
      )}

      {!isEsp32Healthy && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive">
              {t('shop.tempUnavailable')}
            </p>
          </div>
        </div>
      )}

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Empty state — search with no results */}
        {noResults ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <PackageX className="w-16 h-16 text-muted-foreground/50" />
            <p className="text-lg font-semibold text-muted-foreground">{t('shop.noProducts')}</p>
            <p className="text-sm text-muted-foreground/70">{t('shop.noResultsHint')}</p>
            <Button variant="outline" size="default" onClick={() => setSearchQuery('')}>
              {t('shop.clearSearch')}
            </Button>
          </div>
        ) : (
          <>
            {/* Drink products — "Quadro de Chopes" style */}
            {isSingleDrink ? (
              /* Single drink: full screen card */
              <DrinkCard
                product={drinkProducts[0]}
                currencySymbol={currentCurrency.symbol}
                isEsp32Healthy={isEsp32Healthy}
                onAdd={addToCart}
                fullScreen
              />
            ) : drinkProducts.length > 0 ? (
              <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
                {drinkProducts.map((product) => (
                  <DrinkCard
                    key={product.id}
                    product={product}
                    currencySymbol={currentCurrency.symbol}
                    isEsp32Healthy={isEsp32Healthy}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            ) : null}

            {/* Normal products — original card style */}
            {normalProducts.length > 0 && (
              <>
                {hasDrinks && normalProducts.length > 0 && (
                  <div className="my-8 border-t border-border" />
                )}
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {normalProducts.map((product) => (
                    <ShopProductCard
                      key={product.id}
                      product={product}
                      currencySymbol={currentCurrency.symbol}
                      isEsp32Healthy={isEsp32Healthy}
                      onAddToCart={addToCart}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Show More Button */}
            {hasMoreProducts && (
              <div className="flex justify-center mt-8">
                <Button onClick={loadMore} variant="outline" size="lg">
                  {t('shop.showMore')} ({filteredProducts.length - displayLimit} {t('shop.remaining')})
                </Button>
              </div>
            )}
          </>
        )}

        {/* Results Info */}
        {!isDrinkOnlyMode && (
          <div className="text-center mt-4 text-sm text-muted-foreground">
            {t('shop.showingProducts', { displayed: displayedProducts.length, total: filteredProducts.length })}
          </div>
        )}
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
        enrichData={drinkPickupData?.enrichData}
        storeId={drinkPickupData?.storeId}
        timeoutSeconds={80}
        onComplete={handleClosePickup}
        onTimeout={handleClosePickup}
      />

      {/* On-Screen Keyboard */}
      <OnScreenKeyboard
        isVisible={isKeyboardVisible}
        onKeyPress={handleKeyPress}
        onClose={() => setIsKeyboardVisible(false)}
        darkMode={hasDrinks}
      />

      {/* Attract Screen Overlay */}
      <AttractScreen
        visible={isAttractVisible}
        onStart={resetIdle}
        title={t('shop.orderHere')}
        subtitle={t('shop.touchToStart')}
        attractVideoConfig={settings?.attractVideoConfig}
      />

    </div>
  );
};

export default Shop;
