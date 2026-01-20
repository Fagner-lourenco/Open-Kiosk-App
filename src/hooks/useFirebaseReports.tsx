import { useState } from 'react';
import { getStoreCollection, getCurrentStoreId } from '@/services/firebase';
import { addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { CartItem } from '@/types/product';
import { useToast } from '@/hooks/use-toast';
import { PaymentMethod, SaleTimingData } from '@/types/sales';

interface SaleRecord {
  id: string;
  orderNumber: string;
  items: Array<{
    productId: string;
    title: string;
    price: number;
    quantity: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  timestamp: Date;
  date: string;
   paymentMethod?: PaymentMethod;
   hourOfDay?: number;
   dayOfWeek?: number;
   timeSlot?: 'morning' | 'afternoon' | 'evening' | 'night';
   isWeekend?: boolean;
   isHoliday?: boolean;
  storeId?: string;
}

export const useFirebaseReports = (storeId?: string) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Usa o storeId passado ou busca o atual do sistema
  const getEffectiveStoreId = () => storeId || getCurrentStoreId();

  const calculateSaleTimingData = (now: Date): SaleTimingData => {
    const hour = now.getHours();
    let timeSlot: SaleTimingData['timeSlot'];

    if (hour >= 6 && hour < 12) timeSlot = 'morning';
    else if (hour >= 12 && hour < 18) timeSlot = 'afternoon';
    else if (hour >= 18 && hour < 24) timeSlot = 'evening';
    else timeSlot = 'night';

    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    return {
      timestamp: now,
      date: now.toISOString().split('T')[0],
      hourOfDay: hour,
      dayOfWeek,
      timeSlot,
      isWeekend,
      isHoliday: false,
    };
  };

  // Generate order number in YYMMDDHHMMSS-xxxxxx format with entropy to avoid collisions
  const generateOrderNumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');

    // Usa UUID se disponível para evitar duplicações em alta concorrência
    const entropy = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 8);
    
    return `${year}${month}${day}${hour}${minute}${second}-${entropy}`;
  };

  const recordSale = async (
    cartItems: CartItem[],
    totalAmount: number,
    currency: string,
    orderNumber?: string,
    paymentMethod: PaymentMethod = 'unknown'
  ) => {
    try {
      const effectiveStoreId = getEffectiveStoreId();
      const finalOrderNumber = orderNumber || await generateOrderNumber();
      const now = new Date();
      const timingData = calculateSaleTimingData(now);
      
      const saleData = {
        orderNumber: finalOrderNumber,
        items: cartItems.map(item => ({
          productId: item.product.id,
          title: item.product.title,
          price: item.product.price,
          quantity: item.quantity,
          total: item.product.price * item.quantity
        })),
        subtotal: cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
        tax: totalAmount - cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
        total: totalAmount,
        currency,
        paymentMethod,
        ...timingData,
        storeId: effectiveStoreId
      };

      // Usar 'orders' para compatibilidade com Admin
      const salesCollection = getStoreCollection(effectiveStoreId, 'orders');
      await addDoc(salesCollection, saleData);
      console.log('Sale recorded successfully with order number:', finalOrderNumber);
      
      return finalOrderNumber;
    } catch (error) {
      console.error('Error recording sale:', error);
      toast({
        title: "Error",
        description: "Failed to record sale",
        variant: "destructive"
      });
      throw error;
    }
  };

  const getSalesReports = async (startDate?: string, endDate?: string): Promise<SaleRecord[]> => {
    setLoading(true);
    try {
      const effectiveStoreId = getEffectiveStoreId();
      // Usar 'orders' para compatibilidade com Admin
      const salesCollection = getStoreCollection(effectiveStoreId, 'orders');
      
      let q = query(salesCollection, orderBy('timestamp', 'desc'));
      
      if (startDate && endDate) {
        q = query(
          salesCollection,
          where('date', '>=', startDate),
          where('date', '<=', endDate),
          orderBy('date', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      const sales: SaleRecord[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Validação segura de timestamp
        let timestamp: Date;
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          timestamp = data.timestamp.toDate();
        } else if (data.timestamp) {
          timestamp = new Date(data.timestamp);
        } else {
          timestamp = new Date();
        }
        
        sales.push({
          id: doc.id,
          ...data,
          timestamp
        } as SaleRecord);
      });

      return sales;
    } catch (error) {
      console.error('Error fetching sales reports:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sales reports",
        variant: "destructive"
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    recordSale,
    getSalesReports,
    generateOrderNumber,
    loading
  };
};
