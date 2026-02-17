import { getFirebaseDb, getStoreCollection, getStoreDoc, getCurrentStoreId, getCurrentFranchiseId } from './firebase';
import { runTransaction, collection, doc, serverTimestamp, Timestamp, increment, updateDoc, getDoc } from 'firebase/firestore';
import { enqueueSync } from './syncService';
import { cacheGet, STORES, CachedProduct } from './cacheService';
import { CartItem, Product } from '@/types/product';
import { PaymentMethod, SaleTimingData } from '@/types/sales';
import { deviceHeartbeatService } from './deviceHeartbeatService';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';
import type { DispenseStatus } from '@/types/payments';
import type { OrderCustomerData } from '@/types/sales';

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
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
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
   * Registrar venda offline
   * Usa cache local para validação otimista e enfileira operações via syncService
   */
  private async recordOfflineSale(
    cartItems: CartItem[],
    totalAmount: number,
    currency: string,
    orderNumber: string,
    paymentMethod: PaymentMethod,
    storeId: string
  ): Promise<string> {
    console.log('[SalesService] Processing offline sale:', orderNumber);

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

    // 2. Tentar validar com cache local (Best Effort)
    // Se não tiver cache, assume positivo para não bloquear venda
    for (const [productId, required] of Object.entries(requiredByProductId)) {
      try {
        const cached = await cacheGet<CachedProduct>(STORES.PRODUCTS, productId);
        if (cached && cached.data) {
          const prod = cached.data as Product;

          if (prod.isDrink) {
            const currentMl = prod.totalMlAvailable || 0;
            if (currentMl < required.ml) {
              console.warn(`[SalesService] Offline stock warning for ${prod.title}: needed ${required.ml}, have ${currentMl}`);
              // Não bloqueamos venda offline por estoque, mas logamos
            }
          } else {
            const currentQty = prod.stock || 0;
            if (currentQty < required.qty) {
              console.warn(`[SalesService] Offline stock warning for ${prod.title}: needed ${required.qty}, have ${currentQty}`);
            }
          }
        }
      } catch (err) {
        console.warn('[SalesService] Failed to check local cache, proceeding anyway:', err);
      }
    }

    // 3. Gerar dados da venda
    const now = new Date();
    const timingData = this.calculateSaleTimingData(now);
    const deviceId = await deviceHeartbeatService.getDeviceId();
    const franchiseId = getCurrentFranchiseId();

    const saleData = {
      orderNumber,
      storeId,
      franchiseId: franchiseId || undefined,
      deviceId,
      paymentMethod,
      ...timingData,
      status: 'paid_pending_dispense' as const,
      paymentStatus: 'paid' as const,
      dispenseStatus: 'pending' as DispenseStatus,
      createdAt: { _type: 'serverTimestamp' },
      paidAt: { _type: 'serverTimestamp' },
      completedAt: null,
      dispensedAt: null,
      lastSync: { _type: 'serverTimestamp' },
      notes: 'Offline Sale',
      items: cartItems.map((item) => {
        const baseItem = {
          productId: item.product.id,
          title: item.product.title,
          price: item.unitPrice,
          quantity: item.quantity,
          total: item.unitPrice * item.quantity,
        };
        if (item.product.isDrink && item.sizeKey) {
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

    // 4. Enfileirar criação do pedido
    // Nota: 'serverTimestamp' será transformado em null/object no JSON do IndexedDB, 
    // syncService deve tratar isso ou usar Date.now() e converter no sync.
    // O ideal é usar null e deixar o syncService por o serverTimestamp real na hora do envio, 
    // mas vamos manter compatibilidade com o objeto esperado.
    const sanitizedSaleData = sanitizeFirestoreData(saleData);
    await enqueueSync('create', 'orders', orderNumber, sanitizedSaleData);

    // 5. Enfileirar atualizações de estoque (usando increment para segurança)
    for (const [productId, required] of Object.entries(requiredByProductId)) {
      const isDrink = cartItems.find(i => i.product.id === productId)?.product.isDrink;

      if (isDrink) {
        await enqueueSync('update', 'products', productId, {
          totalMlAvailable: { _type: 'increment', value: -required.ml },
          updatedAt: { _type: 'serverTimestamp' }
        });
      } else {
        await enqueueSync('update', 'products', productId, {
          stock: { _type: 'increment', value: -required.qty },
          updatedAt: { _type: 'serverTimestamp' }
        });
      }
    }

    console.log('[SalesService] Offline sale queued:', orderNumber);
    return orderNumber;
  }

  /**
   * Registrar venda e atualizar estoque
   * Suporta multi-loja e OFFLINE via syncService
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

    // Validacao: em producao, storeId e obrigatorio para garantir isolamento de dados
    if (!effectiveStoreId) {
      throw new Error('[SalesService] storeId obrigatorio para registrar pedido');
    }

    // OFFLINE HANDLING: Se não houver conexão, usar modo offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.recordOfflineSale(
        cartItems,
        totalAmount,
        currency,
        orderNumber,
        paymentMethod,
        effectiveStoreId
      );
    }

    console.log('[SalesService] Recording sale for store:', effectiveStoreId);

    // Obter deviceId ANTES da transação para evitar side-effects em caso de retry
    const cachedDeviceId = await deviceHeartbeatService.getDeviceId();

    const result = await runTransaction(db, async (transaction) => {
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
      // Usar subcollection (products) - storeId e obrigatorio em producao
      const productRefs = Object.keys(requiredByProductId).map(productId =>
        getStoreDoc(effectiveStoreId, 'products', productId)
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
            updatedAt: serverTimestamp(),
          });
        } else {
          const currentQty = prod.stock || 0;
          const newQty = Math.max(0, currentQty - required.qty);
          transaction.update(prodRef, {
            stock: newQty,
            inStock: newQty > 0,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // 6. Criar registro de venda
      const now = new Date();
      const timingData = this.calculateSaleTimingData(now);

      // deviceId obtido fora da transação para evitar side-effects em retries
      const deviceId = cachedDeviceId;

      // Obter franchiseId para agregação multi-tenant
      const franchiseId = getCurrentFranchiseId();

      const saleData = {
        orderNumber,
        storeId: effectiveStoreId || undefined, // Incluir storeId se disponível
        franchiseId: franchiseId || undefined,   // Incluir franchiseId para agregação
        deviceId,                                // Rastreabilidade do dispositivo
        paymentMethod,
        ...timingData,

        // ======= CAMPOS DE STATUS PARA SINCRONIZAÇÃO COM ADMIN =======
        // Vendas do Kiosk: pagamento confirmado, dispense pendente
        // Status sera atualizado para 'completed' quando ESP32 confirmar dispense
        status: 'paid_pending_dispense' as const,
        paymentStatus: 'paid' as const,
        dispenseStatus: 'pending' as DispenseStatus,
        createdAt: serverTimestamp(),          // Timestamp Firebase de criação
        paidAt: serverTimestamp(),             // Momento do pagamento
        completedAt: null,                    // Preenchido apos dispense confirmado
        dispensedAt: null,                    // Preenchido apos dispense confirmado
        lastSync: serverTimestamp(),           // Momento da sincronização
        notes: '',                              // Campo para observações futuras
        // ==============================================================

        items: cartItems.map((item) => {
          const baseItem: Record<string, any> = {
            productId: item.product.id,
            title: item.product.title,
            price: item.unitPrice,
            quantity: item.quantity,
            total: item.unitPrice * item.quantity,
          };

          // Dynamic pricing audit trail
          if (item.pricingSnapshot) {
            baseItem.originalPrice = item.pricingSnapshot.basePrice;
            baseItem.pricingSnapshot = item.pricingSnapshot;
          }

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
        hasDynamicPricing: cartItems.some(item => !!item.pricingSnapshot),
        subtotal: cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        tax: totalAmount - cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        total: totalAmount,
        currency,
      };

      // Usar subcollection (products) - storeId e obrigatorio em producao
      // Nota: Usando 'orders' para compatibilidade com Admin
      const salesRef = getStoreCollection(effectiveStoreId, 'orders');
      const newDocRef = doc(salesRef, orderNumber);
      transaction.set(newDocRef, saleData);

      console.log('[SalesService] Sale recorded:', newDocRef.id);

      return newDocRef.id;
    });

    // Enviar heartbeat APÓS a transação (fire-and-forget, fora do retry scope)
    deviceHeartbeatService.sendHeartbeat();

    return result;
  }

  /**
   * Atualiza o status de dispense de um pedido.
   * Chamado pelo fluxo de dispensacao para transicionar:
   *   pending -> dispensing -> dispensed | failed_dispense
   */
  async updateOrderDispenseStatus(
    orderNumber: string,
    dispenseStatus: 'dispensing' | 'dispensed' | 'failed_dispense',
    storeId?: string
  ): Promise<void> {
    const effectiveStoreId = storeId || getCurrentStoreId();
    if (!effectiveStoreId) {
      throw new Error('[SalesService] storeId obrigatorio para atualizar dispense status');
    }

    const salesRef = getStoreCollection(effectiveStoreId, 'orders');
    const docRef = doc(salesRef, orderNumber);

    const updateData: Record<string, unknown> = {
      dispenseStatus,
      updatedAt: serverTimestamp(),
    };

    if (dispenseStatus === 'dispensed') {
      updateData.status = 'completed';
      updateData.dispensedAt = serverTimestamp();
      updateData.completedAt = serverTimestamp();
    } else if (dispenseStatus === 'failed_dispense') {
      updateData.status = 'failed_dispense';
    } else if (dispenseStatus === 'dispensing') {
      updateData.status = 'dispensing';
    }

    // KIO-17 fix: validate state transition via transaction to prevent race conditions
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ['dispensing'],
      dispensing: ['dispensed', 'failed_dispense'],
      dispensed: [],         // terminal — nenhuma transição permitida
      failed_dispense: [],   // terminal — nenhuma transição permitida
    };

    try {
      const db = getFirebaseDb();
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef);
        if (!snap.exists()) {
          throw new Error(`[SalesService] Order ${orderNumber} not found`);
        }
        const currentStatus = snap.data()?.dispenseStatus || 'pending';
        const allowed = VALID_TRANSITIONS[currentStatus];
        if (allowed && !allowed.includes(dispenseStatus)) {
          console.warn(`[SalesService] Invalid dispense transition: ${currentStatus} -> ${dispenseStatus}, skipping`);
          return;
        }
        transaction.update(docRef, updateData);
      });
      console.log(`[SalesService] Dispense status updated: ${orderNumber} -> ${dispenseStatus}`);
    } catch (error) {
      console.error(`[SalesService] Failed to update dispense status for ${orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Enriquecer pedido existente com dados do cliente vindos do pagamento.
   * 
   * Compatível com AMBOS os gateways (Mercado Pago e PagBank).
   * Chamado APÓS pagamento aprovado.
   * Atualiza o documento orders/{orderNumber} com dados do pagador para:
   * - Ranking de clientes por consumo
   * - Análise de comportamento (método, parcelas, bandeira)
   * - Rastreabilidade de pagamento (gatewayOrderId, gatewayPaymentId)
   * 
   * NÃO bloqueante — falha aqui não afeta o fluxo de dispense.
   */
  async enrichOrderWithCustomerData(
    orderNumber: string,
    customerData: OrderCustomerData,
    storeId?: string
  ): Promise<void> {
    try {
      const effectiveStoreId = storeId || getCurrentStoreId();
      if (!effectiveStoreId) {
        console.warn('[SalesService] enrichOrderWithCustomerData: storeId ausente');
        return;
      }

      const salesRef = getStoreCollection(effectiveStoreId, 'orders');
      const docRef = doc(salesRef, orderNumber);

      // Montar update data removendo campos undefined
      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      // Dados do cliente (para ranking)
      if (customerData.customerName) updateData.customerName = customerData.customerName;
      if (customerData.customerEmail) updateData.customerEmail = customerData.customerEmail;
      if (customerData.customerIdentification) updateData.customerIdentification = customerData.customerIdentification;

      // Dados de rastreamento do gateway (genérico)
      if (customerData.gatewayProvider) updateData.gatewayProvider = customerData.gatewayProvider;
      if (customerData.gatewayOrderId) updateData.gatewayOrderId = customerData.gatewayOrderId;
      if (customerData.gatewayPaymentId) updateData.gatewayPaymentId = customerData.gatewayPaymentId;

      // Backward compat: gravar também nos campos MP-legacy se for MP
      if (customerData.gatewayProvider === 'mercado_pago') {
        if (customerData.gatewayOrderId) updateData.mpOrderId = customerData.gatewayOrderId;
        if (customerData.gatewayPaymentId) updateData.mpPaymentId = customerData.gatewayPaymentId;
      }

      // Dados do método de pagamento
      if (customerData.paymentMethodId) updateData.paymentMethodId = customerData.paymentMethodId;
      if (customerData.paymentTypeId) updateData.paymentTypeId = customerData.paymentTypeId;
      if (customerData.cardBrand) updateData.cardBrand = customerData.cardBrand;
      if (customerData.cardLastDigits) updateData.cardLastDigits = customerData.cardLastDigits;
      if (customerData.cardholderName) updateData.cardholderName = customerData.cardholderName;
      if (customerData.installments) updateData.installments = customerData.installments;
      if (customerData.dateApproved) updateData.dateApproved = customerData.dateApproved;

      await updateDoc(docRef, updateData);

      console.log(`[SalesService] Pedido ${orderNumber} enriquecido com dados do cliente:`, {
        provider: customerData.gatewayProvider,
        hasName: !!customerData.customerName,
        hasEmail: !!customerData.customerEmail,
        gatewayPaymentId: customerData.gatewayPaymentId,
        cardBrand: customerData.cardBrand,
      });
    } catch (error) {
      // Não propagar — dados do cliente são enriquecimento opcional
      console.warn(`[SalesService] Falha ao enriquecer pedido ${orderNumber} com dados do cliente:`, error);
    }
  }
}

export const salesService = new SalesService();
