/**
 * ============================================================================
 * DashboardPage - Painel Principal
 * ============================================================================
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Store, 
  Users, 
  TrendingUp, 
  AlertCircle,
  ArrowRight,
  DollarSign,
  ShoppingCart,
  Activity,
  Building2
} from 'lucide-react';

interface DashboardStats {
  totalStores: number;
  activeStores: number;
  totalUsers: number;
  totalRevenue: number;
  totalOrders: number;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: Date;
  }>;
}

export function DashboardPage() {
  const { currentFranchise, stores } = useFranchise();
  const { isSuperAdmin } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', currentFranchise?.id],
    queryFn: async (): Promise<DashboardStats> => {
      if (!currentFranchise) {
        return {
          totalStores: 0,
          activeStores: 0,
          totalUsers: 0,
          totalRevenue: 0,
          totalOrders: 0,
          recentActivity: [],
        };
      }

      // Get stores count
      const storesSnapshot = await getDocs(
        collection(db, `franchises/${currentFranchise.id}/stores`)
      );
      
      const storesData = storesSnapshot.docs.map(doc => doc.data());
      const activeStores = storesData.filter(s => s.isActive !== false).length;

      // Get members count (subcollection como fonte de verdade)
      const membersSnapshot = await getDocs(
        query(
          collection(db, `franchises/${currentFranchise.id}/members`),
          where('isActive', '==', true)
        )
      );
      const totalUsers = membersSnapshot.size || 1;

      // Get recent orders (mock for now - would come from actual orders collection)
      let totalRevenue = 0;
      let totalOrders = 0;

      // Try to get orders from stores
      for (const store of storesSnapshot.docs) {
        const ordersCollectionPath = ordersPath(currentFranchise.id, store.id);
        const pathSegments = ordersCollectionPath.split('/') as [string, ...string[]];
        const ordersSnapshot = await getDocs(
          query(
            collection(db, ...pathSegments),
            orderBy('timestamp', 'desc'),
            limit(100)
          )
        );
        
        ordersSnapshot.docs.forEach(doc => {
          const order = doc.data();
          totalOrders++;
          totalRevenue += order.total || 0;
        });
      }

      // Get recent audit logs for activity
      const auditLogsSnapshot = await getDocs(
        query(
          collection(db, `franchises/${currentFranchise.id}/auditLogs`),
          orderBy('timestamp', 'desc'),
          limit(5)
        )
      );

      const recentActivity = auditLogsSnapshot.docs.map(doc => {
        const data = doc.data();
        const timestamp = data.timestamp?.toDate?.() || new Date(data.timestamp) || new Date();
        
        // Format activity description based on action type
        let description = data.description || data.action || 'Ação realizada';
        if (data.action && !data.description) {
          const actionLabels: Record<string, string> = {
            'store.created': 'Nova loja criada',
            'store.updated': 'Loja atualizada',
            'member.added': 'Membro adicionado',
            'member.removed': 'Membro removido',
            'settings.updated': 'Configurações atualizadas',
            'product.created': 'Produto criado',
            'product.updated': 'Produto atualizado',
            'order.created': 'Novo pedido recebido',
          };
          description = actionLabels[data.action] || data.action;
        }
        
        return {
          id: doc.id,
          type: data.action || data.type || 'activity',
          description,
          timestamp,
        };
      });

      return {
        totalStores: storesSnapshot.size,
        activeStores,
        totalUsers,
        totalRevenue,
        totalOrders,
        recentActivity,
      };
    },
    enabled: !!currentFranchise,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const statCards = useMemo(() => [
    {
      title: 'Lojas',
      value: stats?.totalStores || 0,
      description: `${stats?.activeStores || 0} ativas`,
      icon: Store,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      href: '/stores',
    },
    {
      title: 'Usuários',
      value: stats?.totalUsers || 0,
      description: 'membros da franquia',
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      href: '/users',
    },
    {
      title: 'Pedidos',
      value: stats?.totalOrders || 0,
      description: 'total de pedidos',
      icon: ShoppingCart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      href: '/reports',
    },
    {
      title: 'Receita',
      value: `R$ ${(stats?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      description: 'receita total',
      icon: DollarSign,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      href: '/reports',
    },
  ], [stats]);

  if (!currentFranchise) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>
              {stores.length === 0 && !isSuperAdmin 
                ? 'Bem-vindo ao Open Kiosk' 
                : 'Nenhuma franquia selecionada'}
            </CardTitle>
            <CardDescription className="mt-2">
              {stores.length === 0 && !isSuperAdmin ? (
                <div className="space-y-4">
                  <p>
                    Você ainda não está associado a nenhuma franquia.
                  </p>
                  <div className="text-sm text-left bg-gray-50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-gray-700">O que você pode fazer:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-600">
                      <li>Aguarde um convite de um administrador de franquia</li>
                      <li>Verifique se o convite foi enviado para o email correto</li>
                      <li>Entre em contato com o suporte se precisar de ajuda</li>
                    </ul>
                  </div>
                </div>
              ) : (
                'Selecione uma franquia no menu lateral para visualizar o dashboard'
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">
          Visão geral de {currentFranchise.name}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.title} to={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">
                      {isLoading ? '...' : stat.value}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lojas</CardTitle>
            <CardDescription>Gerencie suas lojas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stores.slice(0, 3).map((store) => (
                <Link 
                  key={store.id} 
                  to={`/stores/${store.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{store.name}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </Link>
              ))}
              {stores.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nenhuma loja cadastrada
                </p>
              )}
            </div>
            <Link to="/stores">
              <Button variant="outline" className="w-full mt-4">
                Ver todas as lojas
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
            <CardDescription>Atalhos para tarefas comuns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Criar loja só para superadmin ou owner */}
            {isSuperAdmin && (
              <Link to="/stores/new">
                <Button variant="outline" className="w-full justify-start">
                  <Store className="mr-2 h-4 w-4" />
                  Criar nova loja
                </Button>
              </Link>
            )}
            <Link to="/invitations">
              <Button variant="outline" className="w-full justify-start">
                <Users className="mr-2 h-4 w-4" />
                Convidar usuário
              </Button>
            </Link>
            <Link to="/reports">
              <Button variant="outline" className="w-full justify-start">
                <TrendingUp className="mr-2 h-4 w-4" />
                Ver relatórios
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Atividade Recente</CardTitle>
            <CardDescription>Últimas ações na franquia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-2">
                    <Activity className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-gray-400">
                        {activity.timestamp.toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhuma atividade recente</p>
                </div>
              )}
            </div>
            <Link to="/audit">
              <Button variant="outline" className="w-full mt-4">
                Ver histórico completo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section - Only for Super Admin */}
      {stores.length === 0 && isSuperAdmin && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Configure sua primeira loja</p>
                <p className="text-sm text-yellow-700">
                  Você ainda não tem lojas cadastradas.{' '}
                  <Link to="/stores/new" className="underline font-medium">
                    Criar loja agora
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
