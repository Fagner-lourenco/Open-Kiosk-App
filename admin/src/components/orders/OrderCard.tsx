/**
 * ============================================================================
 * Order Card Component
 * ============================================================================
 * 
 * Card compacto para exibir pedido na lista lateral.
 */

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge, getOrderStatus } from "@/components/ui/status-badge";
import { Order } from "./types";
import { Eye } from "lucide-react";

interface OrderCardProps {
  order: Order;
  isSelected: boolean;
  onClick: () => void;
}

export function OrderCard({ order, isSelected, onClick }: OrderCardProps) {
  const timestamp = order.timestamp || order.createdAt;
  const date = timestamp?.toDate?.();
  
  const formatTime = (d: Date) => {
    return d.toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (d: Date) => {
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const shortId = order.orderId 
    ? `#${order.orderId.slice(-8).toUpperCase()}`
    : `#${order.id.slice(-6).toUpperCase()}`;

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected 
          ? "ring-2 ring-blue-500 bg-blue-50 border-blue-200" 
          : "hover:border-gray-300"
      )}
      onClick={onClick}
    >
      <div className="p-3 space-y-2">
        {/* Header: ID and Time */}
        <div className="flex items-center justify-between">
          <span className="font-mono font-semibold text-sm">
            {shortId}
          </span>
          <span className="text-xs text-muted-foreground">
            {date ? formatTime(date) : '--:--'}
          </span>
        </div>

        {/* Date and Total */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {date ? formatDate(date) : '--/--'}
          </span>
          <span className="font-bold text-green-600">
            R$ {order.total?.toFixed(2) || '0.00'}
          </span>
        </div>

        {/* Status and Items */}
        <div className="flex items-center justify-between">
          <StatusBadge 
            status={getOrderStatus(order.status)} 
            size="sm"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'itens'}</span>
            <Eye className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </Card>
  );
}
