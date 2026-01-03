import { getFirebaseDb, getStoreCollection, getStoreDoc, getCurrentStoreId } from './firebase';
import { runTransaction, collection, doc } from 'firebase/firestore';
import { CartItem, Product } from '@/types/product';
import { PaymentMethod, SaleTimingData } from '@/types/sales';

class SalesService {
  private calculateSaleTimingData(now: Date): SaleTimingData {
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
  }

  async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');
    
    // Usar UUID para garantir unicidade mesmo em alta concorrência
    let uniqueId: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uniqueId = crypto.randomUUID().split('-')[0]; // Primeiros 8 caracteres do UUID
    } else {
      // Fallback com mais entropia: timestamp em ms + random maior
      uniqueId = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
    }
    
    return `${year}${month}${day}${hour}${minute}${second}-${uniqueId}`;
  }

  /**
   * Registrar venda e atualizar estoque
   * Suporta multi-loja: usa storeId passado ou fallback para getCurrentStoreId()
   */
  async recordSaleAndUpdateStock(
    cartItems: CartItem[],
    totalAmount: number,
    currency: string,
    orderNumber: string,
    paymentMethod: PaymentMethod,
    storeId?: string  // Parâmetro opcional para multi-loja
  ): Promise<string> {
    const db = getFirebaseDb();
    
    // Usar storeId passado ou obter do localStorage
    const effectiveStoreId = storeId || getCurrentStoreId();
    
    // Validação: em produção, storeId é obrigatório para garantir isolamento de dados
    if (!effectiveStoreId) {
      console.warn('[SalesService] No storeId provided - using root collection (legacy mode)');
    }
    
    console.log('[SalesService] Recording sale for store:', effectiveStoreId || 'root');

    return await runTransaction(db, async (transaction) => {
      // 1. Calcular requisitos por produto
      const requiredByProductId: Record<string, { ml: number; qty: number }> = {};

      cartItems.forEach((item) => {
        const key = item.product.id;
        if (!requiredByProductId[key]) {
          requiredByProductId[key] = { ml: 0, qty: 0 };
        }
        if (item.product.isDrink && item.mlPerUnit) {
          requiredByProductId[key].ml += item.mlPerUnit * item.quantity;
        } else {
          requiredByProductId[key].qty += item.quantity;
        }
      });

      // 2. FASE DE LEITURA: Ler todos os documentos ANTES de qualquer write
      // Usar subcollection se storeId disponível, senão usar raiz
      const productRefs = Object.keys(requiredByProductId).map(productId => 
        effectiveStoreId 
          ? getStoreDoc(effectiveStoreId, 'products', productId)
          : doc(db, 'products', productId)
      );
      
      const productSnapshots = await Promise.all(
        productRefs.map(ref => transaction.get(ref))
      );

      // 3. Mapear snapshots para validação
      const productDataMap: Record<string, { ref: typeof productRefs[0], data: Product }> = {};
      
      productSnapshots.forEach((snapshot, index) => {
        const productId = Object.keys(requiredByProductId)[index];
        if (!snapshot.exists()) {
          throw new Error(`Product ${productId} not found`);
        }
        productDataMap[productId] = {
          ref: productRefs[index],
          data: snapshot.data() as Product
        };
      });

      // 4. Validar estoque de todos os produtos
      for (const [productId, required] of Object.entries(requiredByProductId)) {
        const { data: prod } = productDataMap[productId];

        if (prod.isDrink) {
          const currentMl = prod.totalMlAvailable || 0;
          if (currentMl < required.ml) {
            throw new Error(`Estoque insuficiente de ${prod.title}`);
          }
        } else {
          const currentQty = prod.stock || 0;
          if (currentQty < required.qty) {
            throw new Error(`Estoque insuficiente de ${prod.title}`);
          }
        }
      }

      // 5. FASE DE ESCRITA: Atualizar estoque de todos os produtos
      for (const [productId, required] of Object.entries(requiredByProductId)) {
        const { ref: prodRef, data: prod } = productDataMap[productId];

        if (prod.isDrink) {
          const currentMl = prod.totalMlAvailable || 0;
          const newMl = currentMl - required.ml;
          transaction.update(prodRef, {
            totalMlAvailable: newMl,
            inStock: newMl > 0,
          });
        } else {
          const currentQty = prod.stock || 0;
          const newQty = Math.max(0, currentQty - required.qty);
          transaction.update(prodRef, {
            stock: newQty,
            inStock: newQty > 0,
          });
        }
      }

      // 6. Criar registro de venda
      const now = new Date();
      const timingData = this.calculateSaleTimingData(now);

      const saleData = {
        orderNumber,
        storeId: effectiveStoreId || undefined, // Incluir storeId se disponível
        paymentMethod,
        ...timingData,
        items: cartItems.map((item) => {
          const baseItem = {
            productId: item.product.id,
            title: item.product.title,
            price: item.unitPrice,
            quantity: item.quantity,
            total: item.unitPrice * item.quantity,
          };
          
          // Only include drink-specific fields if product is a drink
          if (item.product.isDrink && item.sizeKey) {
            if (!item.sizeLabel || !item.mlPerUnit) {
              throw new Error(`Invalid drink item: missing size data for product ${item.product.title}`);
            }
            return {
              ...baseItem,
              sizeKey: item.sizeKey,
              sizeLabel: item.sizeLabel,
              mlPerUnit: item.mlPerUnit,
            };
          }
          
          return baseItem;
        }),
        subtotal: cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        tax: totalAmount - cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        total: totalAmount,
        currency,
      };

      // Usar subcollection se storeId disponível, senão usar raiz
      const salesRef = effectiveStoreId 
        ? getStoreCollection(effectiveStoreId, 'sales')
        : collection(db, 'sales');
      const newDocRef = doc(salesRef);
      transaction.set(newDocRef, saleData);
      
      console.log('[SalesService] Sale recorded:', newDocRef.id);
      return newDocRef.id;
    });
  }
}

export const salesService = new SalesService();