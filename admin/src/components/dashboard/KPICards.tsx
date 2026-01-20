/**
 * ============================================================================
 * KPI Cards Component
 * ============================================================================
 * 
 * Cards de KPIs para o dashboard com indicadores de tendência.
 */

import { StatCard } from "@/components/ui/stat-card";
import { 
  ShoppingCart, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle,
  Users,
} from "lucide-react";

export interface DashboardKPIs {
  // Orders
  ordersToday: number;
  ordersYesterday: number;
  
  // Revenue
  revenueToday: number;
  revenueYesterday: number;
  
  // Ticket
  avgTicket: number;
  avgTicketYesterday: number;
  
  // Status
  pendingOrders: number;
  completedOrders: number;
  
  // Customers
  uniqueCustomers?: number;
}

interface KPICardsProps {
  kpis: DashboardKPIs;
  loading?: boolean;
}

export function KPICards({ kpis, loading = false }: KPICardsProps) {
  // Calculate trends
  const ordersTrend = kpis.ordersYesterday > 0
    ? ((kpis.ordersToday - kpis.ordersYesterday) / kpis.ordersYesterday) * 100
    : 0;

  const revenueTrend = kpis.revenueYesterday > 0
    ? ((kpis.revenueToday - kpis.revenueYesterday) / kpis.revenueYesterday) * 100
    : 0;

  const ticketTrend = kpis.avgTicketYesterday > 0
    ? ((kpis.avgTicket - kpis.avgTicketYesterday) / kpis.avgTicketYesterday) * 100
    : 0;

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        title="Pedidos Hoje"
        value={kpis.ordersToday}
        icon={ShoppingCart}
        color="blue"
        loading={loading}
        trend={kpis.ordersYesterday > 0 ? {
          value: Math.abs(ordersTrend),
          direction: ordersTrend >= 0 ? 'up' : 'down',
          label: 'vs ontem',
        } : undefined}
      />

      <StatCard
        title="Receita Hoje"
        value={formatCurrency(kpis.revenueToday)}
        icon={DollarSign}
        color="green"
        loading={loading}
        trend={kpis.revenueYesterday > 0 ? {
          value: Math.abs(revenueTrend),
          direction: revenueTrend >= 0 ? 'up' : 'down',
          label: 'vs ontem',
        } : undefined}
      />

      <StatCard
        title="Ticket Médio"
        value={formatCurrency(kpis.avgTicket)}
        icon={TrendingUp}
        color="purple"
        loading={loading}
        trend={kpis.avgTicketYesterday > 0 ? {
          value: Math.abs(ticketTrend),
          direction: ticketTrend >= 0 ? 'up' : 'down',
          label: 'vs ontem',
        } : undefined}
      />

      <StatCard
        title="Pendentes"
        value={kpis.pendingOrders}
        icon={Clock}
        color={kpis.pendingOrders > 5 ? 'red' : 'yellow'}
        loading={loading}
      />

      <StatCard
        title="Concluídos"
        value={kpis.completedOrders}
        icon={CheckCircle}
        color="green"
        loading={loading}
      />

      {kpis.uniqueCustomers !== undefined && (
        <StatCard
          title="Clientes Únicos"
          value={kpis.uniqueCustomers}
          icon={Users}
          color="default"
          loading={loading}
        />
      )}
    </div>
  );
}
