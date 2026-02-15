/**
 * ============================================================================
 * Ranking Types — Tipos para o leaderboard de clientes
 * ============================================================================
 */

/** Entrada individual no ranking de consumo */
export interface RankingEntry {
  /** Chave de agrupamento (nome do cliente) */
  customerName: string;
  /** CPF/CNPJ para deduplicação (se disponível) */
  customerIdentification?: string;
  /** Total de mL consumidos */
  totalMl: number;
  /** Total gasto (R$) */
  totalSpent: number;
  /** Quantidade de pedidos */
  orderCount: number;
  /** Bebida com mais mL consumidos */
  favoriteDrink: string;
  /** Último pedido */
  lastOrderAt?: Date;
  /** Breakdown mL por tipo de bebida */
  drinkBreakdown: Record<string, number>;
  /** Posição no ranking (calculada) */
  position?: number;
}

/** Filtros para consulta de ranking */
export interface RankingFilters {
  storeId: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  metric: 'totalMl' | 'totalSpent' | 'orderCount';
  limit: number;    // top N
}

/** Métricas disponíveis para ordenação */
export const RANKING_METRICS = [
  { value: 'totalMl' as const, label: 'mL Consumidos', icon: '🍺' },
  { value: 'totalSpent' as const, label: 'Valor Gasto (R$)', icon: '💰' },
  { value: 'orderCount' as const, label: 'Nº de Pedidos', icon: '📦' },
] as const;

/** Item de pedido com dados de drink (conforme gravado no Firestore) */
export interface OrderItem {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  total: number;
  sizeKey?: string;
  sizeLabel?: string;
  mlPerUnit?: number;
}

/** Documento de order conforme gravado no Firestore */
export interface FirestoreOrder {
  orderNumber: string;
  customerName?: string;
  customerEmail?: string;
  customerIdentification?: string;
  paymentMethod: string;
  date: string; // YYYY-MM-DD
  timestamp: any;
  total: number;
  items: OrderItem[];
  status: string;
  dispenseStatus?: string;
}
