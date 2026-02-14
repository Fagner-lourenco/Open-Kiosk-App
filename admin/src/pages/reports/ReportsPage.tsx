/**
 * ============================================================================
 * ReportsPage - Relatórios Aprimorados
 * ============================================================================
 * 
 * Melhorado com gráficos Recharts para melhor visualização
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart,
  Users,
  Store,
  Download,
  Calendar,
  Loader2,
  Package,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { CHART_PRIMARY, CHART_SECONDARY, getChartColor } from '@/constants/chart-colors';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface OrderData {
  id: string;
  total: number;
  timestamp: Timestamp;
  customerId?: string;
  items?: Array<{ productId: string; productName: string; quantity: number; price: number }>;
  storeId?: string;
}

interface DayData {
  label: string;
  revenue: number;
  orders: number;
}

interface ProductSales {
  name: string;
  quantity: number;
}

interface StoreStats {
  storeId: string;
  storeName: string;
  revenue: number;
  orders: number;
}

export function ReportsPage() {
  const { currentFranchise, stores } = useFranchise();
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30days');
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = () => {
    if (!reportData || !currentFranchise) return;
    
    setIsExporting(true);
    
    // Create CSV content
    const headers = ['Métrica', 'Valor'];
    const rows = [
      ['Receita Total', `R$ ${reportData.totalRevenue.toFixed(2)}`],
      ['Total de Pedidos', reportData.totalOrders.toString()],
      ['Ticket Médio', `R$ ${reportData.averageOrderValue.toFixed(2)}`],
      ['Clientes Únicos', reportData.uniqueCustomers.toString()],
      ['Período', dateRange === '7days' ? '7 dias' : dateRange === '30days' ? '30 dias' : dateRange === '90days' ? '90 dias' : '1 ano'],
      ['Loja', selectedStore === 'all' ? 'Todas' : stores.find(s => s.id === selectedStore)?.name || selectedStore],
      ['Data de Exportação', new Date().toLocaleString('pt-BR')],
    ];
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio-${currentFranchise.name}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsExporting(false);
  };

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['reports', currentFranchise?.id, selectedStore, dateRange],
    queryFn: async () => {
      if (!currentFranchise) return null;
      
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch (dateRange) {
        case '7days':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(now.getDate() - 90);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      // Aggregate data from stores
      let totalRevenue = 0;
      let totalOrders = 0;
      const uniqueCustomers = new Set<string>();
      const allOrders: OrderData[] = [];
      const storeStatsMap = new Map<string, StoreStats>();
      const productSalesMap = new Map<string, ProductSales>();
      
      const storesToQuery = selectedStore === 'all' 
        ? stores 
        : stores.filter(s => s.id === selectedStore);
      
      // Initialize store stats
      for (const store of storesToQuery) {
        storeStatsMap.set(store.id, {
          storeId: store.id,
          storeName: store.name,
          revenue: 0,
          orders: 0,
        });
      }
      
      for (const store of storesToQuery) {
        try {
          const ordersCollectionPath = ordersPath(currentFranchise.id, store.id);
          const pathSegments = ordersCollectionPath.split('/') as [string, ...string[]];
          const ordersSnapshot = await getDocs(
            query(
              collection(db, ...pathSegments),
              orderBy('timestamp', 'desc'),
              limit(1000)
            )
          );
          
          ordersSnapshot.docs.forEach(doc => {
            const order = doc.data() as OrderData;
            const orderDate = order.timestamp?.toDate?.() || new Date(order.timestamp as unknown as string);
            
            if (orderDate && orderDate >= startDate) {
              totalOrders++;
              totalRevenue += order.total || 0;
              if (order.customerId) {
                uniqueCustomers.add(order.customerId);
              }
              
              // Add to allOrders for chart aggregation
              allOrders.push({
                ...order,
                id: doc.id,
                storeId: store.id,
              });
              
              // Update store stats
              const storeStats = storeStatsMap.get(store.id);
              if (storeStats) {
                storeStats.revenue += order.total || 0;
                storeStats.orders += 1;
              }
              
              // Aggregate product sales
              if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                  const productName = item.productName || item.productId || 'Produto';
                  const existing = productSalesMap.get(productName);
                  if (existing) {
                    existing.quantity += item.quantity || 1;
                  } else {
                    productSalesMap.set(productName, {
                      name: productName,
                      quantity: item.quantity || 1,
                    });
                  }
                });
              }
            }
          });
        } catch (err) {
          console.error(`Error fetching orders for store ${store.id}:`, err);
        }
      }
      
      // Convert maps to arrays
      const storeStats = Array.from(storeStatsMap.values()).sort((a, b) => b.revenue - a.revenue);
      const topProducts = Array.from(productSalesMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
      
      return {
        totalRevenue,
        totalOrders,
        uniqueCustomers: uniqueCustomers.size,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        allOrders,
        storeStats,
        topProducts,
        startDate,
      };
    },
    enabled: !!currentFranchise,
    staleTime: 5 * 60 * 1000,
  });

  // Aggregate orders by day of week for charts
  const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  
  const revenueByDay = useMemo<DayData[]>(() => {
    if (!reportData?.allOrders) {
      return dayLabels.map(label => ({ label, revenue: 0, orders: 0 }));
    }
    
    const dayData: Record<number, { revenue: number; orders: number }> = {};
    for (let i = 0; i < 7; i++) {
      dayData[i] = { revenue: 0, orders: 0 };
    }
    
    reportData.allOrders.forEach(order => {
      const orderDate = order.timestamp?.toDate?.() || new Date(order.timestamp as unknown as string);
      if (orderDate) {
        const dayOfWeek = orderDate.getDay();
        dayData[dayOfWeek].revenue += order.total || 0;
        dayData[dayOfWeek].orders += 1;
      }
    });
    
    return dayLabels.map((label, index) => ({
      label,
      revenue: dayData[index].revenue,
      orders: dayData[index].orders,
    }));
  }, [reportData?.allOrders]);

  if (!currentFranchise) {
    return <NoFranchiseSelected description="Selecione uma franquia no menu lateral para ver relatórios" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={`Análise de desempenho de ${currentFranchise.name}`}
        actions={
          <Button 
            variant="outline" 
            onClick={exportToCSV}
            disabled={isExporting || isLoading || !reportData}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Últimos 7 dias</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
              <SelectItem value="90days">Últimos 90 dias</SelectItem>
              <SelectItem value="year">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Receita Total</p>
                    <p className="text-2xl font-bold mt-1">
                      R$ {reportData?.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-green-100">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total de Pedidos</p>
                    <p className="text-2xl font-bold mt-1">
                      {reportData?.totalOrders || 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-blue-100">
                    <ShoppingCart className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Ticket Médio</p>
                    <p className="text-2xl font-bold mt-1">
                      R$ {reportData?.averageOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-purple-100">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Clientes Únicos</p>
                    <p className="text-2xl font-bold mt-1">
                      {reportData?.uniqueCustomers || 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-orange-100">
                    <Users className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <Tabs defaultValue="revenue">
            <TabsList>
              <TabsTrigger value="revenue">Receita</TabsTrigger>
              <TabsTrigger value="orders">Pedidos</TabsTrigger>
              <TabsTrigger value="products">Produtos</TabsTrigger>
              <TabsTrigger value="stores">Por Loja</TabsTrigger>
            </TabsList>

            <TabsContent value="revenue" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Tendência de Receita
                    </CardTitle>
                    <CardDescription>
                      Evolução da receita por dia da semana
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis tickFormatter={(value) => `R$${value}`} />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                          labelStyle={{ fontWeight: 'bold' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke={CHART_PRIMARY} 
                          strokeWidth={2}
                          dot={{ fill: CHART_PRIMARY }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Receita por Dia
                    </CardTitle>
                    <CardDescription>
                      Distribuição da receita no período selecionado
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis tickFormatter={(value) => `R$${value}`} />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                        />
                        <Bar dataKey="revenue" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="orders" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      Pedidos por Dia
                    </CardTitle>
                    <CardDescription>
                      Quantidade de pedidos realizados por dia
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => [value, 'Pedidos']}
                        />
                        <Bar dataKey="orders" fill={CHART_SECONDARY} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Receita vs Pedidos
                    </CardTitle>
                    <CardDescription>
                      Comparativo entre receita e quantidade de pedidos
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis yAxisId="left" tickFormatter={(value) => `R$${value}`} />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="revenue" 
                          stroke={CHART_PRIMARY} 
                          strokeWidth={2}
                          name="Receita (R$)"
                        />
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="orders" 
                          stroke={CHART_SECONDARY} 
                          strokeWidth={2}
                          name="Pedidos"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="products" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Produtos Mais Vendidos
                    </CardTitle>
                    <CardDescription>
                      Ranking dos produtos com maior volume de vendas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reportData?.topProducts && reportData.topProducts.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={reportData.topProducts} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            formatter={(value: number) => [value, 'Vendas']}
                          />
                          <Bar dataKey="quantity" fill={CHART_SECONDARY} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12">
                        <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Nenhum produto vendido no período</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5" />
                      Distribuição de Vendas
                    </CardTitle>
                    <CardDescription>
                      Participação de cada produto nas vendas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reportData?.topProducts && reportData.topProducts.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={reportData.topProducts}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name.substring(0, 10)}${name.length > 10 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill={CHART_PRIMARY}
                            dataKey="quantity"
                          >
                            {reportData.topProducts.map((_, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={getChartColor(index)} 
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [value, 'Vendas']} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12">
                        <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Nenhum produto vendido no período</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Lista detalhada de produtos */}
              {reportData?.topProducts && reportData.topProducts.length > 0 && (
                <div className="grid gap-4 mt-6">
                  {reportData.topProducts.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div 
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                              style={{ backgroundColor: getChartColor(index) }}
                            >
                              {index + 1}
                            </div>
                            <div>
                              <h4 className="font-semibold">{item.name}</h4>
                              <p className="text-sm text-muted-foreground">Produto #{index + 1} em vendas</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-green-600">
                              {item.quantity} vendas
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="stores" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Receita por Loja
                    </CardTitle>
                    <CardDescription>
                      Comparativo de receita entre lojas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reportData?.storeStats && reportData.storeStats.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={reportData.storeStats}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="storeName" />
                          <YAxis tickFormatter={(value) => `R$${value}`} />
                          <Tooltip 
                            formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                          />
                          <Bar dataKey="revenue" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12">
                        <Store className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Nenhuma loja cadastrada</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5" />
                      Distribuição por Loja
                    </CardTitle>
                    <CardDescription>
                      Participação de cada loja na receita total
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reportData?.storeStats && reportData.storeStats.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={reportData.storeStats}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ storeName, percent }) => `${storeName} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill={CHART_PRIMARY}
                            dataKey="revenue"
                          >
                            {reportData.storeStats.map((_, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={getChartColor(index)} 
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12">
                        <Store className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Nenhuma loja cadastrada</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Lista detalhada de lojas */}
              {reportData?.storeStats && reportData.storeStats.length > 0 && (
                <div className="space-y-4 mt-6">
                  {reportData.storeStats.map((store, index) => (
                    <Card 
                      key={store.storeId}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div 
                              className="w-12 h-12 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: getChartColor(index) + '20' }}
                            >
                              <Store 
                                className="h-6 w-6" 
                                style={{ color: getChartColor(index) }} 
                              />
                            </div>
                            <div>
                              <h4 className="font-semibold">{store.storeName}</h4>
                              <p className="text-sm text-muted-foreground">{store.orders} pedidos realizados</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-600">
                              R$ {store.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Ticket médio: R$ {store.orders > 0 ? (store.revenue / store.orders).toFixed(2) : '0,00'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
