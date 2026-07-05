/**
 * ============================================================================
 * Store Orders Tab Component - Refactored
 * ============================================================================
 * 
 * Componente para exibir pedidos de uma loja especifica.
 * Layout master-detail com timeline e acoes.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, getDocs, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import { OrdersPanel, Order, OrderStats } from '@/components/orders';
import { useAuth } from '@/context/AuthContext';
import { cancelOrder, refundOrder, printOrderReceipt } from '@/services/orderService';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface StoreOrdersTabProps {
  franchiseId: string;
  storeId: string;
}

export function StoreOrdersTab({ franchiseId, storeId }: StoreOrdersTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [limitCount, setLimitCount] = useState(50);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch orders
  const { data: orders = [], isLoading, isFetching } = useQuery({
    queryKey: ['store-orders', franchiseId, storeId, statusFilter, limitCount],
    queryFn: async (): Promise<Order[]> => {
      const path = ordersPath(franchiseId, storeId);
      const pathSegments = path.split('/') as [string, ...string[]];
      const ordersRef = collection(db, ...pathSegments);
      let ordersQuery = query(ordersRef, orderBy('timestamp', 'desc'), limit(limitCount));
      
      if (statusFilter !== 'all') {
        ordersQuery = query(
          ordersRef,
          where('status', '==', statusFilter),
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(ordersQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];
    },
  });

  // Fetch yesterday's data for comparison
  const { data: yesterdayStats } = useQuery({
    queryKey: ['store-orders-yesterday', franchiseId, storeId],
    queryFn: async (): Promise<{ orders: number; revenue: number }> => {
      const path = ordersPath(franchiseId, storeId);
      const pathSegments = path.split('/') as [string, ...string[]];
      const ordersRef = collection(db, ...pathSegments);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      const yesterdayQuery = query(
        ordersRef,
        where('timestamp', '>=', Timestamp.fromDate(yesterday)),
        where('timestamp', '<=', Timestamp.fromDate(endOfYesterday)),
        orderBy('timestamp', 'desc')
      );

      try {
        const snapshot = await getDocs(yesterdayQuery);
        const yesterdayOrders = snapshot.docs.map(doc => doc.data());
        
        return {
          orders: yesterdayOrders.length,
          revenue: yesterdayOrders
            .filter(o => o.paymentStatus === 'paid')
            .reduce((sum, o) => sum + (o.total || 0), 0),
        };
      } catch {
        return { orders: 0, revenue: 0 };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate stats
  const stats: OrderStats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'paid_pending_dispense').length,
    processing: orders.filter(o => o.status === 'dispensing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    revenue: orders
      .filter(o => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.total || 0), 0),
    avgTicket: 0,
    ordersYesterday: yesterdayStats?.orders,
    revenueYesterday: yesterdayStats?.revenue,
  };

  // Calculate average ticket
  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
  stats.avgTicket = paidOrders.length > 0 ? stats.revenue / paidOrders.length : 0;

  // Handlers
  const handleRefresh = () => {
    queryClient.invalidateQueries({ 
      queryKey: ['store-orders', franchiseId, storeId] 
    });
  };

  const handleLoadMore = () => {
    setLimitCount(prev => prev + 50);
  };

  const handleReprint = (order: Order) => {
    printOrderReceipt(order);
  };

  const handleCancel = async (order: Order) => {
    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }
    if (!(order.status === 'paid_pending_dispense' || order.status === 'dispensing')) {
      toast.warning('Somente pedidos aguardando dispensa ou dispensando podem ser cancelados');
      return;
    }

    const orderLabel = order.orderNumber || order.orderId || order.id;
    const confirmed = window.confirm(
      `Cancelar o pedido ${orderLabel}?\n\nEsta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      await cancelOrder({
        franchiseId,
        storeId,
        orderId: order.id,
        actor: {
          id: user.uid,
          email: user.email || '',
          name: user.displayName || undefined,
        },
      });
      toast.success('Pedido cancelado com sucesso');
      handleRefresh();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Erro ao cancelar pedido');
    }
  };

  const handleRefund = async (order: Order) => {
    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }
    if (order.paymentStatus !== 'paid') {
      toast.warning('Somente pedidos pagos podem ser estornados');
      return;
    }

    const orderLabel = order.orderNumber || order.orderId || order.id;
    const confirmed = window.confirm(
      `Estornar o pedido ${orderLabel}?\n\nO valor será devolvido ao cliente via gateway de pagamento.`
    );
    if (!confirmed) return;

    try {
      const { gatewayRefunded } = await refundOrder({
        franchiseId,
        storeId,
        orderId: order.id,
        actor: {
          id: user.uid,
          email: user.email || '',
          name: user.displayName || undefined,
        },
      });
      if (gatewayRefunded) {
        toast.success('Estorno realizado — valor devolvido ao cliente');
      } else {
        toast.success('Pedido marcado como estornado (sem pagamento de gateway vinculado)');
      }
      handleRefresh();
    } catch (error) {
      console.error('Error refunding order:', error);
      toast.error('Erro ao estornar pedido', {
        description: 'O valor NÃO foi devolvido. Verifique o pagamento no painel do Mercado Pago.',
      });
    }
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <OrdersPanel
      orders={orders}
      stats={stats}
      isLoading={isLoading}
      statusFilter={statusFilter}
      onStatusChange={setStatusFilter}
      hasMore={orders.length >= limitCount}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      isRefreshing={isFetching}
      onReprint={handleReprint}
      onCancel={handleCancel}
      onRefund={handleRefund}
    />
  );
}

