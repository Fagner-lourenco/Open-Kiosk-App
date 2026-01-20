/**
 * ============================================================================
 * Report Types
 * ============================================================================
 */

/**
 * Período de relatório
 */
export type ReportPeriod = '7days' | '30days' | '90days' | '1year' | 'custom';

/**
 * Filtros de relatório
 */
export interface ReportFilters {
  period: ReportPeriod;
  startDate?: Date;
  endDate?: Date;
  storeId?: string;
  productId?: string;
  operatorId?: string;
}

/**
 * KPIs de vendas
 */
export interface SalesKPIs {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  uniqueCustomers: number;
  revenueChange?: number;
  ordersChange?: number;
}

/**
 * Dados de vendas por período
 */
export interface SalesByPeriod {
  date: string;
  orders: number;
  revenue: number;
}

/**
 * Relatório de vendas
 */
export interface SalesReport {
  kpis: SalesKPIs;
  salesByDay: SalesByPeriod[];
  topProducts: ProductSalesData[];
  salesByStore?: StoreSalesData[];
  salesByOperator?: OperatorSalesData[];
}

/**
 * Dados de vendas por produto
 */
export interface ProductSalesData {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  percentageOfTotal: number;
}

/**
 * Dados de vendas por loja
 */
export interface StoreSalesData {
  storeId: string;
  storeName: string;
  orders: number;
  revenue: number;
  averageOrderValue: number;
}

/**
 * Dados de vendas por operador
 */
export interface OperatorSalesData {
  operatorId: string;
  operatorName: string;
  orders: number;
  revenue: number;
}

/**
 * Relatório de produtos
 */
export interface ProductsReport {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  topSelling: ProductSalesData[];
  lowStock: LowStockProduct[];
}

/**
 * Produto com estoque baixo
 */
export interface LowStockProduct {
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  storeId: string;
  storeName: string;
}

/**
 * Relatório de estoque
 */
export interface InventoryReport {
  totalValue: number;
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  byCategory: CategoryInventory[];
}

/**
 * Inventário por categoria
 */
export interface CategoryInventory {
  category: string;
  itemCount: number;
  totalValue: number;
  lowStockCount: number;
}

/**
 * Opções de exportação
 */
export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'pdf';
  includeCharts?: boolean;
  dateRange?: { start: Date; end: Date };
}
