
import { useState, useEffect, useCallback, useRef } from 'react';
import { Product } from '@/types/product';
import { getFirebaseDb, getStoreCollection, getStoreDoc, getCurrentStoreId } from '@/services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, CollectionReference } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { STORE_CHANGED_EVENT } from '@/context/StoreContext';
import { isFranchiseMode } from '@/lib/pathResolver';
import { 
  saveProductsToCache, 
  loadProductsFromCache, 
  updateProductInCache, 
  removeProductFromCache,
  isCacheStale,
} from '@/services/productCacheService';

// Shared subscription to avoid duplicate listeners when multiple components mount
let productsGlobal: Product[] = [];
let loadingGlobal = true;
let errorGlobal: string | null = null;
let unsubscribeGlobal: (() => void) | null = null;
const productListeners: Array<(products: Product[], loading: boolean, error: string | null) => void> = [];
let subscriptionActive = false;
let hasToastedError = false;
let subscriptionInitializing = false;
let subscriberCount = 0; // Reference counting to prevent race conditions on cleanup
let currentSubscribedStoreId: string | null = null; // Track which store we're subscribed to
let setupPromise: Promise<void> | null = null; // Mutex para evitar race conditions

/**
 * Helper para obter a collection de produtos correta
 * - Se storeId existe: usa subcollection stores/{storeId}/products
 * - Se não: usa collection raiz /products (compatibilidade)
 */
const getProductsCollection = (storeId: string | null): CollectionReference => {
  const db = getFirebaseDb();
  if (storeId) {
    console.log('[useFirebaseProducts] Using store subcollection:', storeId);
    return getStoreCollection(storeId, 'products');
  }
  console.log('[useFirebaseProducts] Using root collection (no storeId)');
  return collection(db, 'products');
};

/**
 * Reset global state para re-subscription
 */
const resetGlobalState = () => {
  if (unsubscribeGlobal) {
    unsubscribeGlobal();
    unsubscribeGlobal = null;
  }
  subscriptionActive = false;
  subscriptionInitializing = false;
  hasToastedError = false;
  loadingGlobal = true;
  errorGlobal = null;
  productsGlobal = [];
  currentSubscribedStoreId = null;
};

