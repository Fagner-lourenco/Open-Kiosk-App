/**
 * ============================================================================
 * Sales by Hour Chart Component
 * ============================================================================
 * 
 * Gráfico de vendas por hora do dia.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Clock } from "lucide-react";

interface HourlyData {
  hour: string;
  orders: number;
  revenue: number;
}

interface SalesByHourChartProps {
  data: HourlyData[];
  loading?: boolean;
}

export function SalesByHourChart({ data, loading = false }: SalesByHourChartProps) {
  // Find peak hour
  const peakHour = data.reduce((max, item) => 
    item.orders > max.orders ? item : max
  , data[0] || { hour: '--', orders: 0 });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Vendas por Hora
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Vendas por Hora
          </span>
          {peakHour && peakHour.orders > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              Pico: {peakHour.hour}h ({peakHour.orders} pedidos)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Sem dados de vendas por hora
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="hour" 
                tickFormatter={(value) => `${value}h`}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  if (name === 'orders') return [`${value} pedidos`, 'Pedidos'];
                  return [`R$ ${value.toFixed(2)}`, 'Receita'];
                }}
                labelFormatter={(label) => `${label}:00h`}
              />
              <Bar 
                dataKey="orders" 
                radius={[4, 4, 0, 0]}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`}
                    fill={entry.hour === peakHour?.hour ? '#3B82F6' : '#93C5FD'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to generate hourly data from orders
export function generateHourlyData(orders: Array<{
  timestamp?: { toDate: () => Date };
  createdAt?: { toDate: () => Date };
  total?: number;
}>): HourlyData[] {
  const hourlyMap = new Map<number, { orders: number; revenue: number }>();
  
  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourlyMap.set(i, { orders: 0, revenue: 0 });
  }
  
  // Aggregate orders by hour
  orders.forEach(order => {
    const timestamp = order.timestamp || order.createdAt;
    if (timestamp?.toDate) {
      const hour = timestamp.toDate().getHours();
      const current = hourlyMap.get(hour)!;
      current.orders += 1;
      current.revenue += order.total || 0;
    }
  });
  
  // Convert to array (only show business hours 8-23)
  return Array.from(hourlyMap.entries())
    .filter(([hour]) => hour >= 8 && hour <= 23)
    .map(([hour, data]) => ({
      hour: hour.toString().padStart(2, '0'),
      orders: data.orders,
      revenue: data.revenue,
    }));
}
