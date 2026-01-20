/**
 * ============================================================================
 * Order Stats Component
 * ============================================================================
 * 
 * Cards de estatísticas de pedidos com tendências.
 */

import { OrderStats } from "./types";
import { StatCard } from "@/components/ui/stat-card";
import { 
  ShoppingCart, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  TrendingUp,
} from "lucide-react";

interface OrderStatsCardsProps {
  stats: OrderStats;
  loading?: boolean;
}

export function OrderStatsCards({ stats, loading = false }: OrderStatsCardsProps) {
  // Calculate trends
  const ordersTrend = stats.ordersYesterday 
    ? ((stats.total - stats.ordersYesterday) / stats.ordersYesterday) * 100
    : 0;

  const revenueTrend = stats.revenueYesterday
    ? ((stats.revenue - stats.revenueYesterday) / stats.revenueYesterday) * 100
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        title="Total de Pedidos"
        value={stats.total}
        icon={ShoppingCart}
        color="blue"
        loading={loading}
        trend={stats.ordersYesterday ? {
          value: Math.abs(ordersTrend),
          direction: ordersTrend >= 0 ? 'up' : 'down',
          label: 'vs ontem',
        } : undefined}
      />

      <StatCard
        title="Receita"
        value={`R$ ${stats.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
        icon={DollarSign}
        color="green"
        loading={loading}
        trend={stats.revenueYesterday ? {
          value: Math.abs(revenueTrend),
          direction: revenueTrend >= 0 ? 'up' : 'down',
          label: 'vs ontem',
        } : undefined}
      />

      <StatCard
        title="Ticket Médio"
        value={`R$ ${stats.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
        icon={TrendingUp}
        color="purple"
        loading={loading}
      />

      <StatCard
        title="Pendentes"
        value={stats.pending}
        icon={Clock}
        color="yellow"
        loading={loading}
      />

      <StatCard
        title="Concluídos"
        value={stats.completed}
        icon={CheckCircle}
        color="green"
        loading={loading}
      />
    </div>
  );
}
