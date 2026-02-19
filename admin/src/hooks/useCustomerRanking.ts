/**
 * ============================================================================
 * useCustomerRanking — Hook para ranking de clientes em tempo real
 * ============================================================================
 *
 * Modo híbrido:
 * - Se dateTo é "hoje": onSnapshot para real-time
 * - Se dateTo é data passada: getDocs + react-query
 *
 * Agrega dados client-side: agrupa por customerName, soma mL, conta pedidos,
 * determina bebida favorita. Retorna RankingEntry[] ordenado pela métrica.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import type {
  RankingEntry,
  RankingFilters,
  FirestoreOrder,
} from '@/types/ranking';

/** Resultado retornado pelo hook */
export interface UseCustomerRankingReturn {
  ranking: RankingEntry[];
  isLoading: boolean;
  error: string | null;
  isRealTime: boolean;
  totalOrders: number;
  lastUpdated: Date | null;
}

/**
 * Verifica se a data informada é hoje (BRT — UTC-3)
 */
function isToday(dateStr: string): boolean {
  const d = new Date();
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const yyyy = brt.getUTCFullYear();
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  return dateStr === `${yyyy}-${mm}-${dd}`;
}

/**
 * Formata a data como YYYY-MM-DD em BRT (UTC-3)
 */
export function formatDateYMD(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const yyyy = brt.getUTCFullYear();
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Agrega orders em ranking entries
 */
function aggregateRanking(
  orders: FirestoreOrder[],
  metric: RankingFilters['metric'],
  limit: number
): RankingEntry[] {
  const byCustomer = new Map<string, {
    customerName: string;
    customerIdentification?: string;
    totalMl: number;
    totalSpent: number;
    orderCount: number;
    lastOrderAt: Date;
    drinkBreakdown: Record<string, number>;
  }>();

  for (const order of orders) {
    // Só incluir no ranking pedidos com nome REAL do pagador.
    // Pedidos sem customerName/cardholderName são vendas anônimas — não entram no ranking.
    const effectiveCustomerName = order.customerName 
      || order.cardholderName as string | undefined;
    if (!effectiveCustomerName) continue;
    // Apenas pedidos completados (paid ou completed) — excluir cancelados/reembolsados
    if (order.status !== 'paid_pending_dispense' && order.status !== 'completed' && order.status !== 'dispensing') continue;
    // Excluir pedidos cancelados/reembolsados via paymentStatus
    if (order.paymentStatus === 'cancelled' || order.paymentStatus === 'refunded') continue;

    const key = order.customerIdentification
      ? String(order.customerIdentification).replace(/\D/g, '') || effectiveCustomerName.toUpperCase().trim().replace(/\s+/g, '_')
      : effectiveCustomerName.toUpperCase().trim().replace(/\s+/g, '_');
    let entry = byCustomer.get(key);

    if (!entry) {
      entry = {
        customerName: effectiveCustomerName,
        customerIdentification: order.customerIdentification,
        totalMl: 0,
        totalSpent: 0,
        orderCount: 0,
        lastOrderAt: new Date(0),
        drinkBreakdown: {},
      };
      byCustomer.set(key, entry);
    }

    entry.orderCount++;
    entry.totalSpent += order.total || 0;

    // Timestamp
    const orderDate = order.timestamp?.toDate?.() || new Date(order.date);
    if (orderDate > entry.lastOrderAt) {
      entry.lastOrderAt = orderDate;
      // Usar o nome mais recente (pode ter variações de acentuação)
      entry.customerName = effectiveCustomerName;
    }

    // Somar mL e breakdown por bebida
    for (const item of (order.items || [])) {
      if (item.mlPerUnit && item.mlPerUnit > 0) {
        const ml = item.mlPerUnit * item.quantity;
        entry.totalMl += ml;
        const drinkName = item.title?.split(' - ')[0]?.trim() || item.title || 'Desconhecido';
        entry.drinkBreakdown[drinkName] = (entry.drinkBreakdown[drinkName] || 0) + ml;
      }
    }
  }

  // Converter para array e determinar bebida favorita
  const entries: RankingEntry[] = Array.from(byCustomer.values()).map((e) => {
    const favoriteDrink = Object.entries(e.drinkBreakdown)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    return { ...e, favoriteDrink };
  });

  // Ordenar pela métrica e aplicar limite
  entries.sort((a, b) => b[metric] - a[metric]);

  return entries.slice(0, limit).map((entry, idx) => ({
    ...entry,
    position: idx + 1,
  }));
}

/**
 * Hook para ranking de clientes.
 */
export function useCustomerRanking(
  franchiseId: string | undefined,
  filters: RankingFilters
): UseCustomerRankingReturn {
  const [orders, setOrders] = useState<FirestoreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  const isRealTime = isToday(filters.dateTo);

  // Cleanup on unmount or filter change
  const cleanup = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!franchiseId || !filters.storeId) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    const path = ordersPath(franchiseId, filters.storeId);
    const pathSegments = path.split('/');
    const colRef = collection(db, pathSegments[0], ...pathSegments.slice(1));

    const q = query(
      colRef,
      where('date', '>=', filters.dateFrom),
      where('date', '<=', filters.dateTo),
      orderBy('date', 'desc')
    );

    setIsLoading(true);
    setError(null);
    cleanup();

    if (isRealTime) {
      // Real-time via onSnapshot
      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((d) => ({
            ...d.data(),
            orderNumber: d.id,
          })) as FirestoreOrder[];
          setOrders(docs);
          setIsLoading(false);
          setLastUpdated(new Date());
        },
        (err) => {
          console.error('[useCustomerRanking] onSnapshot error:', err);
          setError('Erro ao carregar dados em tempo real');
          setIsLoading(false);
        }
      );
    } else {
      // One-shot query
      getDocs(q)
        .then((snapshot) => {
          const docs = snapshot.docs.map((d) => ({
            ...d.data(),
            orderNumber: d.id,
          })) as FirestoreOrder[];
          setOrders(docs);
          setLastUpdated(new Date());
        })
        .catch((err) => {
          console.error('[useCustomerRanking] getDocs error:', err);
          setError('Erro ao carregar dados');
        })
        .finally(() => setIsLoading(false));
    }

    return cleanup;
  }, [franchiseId, filters.storeId, filters.dateFrom, filters.dateTo, isRealTime, cleanup]);

  // Agregar ranking
  const ranking = useMemo(
    () => aggregateRanking(orders, filters.metric, filters.limit),
    [orders, filters.metric, filters.limit]
  );

  const totalOrders = useMemo(
    () => orders.filter((o) => (o.customerName || o.cardholderName) && ['completed', 'paid_pending_dispense', 'dispensing'].includes(o.status)).length,
    [orders]
  );

  return {
    ranking,
    isLoading,
    error,
    isRealTime,
    totalOrders,
    lastUpdated,
  };
}
