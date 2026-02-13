/**
 * ============================================================================
 * Payment Methods Chart Component
 * ============================================================================
 * 
 * Gráfico de pizza com métodos de pagamento.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { CreditCard } from "lucide-react";

interface PaymentMethodData {
  name: string;
  value: number;
  count: number;
}

interface PaymentMethodsChartProps {
  data: PaymentMethodData[];
  loading?: boolean;
}

const COLORS = {
  pix: '#8B5CF6',      // Purple for PIX
  pix_qr: '#8B5CF6',   // Purple for PIX QR
  card: '#3B82F6',     // Blue for Card
  cash: '#10B981',     // Green for Cash
  mercadopago: '#00AEEF', // MP color
  other: '#6B7280',    // Gray for others
};

const LABELS: Record<string, string> = {
  pix: 'PIX',
  pix_qr: 'PIX',
  card: 'Cartão',
  cash: 'Dinheiro',
  mercadopago: 'Mercado Pago',
};

export function PaymentMethodsChart({ data, loading = false }: PaymentMethodsChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Métodos de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Transform data for display
  const chartData = data.map(item => ({
    name: LABELS[item.name] || item.name,
    value: item.value,
    count: item.count,
    percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : '0',
    color: COLORS[item.name as keyof typeof COLORS] || COLORS.other,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Métodos de Pagamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Sem dados de pagamento
          </div>
        ) : (
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Legend */}
            <div className="flex-1 space-y-2">
              {chartData.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{item.percentage}%</span>
                    <span className="text-muted-foreground ml-2">
                      ({item.count})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to generate payment method data from orders
export function generatePaymentMethodData(orders: Array<{
  paymentMethod?: string;
  total?: number;
  paymentStatus?: string;
}>): PaymentMethodData[] {
  const methodMap = new Map<string, { value: number; count: number }>();
  
  orders.forEach(order => {
    if (order.paymentStatus === 'paid' || !order.paymentStatus) {
      const method = order.paymentMethod || 'other';
      const current = methodMap.get(method) || { value: 0, count: 0 };
      current.value += order.total || 0;
      current.count += 1;
      methodMap.set(method, current);
    }
  });
  
  return Array.from(methodMap.entries())
    .map(([name, data]) => ({
      name,
      value: data.value,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value);
}
