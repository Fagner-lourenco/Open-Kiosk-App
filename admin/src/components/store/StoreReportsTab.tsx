/**
 * ============================================================================
 * Store Reports Tab Component
 * ============================================================================
 * 
 * Componente para exibir relatórios e métricas de uma loja específica.
 * Usa componentes de dashboard e Recharts para visualização de dados.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, getDocs, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath, storeSubPath } from '@/lib/pathResolver';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  BarChart3, 
  Loader2, 
  TrendingUp, 
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  Calendar,
  Download,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { StatCard } from '@/components/ui/stat-card';
import { 
  TopProductsTable, 
  generateTopProducts 
} from '@/components/dashboard/TopProductsTable';
import { 
  PaymentMethodsChart, 
  generatePaymentMethodData 
} from '@/components/dashboard/PaymentMethodsChart';
import { 
  SalesByHourChart, 
  generateHourlyData 
} from '@/components/dashboard/SalesByHourChart';

interface Order {
  id: string;
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  items: Array<{ productId: string; title: string; quantity: number; price: number }>;
  timestamp: Timestamp;
}

interface Product {
  id: string;
  title: string;
  category: string;
  stock?: number;
}

interface StoreReportsTabProps {
  franchiseId: string;
  storeId: string;
}

// Period options
type PeriodOption = '7' | '14' | '30' | '60' | '90';
const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

export function StoreReportsTab({ franchiseId, storeId }: StoreReportsTabProps) {
  const [period, setPeriod] = useState<PeriodOption>('30');
  
  // Calculate date range
  const startDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - parseInt(period));
    return date;
  }, [period]);
  
  // Previous period for comparison
  const previousPeriodStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - (parseInt(period) * 2));
    return date;
  }, [period]);
  
  const previousPeriodEnd = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - parseInt(period));
    return date;
  }, [period]);

  // Current period orders
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['store-orders-reports', franchiseId, storeId, period],
    queryFn: async (): Promise<Order[]> => {
      const path = ordersPath(franchiseId, storeId);
      const pathSegments = path.split('/') as [string, ...string[]];
      const ordersRef = collection(db, ...pathSegments);
      const ordersQuery = query(
        ordersRef,
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(ordersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];
    },
  });

  // Previous period orders (for comparison)
  const { data: previousOrders = [] } = useQuery({
    queryKey: ['store-orders-reports-prev', franchiseId, storeId, period],
    queryFn: async (): Promise<Order[]> => {
      const path = ordersPath(franchiseId, storeId);
      const pathSegments = path.split('/') as [string, ...string[]];
      const ordersRef = collection(db, ...pathSegments);
      const ordersQuery = query(
        ordersRef,
        where('timestamp', '>=', Timestamp.fromDate(previousPeriodStart)),
        where('timestamp', '<', Timestamp.fromDate(previousPeriodEnd)),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(ordersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];
    },
  });

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['store-products', franchiseId, storeId],
    queryFn: async (): Promise<Product[]> => {
      const path = storeSubPath(franchiseId, storeId, 'products');
      const pathSegments = path.split('/') as [string, ...string[]];
      const productsRef = collection(db, ...pathSegments);
      const snapshot = await getDocs(query(productsRef));
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];
    },
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === 'completed' && o.paymentStatus === 'paid');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;
    const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    // Previous period metrics
    const prevCompletedOrders = previousOrders.filter(o => o.status === 'completed' && o.paymentStatus === 'paid');
    const prevRevenue = prevCompletedOrders.reduce((sum, o) => sum + o.total, 0);
    const prevOrders = previousOrders.length;
    const prevAvgTicket = prevCompletedOrders.length > 0 ? prevRevenue / prevCompletedOrders.length : 0;

    // Calculate trends
    const revenueTrend = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ordersTrend = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;
    const ticketTrend = prevAvgTicket > 0 ? ((avgTicket - prevAvgTicket) / prevAvgTicket) * 100 : 0;

    // Revenue by day
    const revenueByDay: Record<string, number> = {};
    completedOrders.forEach(order => {
      const date = order.timestamp.toDate().toISOString().split('T')[0];
      revenueByDay[date] = (revenueByDay[date] || 0) + order.total;
    });

    const revenueData = Object.entries(revenueByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({
        date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        receita: revenue,
      }));

    // Top products using helper
    const topProducts = generateTopProducts(completedOrders as Array<{
      items?: Array<{ title?: string; productName?: string; quantity?: number; price?: number }>;
    }>);

    // Payment methods using helper
    const paymentMethodsData = generatePaymentMethodData(completedOrders as Array<{
      paymentMethod?: string;
      total?: number;
      paymentStatus?: string;
    }>);

    // Hourly data
    const hourlyData = generateHourlyData(orders as Array<{
      timestamp?: { toDate: () => Date };
      createdAt?: { toDate: () => Date };
      total?: number;
    }>);

    // Categories distribution
    const categories: Record<string, number> = {};
    products.forEach(product => {
      const cat = product.category || 'Sem categoria';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    const categoryData = Object.entries(categories).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      totalRevenue,
      totalOrders,
      completedOrders: completedOrders.length,
      avgTicket,
      totalProducts: products.length,
      revenueData,
      topProducts,
      paymentMethodsData,
      hourlyData,
      categoryData,
      // Trends
      revenueTrend,
      ordersTrend,
      ticketTrend,
      // Previous period
      prevRevenue,
      prevOrders,
    };
  }, [orders, products, previousOrders]);

  const isLoading = loadingOrders || loadingProducts;

  // Export to CSV handler
  const handleExportCSV = () => {
    const csvContent = [
      ['Data', 'Receita'].join(','),
      ...metrics.revenueData.map(d => [d.date, d.receita.toFixed(2)].join(',')),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-${storeId}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* KPI Cards with trends */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Receita"
          value={`R$ ${metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="green"
          trend={metrics.prevRevenue > 0 ? {
            value: Math.abs(metrics.revenueTrend),
            direction: metrics.revenueTrend >= 0 ? 'up' : 'down',
            label: 'vs período anterior',
          } : undefined}
        />
        
        <StatCard
          title="Pedidos"
          value={metrics.totalOrders.toString()}
          icon={ShoppingCart}
          color="blue"
          trend={metrics.prevOrders > 0 ? {
            value: Math.abs(metrics.ordersTrend),
            direction: metrics.ordersTrend >= 0 ? 'up' : 'down',
            label: 'vs período anterior',
          } : undefined}
        />

        <StatCard
          title="Ticket Médio"
          value={`R$ ${metrics.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="purple"
          trend={metrics.ticketTrend !== 0 ? {
            value: Math.abs(metrics.ticketTrend),
            direction: metrics.ticketTrend >= 0 ? 'up' : 'down',
            label: 'vs período anterior',
          } : undefined}
        />

        <StatCard
          title="Produtos"
          value={metrics.totalProducts.toString()}
          icon={Package}
          color="yellow"
        />

        <StatCard
          title="Concluídos"
          value={metrics.completedOrders.toString()}
          icon={Users}
          color="green"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Receita por Dia
            </CardTitle>
            <CardDescription>
              {PERIOD_OPTIONS.find(p => p.value === period)?.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="receita" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                Sem dados de vendas no período
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales by Hour */}
        <SalesByHourChart data={metrics.hourlyData} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <PaymentMethodsChart data={metrics.paymentMethodsData} />
        
        {/* Top Products */}
        <TopProductsTable products={metrics.topProducts} limit={5} />
      </div>

      {/* Full Top Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos Mais Vendidos</CardTitle>
          <CardDescription>Top 10 por receita no período</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.topProducts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.topProducts.slice(0, 10).map((product, idx) => (
                  <TableRow key={`${product.name}-${idx}`}>
                    <TableCell>
                      <Badge variant={idx < 3 ? 'default' : 'secondary'}>
                        {idx + 1}º
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">{product.quantity}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      R$ {product.revenue.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-gray-400">
              Nenhuma venda registrada no período
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Categoria</CardTitle>
          <CardDescription>Quantidade de produtos por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={metrics.categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              Nenhum produto cadastrado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
