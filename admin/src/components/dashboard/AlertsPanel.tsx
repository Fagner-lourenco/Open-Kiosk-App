/**
 * ============================================================================
 * Alerts Panel Component
 * ============================================================================
 * 
 * Painel de alertas e notificações do dashboard.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, 
  AlertTriangle, 
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface Alert {
  id: string;
  type: 'warning' | 'error' | 'success' | 'info';
  title: string;
  description?: string;
  timestamp?: Date;
}

interface AlertsPanelProps {
  alerts: Alert[];
  loading?: boolean;
}

const alertStyles = {
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    iconColor: 'text-yellow-600',
    badge: 'bg-yellow-100 text-yellow-700',
  },
  error: {
    icon: AlertTriangle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    iconColor: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
  },
  success: {
    icon: CheckCircle,
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconColor: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
  },
  info: {
    icon: Bell,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    iconColor: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
};

export function AlertsPanel({ alerts, loading = false }: AlertsPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas
          </span>
          {alerts.length > 0 && (
            <Badge variant="secondary">{alerts.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
            <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
            <span>Nenhum alerta no momento</span>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => {
              const style = alertStyles[alert.type];
              const Icon = style.icon;

              return (
                <div 
                  key={alert.id}
                  className={cn(
                    "p-3 rounded-lg border flex items-start gap-3",
                    style.bg,
                    style.border
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", style.iconColor)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{alert.title}</p>
                    {alert.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {alert.description}
                      </p>
                    )}
                  </div>
                  {alert.timestamp && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {alert.timestamp.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to generate alerts from dashboard data
export function generateAlerts(data: {
  pendingOrders: number;
  lowStockProducts?: string[];
  successRate?: number;
  cancelledOrders?: number;
}): Alert[] {
  const alerts: Alert[] = [];
  
  // Pending orders alert
  if (data.pendingOrders > 3) {
    alerts.push({
      id: 'pending-orders',
      type: 'warning',
      title: `${data.pendingOrders} pedidos pendentes`,
      description: 'Verifique os pedidos aguardando confirmação',
      timestamp: new Date(),
    });
  }
  
  // Low stock alert
  if (data.lowStockProducts && data.lowStockProducts.length > 0) {
    alerts.push({
      id: 'low-stock',
      type: 'error',
      title: `Estoque baixo: ${data.lowStockProducts.length} produtos`,
      description: data.lowStockProducts.slice(0, 3).join(', '),
      timestamp: new Date(),
    });
  }
  
  // Success rate alert
  if (data.successRate !== undefined) {
    if (data.successRate >= 95) {
      alerts.push({
        id: 'success-rate',
        type: 'success',
        title: `Taxa de sucesso: ${data.successRate.toFixed(1)}%`,
        description: 'Excelente performance!',
        timestamp: new Date(),
      });
    } else if (data.successRate < 90) {
      alerts.push({
        id: 'success-rate-low',
        type: 'warning',
        title: `Taxa de sucesso baixa: ${data.successRate.toFixed(1)}%`,
        description: 'Verifique os cancelamentos',
        timestamp: new Date(),
      });
    }
  }
  
  // Cancelled orders
  if (data.cancelledOrders && data.cancelledOrders > 5) {
    alerts.push({
      id: 'cancelled',
      type: 'warning',
      title: `${data.cancelledOrders} pedidos cancelados hoje`,
      description: 'Número acima do normal',
      timestamp: new Date(),
    });
  }
  
  return alerts;
}
