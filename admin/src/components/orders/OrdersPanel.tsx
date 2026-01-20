/**
 * ============================================================================
 * Orders Panel Component
 * ============================================================================
 * 
 * Layout master-detail para pedidos.
 * Lista à esquerda, detalhes à direita.
 */

import { useState } from "react";
import { Order, OrderStats } from "./types";
import { OrdersList } from "./OrdersList";
import { OrderDetails } from "./OrderDetails";
import { OrderFilters } from "./OrderFilters";
import { OrderStatsCards } from "./OrderStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

interface OrdersPanelProps {
  orders: Order[];
  stats: OrderStats;
  isLoading?: boolean;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onReprint?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  onRefund?: (order: Order) => void;
}

export function OrdersPanel({
  orders,
  stats,
  isLoading = false,
  statusFilter,
  onStatusChange,
  hasMore = false,
  onLoadMore,
  onRefresh,
  isRefreshing = false,
  onReprint,
  onCancel,
  onRefund,
}: OrdersPanelProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  // Filter orders by search query
  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    const orderId = (order.orderId || order.id).toLowerCase();
    return orderId.includes(searchLower);
  });

  // Filter by date
  const dateFilteredOrders = filteredOrders.filter(order => {
    if (!selectedDate) return true;
    const timestamp = order.timestamp || order.createdAt;
    if (!timestamp) return true;
    const orderDate = timestamp.toDate();
    return (
      orderDate.getDate() === selectedDate.getDate() &&
      orderDate.getMonth() === selectedDate.getMonth() &&
      orderDate.getFullYear() === selectedDate.getFullYear()
    );
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <OrderStatsCards stats={stats} loading={isLoading} />

      {/* Filters */}
      <OrderFilters
        statusFilter={statusFilter}
        onStatusChange={onStatusChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders List (Left Panel) */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Pedidos
              <span className="text-sm font-normal text-muted-foreground">
                ({dateFilteredOrders.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersList
              orders={dateFilteredOrders}
              selectedOrderId={selectedOrder?.id || null}
              onSelectOrder={setSelectedOrder}
              isLoading={isLoading}
              hasMore={hasMore}
              onLoadMore={onLoadMore}
            />
          </CardContent>
        </Card>

        {/* Order Details (Right Panel) */}
        <div className="lg:col-span-2">
          <OrderDetails
            order={selectedOrder}
            onReprint={onReprint}
            onCancel={onCancel}
            onRefund={onRefund}
          />
        </div>
      </div>
    </div>
  );
}
