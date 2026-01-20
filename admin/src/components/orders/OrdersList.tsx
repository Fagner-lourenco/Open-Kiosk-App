/**
 * ============================================================================
 * Orders List Component
 * ============================================================================
 * 
 * Lista lateral de pedidos com scroll.
 */

import { Order } from "./types";
import { OrderCard } from "./OrderCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, Loader2 } from "lucide-react";

interface OrdersListProps {
  orders: Order[];
  selectedOrderId: string | null;
  onSelectOrder: (order: Order) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function OrdersList({
  orders,
  selectedOrderId,
  onSelectOrder,
  isLoading = false,
  hasMore = false,
  onLoadMore,
}: OrdersListProps) {
  if (isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <span className="text-sm">Carregando pedidos...</span>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
        <p className="font-medium">Nenhum pedido encontrado</p>
        <p className="text-sm">Ajuste os filtros ou aguarde novos pedidos</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="space-y-2 pr-4">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isSelected={selectedOrderId === order.id}
            onClick={() => onSelectOrder(order)}
          />
        ))}

        {hasMore && (
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={onLoadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Carregando...
              </>
            ) : (
              'Carregar mais'
            )}
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}