export const useFirebaseProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Referência ao toast para uso no callback sem causar re-criação
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Callback para configurar subscription com mutex para evitar race conditions
  const setupSubscription = useCallback(async (storeId: string | null) => {
    // Se não tem storeId em modo franquia, aguarda até ter
    // Isso evita queries sem permissão
    if (!storeId && isFranchiseMode()) {
      console.log('[useFirebaseProducts] No storeId in franchise mode, waiting...');
      loadingGlobal = true;
      productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
      return;
    }

    // Aguardar setup anterior se existir (mutex)
    if (setupPromise) {
      await setupPromise;
    }
    
    // Se já estamos subscribed no mesmo store, não fazer nada
    if (subscriptionActive && currentSubscribedStoreId === storeId) {
      return;
    }

    // Reset se mudou de store
    if (currentSubscribedStoreId !== storeId) {
      resetGlobalState();
    }

    subscriptionInitializing = true;
    currentSubscribedStoreId = storeId;

    // Criar promise para sincronização
    let resolveSetup: () => void;
    setupPromise = new Promise<void>((resolve) => {
      resolveSetup = resolve;
    });

    try {
      // 1. OFFLINE-FIRST: Carrega do cache PRIMEIRO (não bloqueia UI)
      const cachedProducts = await loadProductsFromCache();
      if (cachedProducts && cachedProducts.length > 0) {
        console.log('[useFirebaseProducts] Loaded from cache:', cachedProducts.length, 'products');
        productsGlobal = cachedProducts;
        loadingGlobal = false;
        productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
      }

      // 2. Configura listener do Firebase (sync em background)
      const productsCollection = getProductsCollection(storeId);
      
      unsubscribeGlobal = onSnapshot(productsCollection, (snapshot) => {
        const productsData = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Product[];
        
        productsGlobal = productsData;
        loadingGlobal = false;
        errorGlobal = null;
        
        // Atualiza cache em background (não bloqueia)
        saveProductsToCache(productsData).catch((err) => {
          console.warn('[useFirebaseProducts] Error saving to cache:', err);
        });
        
        productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
      }, (snapshotError) => {
        console.error('[useFirebaseProducts] Error fetching products:', snapshotError);
        errorGlobal = snapshotError.message;
        
        // Se offline e temos cache, não mostra erro
        if (!navigator.onLine && productsGlobal.length > 0) {
          console.log('[useFirebaseProducts] Offline, using cached data');
          loadingGlobal = false;
          errorGlobal = null;
        } else {
          loadingGlobal = false;
          if (!hasToastedError) {
            toastRef.current({
              title: "Error",
              description: "Failed to fetch products from Firebase",
              variant: "destructive"
            });
            hasToastedError = true;
          }
        }
        
        productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
      });
      subscriptionActive = true;
    } catch (setupError) {
      console.error('[useFirebaseProducts] Error setting up products listener:', setupError);
      
      // Fallback: tenta carregar do cache se ainda não carregou
      if (productsGlobal.length === 0) {
        const cached = await loadProductsFromCache();
        if (cached && cached.length > 0) {
          productsGlobal = cached;
          console.log('[useFirebaseProducts] Fallback to cache after error');
        }
      }
      
      errorGlobal = setupError instanceof Error ? setupError.message : 'Unknown error';
      loadingGlobal = false;
      productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
    } finally {
      subscriptionInitializing = false;
      resolveSetup!();
      setupPromise = null;
    }
  }, []); // Sem dependências - usa toastRef

  useEffect(() => {
    // Register local listener
    const localListener = (p: Product[], l: boolean, e: string | null) => {
      setProducts(p);
      setLoading(l);
      setError(e);
    };
    productListeners.push(localListener);
    subscriberCount++;

    // Push current state to this hook immediately
    localListener(productsGlobal, loadingGlobal, errorGlobal);

    // Get current storeId
    const storeId = getCurrentStoreId();

    // Ensure single shared Firestore subscription
    if (!subscriptionActive && !subscriptionInitializing) {
      setupSubscription(storeId);
    }

    // Listen for store changes
    const handleStoreChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ storeId: string }>;
      console.log('[useFirebaseProducts] Store changed, re-subscribing:', customEvent.detail.storeId);
      setupSubscription(customEvent.detail.storeId);
    };
    window.addEventListener(STORE_CHANGED_EVENT, handleStoreChange);

    // Cleanup for this hook instance
    return () => {
      window.removeEventListener(STORE_CHANGED_EVENT, handleStoreChange);
      
      const idx = productListeners.indexOf(localListener);
      if (idx > -1) productListeners.splice(idx, 1);
      subscriberCount--;

      // If no listeners remain, tear down global subscription
      if (subscriberCount === 0 && unsubscribeGlobal) {
        resetGlobalState();
      }
    };
  }, [setupSubscription]); // toast removido - usamos toastRef

  const addProduct = async (product: Omit<Product, 'id'>) => {
    try {
      // Validacoes especificas para bebidas (intervencao minima)
      if (product.isDrink) {
        if (!product.sizes || product.sizes.length === 0) {
          throw new Error('Bebidas precisam ter pelo menos um tamanho');
        }
        if (!product.totalMlAvailable || product.totalMlAvailable <= 0) {
          throw new Error('Total ML disponível deve ser maior que 0');
        }
        if (!product.defaultSizeKey) {
          throw new Error('Selecione um tamanho padrão');
        }
      }

      const storeId = getCurrentStoreId();
      const productsCollection = getProductsCollection(storeId);
      
      const docRef = await addDoc(productsCollection, {
        ...product,
        storeId: storeId || undefined, // Adicionar storeId se disponível
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      console.log('[useFirebaseProducts] Product added with ID:', docRef.id);
      
      // Atualiza cache local com novo produto
      const newProduct = { ...product, id: docRef.id } as Product;
      updateProductInCache(newProduct).catch((err) => {
        console.warn('[useFirebaseProducts] Error caching new product:', err);
      });
      
      toast({
        title: "Success",
        description: "Product added successfully"
      });
      
      return docRef.id;
    } catch (error) {
      console.error('[useFirebaseProducts] Error adding product:', error);
      toast({
        title: "Error",
        description: (error as Error)?.message || "Failed to add product",
        variant: "destructive"
      });
      throw error;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      // Validar bebidas: se está atualizando para isDrink=true ou já é bebida
      const existingProduct = products.find(p => p.id === id);
      const willBeDrink = updates.isDrink ?? existingProduct?.isDrink;
      
      if (willBeDrink) {
        const finalSizes = updates.sizes ?? existingProduct?.sizes;
        const finalTotalMl = updates.totalMlAvailable ?? existingProduct?.totalMlAvailable;
        const finalDefaultSizeKey = updates.defaultSizeKey ?? existingProduct?.defaultSizeKey;
        
        if (!finalSizes || finalSizes.length === 0) {
          throw new Error('Bebidas precisam ter pelo menos um tamanho');
        }
        if (!finalTotalMl || finalTotalMl <= 0) {
          throw new Error('Total ML disponível deve ser maior que 0');
        }
        if (!finalDefaultSizeKey) {
          throw new Error('Selecione um tamanho padrão');
        }
      }

      const storeId = getCurrentStoreId();
      const db = getFirebaseDb();
      
      // Usar subcollection ou raiz dependendo de storeId
      const productDoc = storeId 
        ? getStoreDoc(storeId, 'products', id)
        : doc(db, 'products', id);
      
      await updateDoc(productDoc, {
        ...updates,
        updated_at: new Date().toISOString()
      });
      
      console.log('[useFirebaseProducts] Product updated:', id);
      
      // Atualiza cache local
      const updatedProduct = products.find(p => p.id === id);
      if (updatedProduct) {
        updateProductInCache({ ...updatedProduct, ...updates }).catch((err) => {
          console.warn('[useFirebaseProducts] Error caching updated product:', err);
        });
      }
      
      toast({
        title: "Success",
        description: "Product updated successfully"
      });
    } catch (error) {
      console.error('[useFirebaseProducts] Error updating product:', error);
      toast({
        title: "Error",
        description: (error as Error)?.message || "Failed to update product",
        variant: "destructive"
      });
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const storeId = getCurrentStoreId();
      const db = getFirebaseDb();
      
      // Usar subcollection ou raiz dependendo de storeId
      const productDoc = storeId 
        ? getStoreDoc(storeId, 'products', id)
        : doc(db, 'products', id);
      
      await deleteDoc(productDoc);
      
      console.log('[useFirebaseProducts] Product deleted:', id);
      
      // Remove do cache local
      removeProductFromCache(id).catch((err) => {
        console.warn('[useFirebaseProducts] Error removing from cache:', err);
      });
      
      toast({
        title: "Success",
        description: "Product deleted successfully"
      });
    } catch (error) {
      console.error('[useFirebaseProducts] Error deleting product:', error);
      toast({
        title: "Error",
        description: "Failed to delete product",
        variant: "destructive"
      });
      throw error;
    }
  };

  return {
    products,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct
  };
};
