
import { useState, useEffect } from 'react';
import { Product } from '@/types/product';
import { getFirebaseDb } from '@/services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

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

export const useFirebaseProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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

    // Ensure single shared Firestore subscription
    if (!subscriptionActive && !subscriptionInitializing) {
      subscriptionInitializing = true;
      try {
        const db = getFirebaseDb();
        const productsCollection = collection(db, 'products');
        unsubscribeGlobal = onSnapshot(productsCollection, (snapshot) => {
          const productsData = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          })) as Product[];
          productsGlobal = productsData;
          loadingGlobal = false;
          errorGlobal = null;
          productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
        }, (error) => {
          console.error('Error fetching products:', error);
          errorGlobal = error.message;
          loadingGlobal = false;
          if (!hasToastedError) {
            toast({
              title: "Error",
              description: "Failed to fetch products from Firebase",
              variant: "destructive"
            });
            hasToastedError = true;
          }
          productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
        });
        subscriptionActive = true;
      } catch (error) {
        console.error('Error setting up products listener:', error);
        errorGlobal = error instanceof Error ? error.message : 'Unknown error';
        loadingGlobal = false;
        productListeners.forEach(fn => fn(productsGlobal, loadingGlobal, errorGlobal));
      } finally {
        subscriptionInitializing = false;
      }
    }

    // Cleanup for this hook instance
    return () => {
      const idx = productListeners.indexOf(localListener);
      if (idx > -1) productListeners.splice(idx, 1);
      subscriberCount--;

      // If no listeners remain, tear down global subscription
      // Use subscriberCount to prevent race conditions during HMR/fast remounts
      if (subscriberCount === 0 && unsubscribeGlobal) {
        unsubscribeGlobal();
        unsubscribeGlobal = null;
        subscriptionActive = false;
        hasToastedError = false;
        loadingGlobal = true;
        errorGlobal = null;
      }
    };
  }, [toast]);

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

      const db = getFirebaseDb();
      const productsCollection = collection(db, 'products');
      const docRef = await addDoc(productsCollection, {
        ...product,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      console.log('Product added with ID:', docRef.id);
      toast({
        title: "Success",
        description: "Product added successfully"
      });
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding product:', error);
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

      const db = getFirebaseDb();
      const productDoc = doc(db, 'products', id);
      await updateDoc(productDoc, {
        ...updates,
        updated_at: new Date().toISOString()
      });
      
      console.log('Product updated:', id);
      toast({
        title: "Success",
        description: "Product updated successfully"
      });
    } catch (error) {
      console.error('Error updating product:', error);
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
      const db = getFirebaseDb();
      const productDoc = doc(db, 'products', id);
      await deleteDoc(productDoc);
      
      console.log('Product deleted:', id);
      toast({
        title: "Success",
        description: "Product deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting product:', error);
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
