/**
 * ============================================================================
 * Store Orders Tab Component - Refactored
 * ============================================================================
 * 
 * Componente para exibir pedidos de uma loja específica.
 * Layout master-detail com timeline e ações.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, getDocs, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import { OrdersPanel, Order, OrderStats } from '@/components/orders';
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
            .filter(o => o.status === 'completed' && o.paymentStatus === 'paid')
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
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    revenue: orders
      .filter(o => o.status === 'completed' && o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.total || 0), 0),
    avgTicket: 0,
    ordersYesterday: yesterdayStats?.orders,
    revenueYesterday: yesterdayStats?.revenue,
  };

  // Calculate average ticket
  const paidOrders = orders.filter(o => o.status === 'completed' && o.paymentStatus === 'paid');
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
    // TODO: Implement print functionality
    toast.info('Funcionalidade de reimpressão será implementada em breve');
    console.log('Reprint order:', order.id);
  };

  const handleCancel = (order: Order) => {
    // TODO: Implement cancel functionality
    toast.info('Funcionalidade de cancelamento será implementada em breve');
    console.log('Cancel order:', order.id);
  };

  const handleRefund = (order: Order) => {
    // TODO: Implement refund functionality
    toast.info('Funcionalidade de estorno será implementada em breve');
    console.log('Refund order:', order.id);
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
