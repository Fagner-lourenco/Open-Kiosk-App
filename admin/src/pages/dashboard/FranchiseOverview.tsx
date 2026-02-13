/**
 * ============================================================================
 * FranchiseOverview - Resumo da Franquia
 * ============================================================================
 * 
 * Componente de visão geral para o dashboard principal.
 * Mostra métricas consolidadas de todas as lojas.
 */

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import { useFranchise } from '@/context/FranchiseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { AlertsPanel, generateAlerts } from '@/components/dashboard/AlertsPanel';
import { Timeline, TimelineEvent } from '@/components/ui/timeline';
import { 
  Store, 
  Users, 
  DollarSign,
  ShoppingCart,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface FranchiseMetrics {
  // Lojas
  totalStores: number;
  activeStores: number;
  inactiveStores: number;
  
  // Usuários
  totalUsers: number;
  usersByRole: Record<string, number>;
  
  // Vendas (hoje)
  todayRevenue: number;
  todayOrders: number;
  todayAvgTicket: number;
  
  // Vendas (mês)
  monthRevenue: number;
  monthOrders: number;
  monthGrowth: number;
  
  // Alertas
  alerts: Array<{
    id: string;
    type: 'warning' | 'error' | 'info';
    message: string;
    storeName?: string;
  }>;
  
  // Últimas atividades
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: Date;
    storeName: string;
  }>;
}

interface FranchiseOverviewProps {
  compact?: boolean;
}

export function FranchiseOverview({ compact = false }: FranchiseOverviewProps) {
  const { currentFranchise } = useFranchise();
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['franchise-overview', currentFranchise?.id],
    queryFn: async (): Promise<FranchiseMetrics> => {
      if (!currentFranchise) {
        return getEmptyMetrics();
      }
      
      const franchiseId = currentFranchise.id;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      
      // Busca lojas
      const storesSnapshot = await getDocs(
        collection(db, `franchises/${franchiseId}/stores`)
      );
      
      interface StoreData {
        id: string;
        name?: string;
        isActive?: boolean;
        [key: string]: unknown;
      }
      
      const storesList: StoreData[] = storesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as StoreData[];
      
      const activeStores = storesList.filter(s => s.isActive !== false);
      const inactiveStores = storesList.filter(s => s.isActive === false);
      
      // Busca usuários via subcollection members (compatível com rules)
      const membersSnapshot = await getDocs(
        collection(db, `franchises/${franchiseId}/members`)
      );
      
      const usersByRole: Record<string, number> = {};
      membersSnapshot.docs.forEach(doc => {
        const role = doc.data().role || 'viewer';
        usersByRole[role] = (usersByRole[role] || 0) + 1;
      });
      
      // Busca pedidos de todas as lojas
      let todayRevenue = 0;
      let todayOrders = 0;
      let monthRevenue = 0;
      let monthOrders = 0;
      let lastMonthRevenue = 0;
      const recentActivity: FranchiseMetrics['recentActivity'] = [];
      const alerts: FranchiseMetrics['alerts'] = [];
      
      for (const store of storesList) {
        // Preparar path da collection de orders uma vez para reusar
        const ordersCollectionPath = ordersPath(franchiseId, store.id);
        const pathSegments = ordersCollectionPath.split('/') as [string, ...string[]];
        
        // Pedidos de hoje
        try {
          const todayOrdersQuery = await getDocs(
            query(
              collection(db, ...pathSegments),
              where('timestamp', '>=', Timestamp.fromDate(startOfToday)),
              orderBy('timestamp', 'desc')
            )
          );
          
          todayOrdersQuery.docs.forEach(doc => {
            const order = doc.data();
            todayOrders++;
            todayRevenue += order.total || 0;
            
            // Adiciona às atividades recentes
            if (recentActivity.length < 10) {
              recentActivity.push({
                id: doc.id,
                type: 'order',
                description: `Pedido #${doc.id.slice(-6)} - ${formatCurrency(order.total || 0)}`,
                timestamp: order.timestamp?.toDate() || new Date(),
                storeName: store.name || store.id,
              });
            }
          });
        } catch {
          // Pode não ter index, ignora
        }
        
        // Pedidos do mês
        try {
          const monthOrdersQuery = await getDocs(
            query(
              collection(db, ...pathSegments),
              where('timestamp', '>=', Timestamp.fromDate(startOfMonth))
            )
          );
          
          monthOrdersQuery.docs.forEach(doc => {
            const order = doc.data();
            monthOrders++;
            monthRevenue += order.total || 0;
          });
        } catch {
          // Ignora
        }
        
        // Pedidos do mês passado (para calcular crescimento)
        try {
          const lastMonthQuery = await getDocs(
            query(
              collection(db, ...pathSegments),
              where('timestamp', '>=', Timestamp.fromDate(startOfLastMonth)),
              where('timestamp', '<=', Timestamp.fromDate(endOfLastMonth))
            )
          );
          
          lastMonthQuery.docs.forEach(doc => {
            const order = doc.data();
            lastMonthRevenue += order.total || 0;
          });
        } catch {
          // Ignora
        }
        
        // Verifica alertas da loja
        if (store.isActive === false) {
          alerts.push({
            id: `inactive-${store.id}`,
            type: 'warning',
            message: 'Loja inativa',
            storeName: store.name || store.id,
          });
        }
      }
      
      // Calcula crescimento
      const monthGrowth = lastMonthRevenue > 0 
        ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
        : 0;
      
      // Ticket médio
      const todayAvgTicket = todayOrders > 0 ? todayRevenue / todayOrders : 0;
      
      // Ordena atividades recentes
      recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      return {
        totalStores: storesList.length,
        activeStores: activeStores.length,
        inactiveStores: inactiveStores.length,
        totalUsers: membersSnapshot.size,
        usersByRole,
        todayRevenue,
        todayOrders,
        todayAvgTicket,
        monthRevenue,
        monthOrders,
        monthGrowth,
        alerts,
        recentActivity,
      };
    },
    enabled: !!currentFranchise,
    staleTime: 60000, // 1 minuto
  });
  
  if (isLoading) {
    return <OverviewSkeleton compact={compact} />;
  }
  
  if (!metrics) {
    return null;
  }
  
  if (compact) {
    return <CompactOverview metrics={metrics} />;
  }
  
  return <FullOverview metrics={metrics} />;
}

