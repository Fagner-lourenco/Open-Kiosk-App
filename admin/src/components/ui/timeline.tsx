/**
 * ============================================================================
 * Timeline Component
 * ============================================================================
 * 
 * Timeline vertical para exibir eventos em ordem cronológica.
 * Ideal para histórico de pedidos, logs de auditoria, etc.
 */

import { cn } from "@/lib/utils";
import { LucideIcon, Circle } from "lucide-react";

export interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  timestamp: Date | string;
  icon?: LucideIcon;
  status?: 'completed' | 'current' | 'pending';
  color?: 'default' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const colorVariants = {
  default: {
    dot: 'bg-gray-400',
    line: 'bg-gray-200',
    icon: 'text-gray-600 bg-gray-100',
  },
  blue: {
    dot: 'bg-blue-500',
    line: 'bg-blue-200',
    icon: 'text-blue-600 bg-blue-100',
  },
  green: {
    dot: 'bg-green-500',
    line: 'bg-green-200',
    icon: 'text-green-600 bg-green-100',
  },
  yellow: {
    dot: 'bg-yellow-500',
    line: 'bg-yellow-200',
    icon: 'text-yellow-600 bg-yellow-100',
  },
  red: {
    dot: 'bg-red-500',
    line: 'bg-red-200',
    icon: 'text-red-600 bg-red-100',
  },
  purple: {
    dot: 'bg-purple-500',
    line: 'bg-purple-200',
    icon: 'text-purple-600 bg-purple-100',
  },
};

export function Timeline({ events, className }: TimelineProps) {
  const formatTime = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={cn("relative", className)}>
      {events.map((event, index) => {
        const Icon = event.icon || Circle;
        const color = event.color || 'default';
        const colors = colorVariants[color];
        const isLast = index === events.length - 1;
        const isCurrent = event.status === 'current';

        return (
          <div key={event.id} className="relative pb-6 last:pb-0">
            {/* Connector Line */}
            {!isLast && (
              <div 
                className={cn(
                  "absolute left-4 top-8 bottom-0 w-0.5",
                  event.status === 'pending' ? 'bg-gray-200' : colors.line
                )}
              />
            )}

            {/* Event */}
            <div className="relative flex gap-4">
              {/* Icon */}
              <div 
                className={cn(
                  "relative z-10 flex items-center justify-center w-8 h-8 rounded-full shrink-0",
                  event.status === 'pending' 
                    ? 'bg-gray-100 text-gray-400' 
                    : colors.icon,
                  isCurrent && 'ring-2 ring-offset-2 ring-blue-500'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p 
                    className={cn(
                      "font-medium text-sm",
                      event.status === 'pending' ? 'text-gray-400' : 'text-gray-900'
                    )}
                  >
                    {event.title}
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(event.timestamp)}
                  </span>
                </div>
                {event.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {event.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper to create timeline events from order data
export function createOrderTimeline(order: {
  createdAt?: Date;
  paidAt?: Date;
  processingAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  status: string;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  
  if (order.createdAt) {
    events.push({
      id: 'created',
      title: 'Pedido criado',
      timestamp: order.createdAt,
      color: 'blue',
      status: 'completed',
    });
  }

  if (order.paidAt) {
    events.push({
      id: 'paid',
      title: 'Pagamento confirmado',
      timestamp: order.paidAt,
      color: 'green',
      status: 'completed',
    });
  }

  if (order.processingAt) {
    events.push({
      id: 'processing',
      title: 'Em preparação',
      timestamp: order.processingAt,
      color: 'yellow',
      status: order.status === 'processing' ? 'current' : 'completed',
    });
  }

  if (order.completedAt) {
    events.push({
      id: 'completed',
      title: 'Pedido concluído',
      timestamp: order.completedAt,
      color: 'green',
      status: 'completed',
    });
  }

  if (order.cancelledAt) {
    events.push({
      id: 'cancelled',
      title: 'Pedido cancelado',
      timestamp: order.cancelledAt,
      color: 'red',
      status: 'completed',
    });
  }

  return events.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}
