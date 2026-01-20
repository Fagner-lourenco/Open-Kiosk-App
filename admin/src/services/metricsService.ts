/**
 * ============================================================================
 * Metrics Service - Serviço de Métricas Materializadas
 * ============================================================================
 * 
 * Fornece acesso às métricas materializadas pelas Cloud Functions.
 * Prioriza leitura de documentos agregados em vez de queries pesadas.
 * 
 * Estrutura de dados:
 * - analytics/daily/{YYYY-MM-DD} - Agregados diários globais
 * - analytics/hourly/{YYYY-MM-DD-HH} - Agregados por hora
 * - franchises/{franchiseId}/stores/{storeId}/metrics/current - Métricas da loja
 * - franchises/{franchiseId}/metrics/current - Métricas da franquia
 * - franchises/{franchiseId}/stores/{storeId}/dailyStats/{date} - Stats diários
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  doc,
  getDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { httpsCallable, getFunctions } from 'firebase/functions';

// ============================================================================
// TIPOS
// ============================================================================

export interface DailyMetrics {
  date: string;
  revenue: number;
  orders: number;
  paidOrders: number;
  cancelledOrders?: number;
  pendingOrders?: number;
  averageTicket: number;
  paymentMethods?: Record<string, { count: number; revenue: number }>;
  lastUpdate?: Date;
}

export interface StoreMetrics {
  storeId: string;
  storeName?: string;
  revenue: number;
  orders: number;
  paidOrders: number;
  averageTicket: number;
  lastUpdate?: Date;
}

export interface HourlyMetrics {
  hour: string; // YYYY-MM-DD-HH
  revenue: number;
  orders: number;
}

export interface MetricsPeriod {
  startDate: Date;
  endDate: Date;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateRange(days: number): MetricsPeriod {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return { startDate, endDate };
}

// ============================================================================
// SERVICE
// ============================================================================

class MetricsService {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private CACHE_TTL_MS = 60 * 1000; // 1 minuto

  /**
   * Verifica se cache é válido
   */
  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.CACHE_TTL_MS;
  }

  /**
   * Obtém métricas diárias de uma data específica
   */
  async getDailyMetrics(date: Date): Promise<DailyMetrics | null> {
    const dateKey = formatDateKey(date);
    const cacheKey = `daily:${dateKey}`;

    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data as DailyMetrics;
    }

    try {
      const docRef = doc(db, `analytics/daily/${dateKey}`);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      const metrics: DailyMetrics = {
        date: dateKey,
        revenue: data.revenue || 0,
        orders: data.orders || 0,
        paidOrders: data.paidOrders || 0,
        cancelledOrders: data.cancelledOrders || 0,
        pendingOrders: data.pendingOrders || 0,
        averageTicket: data.orders > 0 ? data.revenue / data.orders : 0,
        paymentMethods: data.paymentMethods || {},
        lastUpdate: data.lastUpdate?.toDate?.() || null,
      };

      this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error('[MetricsService] Error fetching daily metrics:', error);
      return null;
    }
  }

  /**
   * Obtém métricas de um período (últimos N dias)
   */
  async getMetricsForPeriod(days: number): Promise<DailyMetrics[]> {
    const metrics: DailyMetrics[] = [];
    const { startDate, endDate } = getDateRange(days);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dailyMetrics = await this.getDailyMetrics(new Date(currentDate));
      if (dailyMetrics) {
        metrics.push(dailyMetrics);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return metrics;
  }

  /**
   * Obtém métricas de uma loja específica
   */
  async getStoreMetrics(franchiseId: string, storeId: string): Promise<StoreMetrics | null> {
    const cacheKey = `store:${franchiseId}:${storeId}`;

    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data as StoreMetrics;
    }

    try {
      const metricsRef = doc(
        db,
        `franchises/${franchiseId}/stores/${storeId}/metrics/current`
      );
      const snapshot = await getDoc(metricsRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      const metrics: StoreMetrics = {
        storeId,
        revenue: data.revenue || 0,
        orders: data.orders || 0,
        paidOrders: data.paidOrders || 0,
        averageTicket: data.orders > 0 ? data.revenue / data.orders : 0,
        lastUpdate: data.lastUpdate?.toDate?.() || null,
      };

      this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error('[MetricsService] Error fetching store metrics:', error);
      return null;
    }
  }

  /**
   * Obtém métricas agregadas de uma franquia
   */
  async getFranchiseMetrics(franchiseId: string): Promise<StoreMetrics | null> {
    const cacheKey = `franchise:${franchiseId}`;

    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data as StoreMetrics;
    }

    try {
      const metricsRef = doc(db, `franchises/${franchiseId}/metrics/current`);
      const snapshot = await getDoc(metricsRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      const metrics: StoreMetrics = {
        storeId: 'all',
        storeName: 'Todas as Lojas',
        revenue: data.revenue || 0,
        orders: data.orders || 0,
        paidOrders: data.paidOrders || 0,
        averageTicket: data.orders > 0 ? data.revenue / data.orders : 0,
        lastUpdate: data.lastUpdate?.toDate?.() || null,
      };

      this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
      return metrics;
    } catch (error) {
      console.error('[MetricsService] Error fetching franchise metrics:', error);
      return null;
    }
  }

  /**
   * Obtém estatísticas diárias de uma loja (dailyStats)
   */
  async getStoreDailyStats(
    franchiseId: string,
    storeId: string,
    date: Date
  ): Promise<DailyMetrics | null> {
    const dateKey = formatDateKey(date);

    try {
      const statsRef = doc(
        db,
        `franchises/${franchiseId}/stores/${storeId}/dailyStats/${dateKey}`
      );
      const snapshot = await getDoc(statsRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      return {
        date: dateKey,
        revenue: data.totalRevenue || 0,
        orders: data.totalOrders || 0,
        paidOrders: data.completedOrders || 0,
        cancelledOrders: data.cancelledOrders || 0,
        pendingOrders: data.pendingOrders || 0,
        averageTicket: data.avgTicket || 0,
        paymentMethods: data.paymentMethods || {},
        lastUpdate: data.processedAt?.toDate?.() || null,
      };
    } catch (error) {
      console.error('[MetricsService] Error fetching store daily stats:', error);
      return null;
    }
  }

  /**
   * Subscribe para métricas de loja em tempo real
   */
  subscribeToStoreMetrics(
    franchiseId: string,
    storeId: string,
    callback: (metrics: StoreMetrics | null) => void
  ): Unsubscribe {
    const metricsRef = doc(
      db,
      `franchises/${franchiseId}/stores/${storeId}/metrics/current`
    );

    return onSnapshot(
      metricsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }

        const data = snapshot.data();
        callback({
          storeId,
          revenue: data.revenue || 0,
          orders: data.orders || 0,
          paidOrders: data.paidOrders || 0,
          averageTicket: data.orders > 0 ? data.revenue / data.orders : 0,
          lastUpdate: data.lastUpdate?.toDate?.() || null,
        });
      },
      (error) => {
        console.error('[MetricsService] Subscription error:', error);
        callback(null);
      }
    );
  }

  /**
   * Fallback: busca métricas via Cloud Function (quando permissão falha)
   */
  async getMetricsViaFunction(
    franchiseId: string,
    storeId?: string,
    period?: MetricsPeriod
  ): Promise<DailyMetrics | null> {
    try {
      const functions = getFunctions(undefined, 'southamerica-east1');
      const getMetrics = httpsCallable<
        { franchiseId: string; storeId?: string; startDate?: string; endDate?: string },
        { metrics: DailyMetrics }
      >(functions, 'getMetricsAdmin');

      const result = await getMetrics({
        franchiseId,
        storeId,
        startDate: period?.startDate.toISOString(),
        endDate: period?.endDate.toISOString(),
      });

      return result.data.metrics;
    } catch (error) {
      console.error('[MetricsService] Function call failed:', error);
      return null;
    }
  }

  /**
   * Limpa cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton
export const metricsService = new MetricsService();
export default metricsService;
