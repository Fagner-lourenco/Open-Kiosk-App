
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getFirebaseDb, getStoreDoc, getCurrentStoreId } from '@/services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { STORE_CHANGED_EVENT } from '@/context/StoreContext';

export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export const currencies: Currency[] = [
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
];

// Global currency state per store
let currentCurrencyGlobal: Currency = currencies[0];
const currencyListeners: Array<(currency: Currency) => void> = [];

// Track initialized store to avoid duplicate network calls
let currencyInitializedForStore: string | null = null;
let currencyInitPromise: Promise<void> | null = null;

export const useSettings = (storeId?: string) => {
  const [currentCurrency, setCurrentCurrency] = useState<Currency>(currentCurrencyGlobal);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  // Usa o storeId passado ou busca o atual do sistema
  const getEffectiveStoreId = () => storeId || getCurrentStoreId();

  const fetchCurrency = async () => {
    const effectiveStoreId = getEffectiveStoreId();
    
    // If already initialized for this store, avoid duplicate network calls
    if (currencyInitializedForStore === effectiveStoreId) return;
    if (currencyInitPromise) {
      setLoading(true);
      try {
        await currencyInitPromise;
      } catch (error) {
        console.error('Error waiting currency init:', error);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isMountedRef.current) setLoading(true);
    currencyInitPromise = (async () => {
      try {
        const docRef = getStoreDoc(effectiveStoreId, 'settings', 'default_currency');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const currency = currencies.find(c => c.code === docSnap.data().value) || currencies[0];
          currentCurrencyGlobal = currency;
          setCurrentCurrency(currency);
          // Notify all listeners
          currencyListeners.forEach(listener => listener(currency));
        } else {
          // Fallback: try root collection for backward compatibility
          const db = getFirebaseDb();
          const rootDocRef = doc(db, 'settings', 'default_currency');
          const rootDocSnap = await getDoc(rootDocRef);
          
          if (rootDocSnap.exists()) {
            const currency = currencies.find(c => c.code === rootDocSnap.data().value) || currencies[0];
            currentCurrencyGlobal = currency;
            setCurrentCurrency(currency);
            currencyListeners.forEach(listener => listener(currency));
          }
        }
        currencyInitializedForStore = effectiveStoreId;
      } catch (error) {
        console.error('Error fetching currency:', error);
        toast({
          title: "Error",
          description: "Failed to fetch currency setting",
          variant: "destructive",
        });
        // allow retry on next call
        currencyInitializedForStore = null;
        throw error;
      } finally {
        setLoading(false);
        currencyInitPromise = null;
      }
    })();

    try {
      await currencyInitPromise;
    } catch {
      // error already logged and handled above; allow caller to continue
    }
  };

  const updateCurrency = async (currencyCode: string) => {
    setLoading(true);
    try {
      const currency = currencies.find(c => c.code === currencyCode);
      if (!currency) throw new Error('Invalid currency code');

      const effectiveStoreId = getEffectiveStoreId();
      const docRef = getStoreDoc(effectiveStoreId, 'settings', 'default_currency');
      await setDoc(docRef, {
        value: currencyCode,
        storeId: effectiveStoreId
      });

      currentCurrencyGlobal = currency;
      setCurrentCurrency(currency);
      // Notify all listeners
      currencyListeners.forEach(listener => listener(currency));
      
      toast({
        title: "Success",
        description: `Currency updated to ${currency.name}`,
      });
    } catch (error) {
      console.error('Error updating currency:', error);
      toast({
        title: "Error",
        description: "Failed to update currency",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchCurrency();
    
    // Add this component to the listeners
    const listener = (currency: Currency) => {
      if (isMountedRef.current) setCurrentCurrency(currency);
    };
    currencyListeners.push(listener);

    // Listen for store changes to refetch currency
    const handleStoreChange = () => {
      currencyInitializedForStore = null; // Reset to allow new fetch
      fetchCurrency(); // Refetch currency for new store
    };
    window.addEventListener(STORE_CHANGED_EVENT, handleStoreChange);
    
    // Cleanup
    return () => {
      isMountedRef.current = false;
      const index = currencyListeners.indexOf(listener);
      if (index > -1) {
        currencyListeners.splice(index, 1);
      }
      window.removeEventListener(STORE_CHANGED_EVENT, handleStoreChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]); // Refetch quando storeId muda

  return {
    currentCurrency,
    currencies,
    loading,
    updateCurrency,
    fetchCurrency
  };
};

// Export a hook for components that only need to read the current currency
export const useCurrentCurrency = () => {
  const [currentCurrency, setCurrentCurrency] = useState<Currency>(currentCurrencyGlobal);
  
  useEffect(() => {
    const listener = (currency: Currency) => {
      setCurrentCurrency(currency);
    };
    currencyListeners.push(listener);
    
    return () => {
      const index = currencyListeners.indexOf(listener);
      if (index > -1) {
        currencyListeners.splice(index, 1);
      }
    };
  }, []);
  
  return currentCurrency;
};