function CompactOverview({ metrics }: { metrics: FranchiseMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        title="Receita Hoje"
        value={formatCurrency(metrics.todayRevenue)}
        icon={DollarSign}
        color="green"
      />
      <StatCard
        title="Pedidos Hoje"
        value={metrics.todayOrders.toString()}
        icon={ShoppingCart}
        color="blue"
      />
      <StatCard
        title="Lojas Ativas"
        value={`${metrics.activeStores}/${metrics.totalStores}`}
        icon={Store}
        color="purple"
      />
      <StatCard
        title="Usuários"
        value={metrics.totalUsers.toString()}
        icon={Users}
        color="yellow"
      />
    </div>
  );
}

function FullOverview({ metrics }: { metrics: FranchiseMetrics }) {
  // Convert alerts to the new format
  const dashboardAlerts = generateAlerts({
    pendingOrders: 0, // We don't have this in franchise overview
    cancelledOrders: 0,
  });
  
  // Add store-specific alerts
  metrics.alerts.forEach(alert => {
    dashboardAlerts.push({
      id: alert.id,
      type: alert.type === 'error' ? 'error' : alert.type === 'warning' ? 'warning' : 'info',
      title: alert.message,
      description: alert.storeName,
      timestamp: new Date(),
    });
  });

  // Convert recent activity to timeline events
  const timelineEvents: TimelineEvent[] = metrics.recentActivity.slice(0, 5).map(activity => ({
    id: activity.id,
    title: activity.description,
    description: activity.storeName,
    timestamp: activity.timestamp,
    color: 'blue',
  }));

  return (
    <div className="space-y-6">
      {/* Alertas usando AlertsPanel */}
      {dashboardAlerts.length > 0 && (
        <AlertsPanel alerts={dashboardAlerts} />
      )}
      
      {/* Métricas principais com StatCard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Receita Hoje"
          value={formatCurrency(metrics.todayRevenue)}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Pedidos Hoje"
          value={metrics.todayOrders.toString()}
          icon={ShoppingCart}
          color="blue"
        />
        <StatCard
          title="Receita do Mês"
          value={formatCurrency(metrics.monthRevenue)}
          icon={Zap}
          color="purple"
          trend={metrics.monthGrowth !== 0 ? {
            value: Math.abs(metrics.monthGrowth),
            direction: metrics.monthGrowth >= 0 ? 'up' : 'down',
            label: 'vs mês anterior',
          } : undefined}
        />
        <StatCard
          title="Pedidos do Mês"
          value={metrics.monthOrders.toString()}
          icon={ShoppingCart}
          color="yellow"
        />
      </div>
      
      {/* Segunda linha de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Store className="h-4 w-4" />
              Lojas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-2xl font-bold">{metrics.activeStores}</span>
                <span className="text-muted-foreground ml-1">ativas</span>
              </div>
              {metrics.inactiveStores > 0 && (
                <Badge variant="secondary">
                  {metrics.inactiveStores} inativa{metrics.inactiveStores > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalUsers}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(metrics.usersByRole).map(([role, count]) => (
                <Badge key={role} variant="outline" className="text-xs">
                  {count} {getRoleLabel(role)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-green-500"></span>
              <span className="font-medium">Operacional</span>
            </div>
            {metrics.alerts.length > 0 && (
              <p className="text-sm text-amber-600 mt-1">
                {metrics.alerts.length} alerta{metrics.alerts.length > 1 ? 's' : ''}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Atividades recentes com Timeline */}
      {timelineEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline events={timelineEvents} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OverviewSkeleton({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getEmptyMetrics(): FranchiseMetrics {
  return {
    totalStores: 0,
    activeStores: 0,
    inactiveStores: 0,
    totalUsers: 0,
    usersByRole: {},
    todayRevenue: 0,
    todayOrders: 0,
    todayAvgTicket: 0,
    monthRevenue: 0,
    monthOrders: 0,
    monthGrowth: 0,
    alerts: [],
    recentActivity: [],
  };
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: 'owner',
    admin: 'admin',
    manager: 'gerente',
    operator: 'operador',
    technician: 'técnico',
    viewer: 'viewer',
  };
  return labels[role] || role;
}

export default FranchiseOverview;
