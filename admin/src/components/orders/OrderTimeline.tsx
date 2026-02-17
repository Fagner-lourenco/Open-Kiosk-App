/**
 * ============================================================================
 * Order Timeline Component
 * ============================================================================
 * 
 * Timeline visual dos eventos do pedido.
 */

import { Order } from "./types";
import { Timeline, TimelineEvent } from "@/components/ui/timeline";
import { 
  ShoppingCart, 
  CreditCard, 
  Package, 
  CheckCircle, 
  XCircle,
  Clock,
} from "lucide-react";

interface OrderTimelineProps {
  order: Order;
}

export function OrderTimeline({ order }: OrderTimelineProps) {
  const events: TimelineEvent[] = [];

  // Always add created event
  const createdTime = order.timestamp || order.createdAt;
  if (createdTime) {
    events.push({
      id: 'created',
      title: 'Pedido criado',
      description: `${order.items?.length || 0} itens • R$ ${order.total?.toFixed(2) || '0.00'}`,
      timestamp: createdTime.toDate(),
      icon: ShoppingCart,
      color: 'blue',
      status: 'completed',
    });
  }

  // Payment event
  if (order.paidAt) {
    events.push({
      id: 'paid',
      title: 'Pagamento confirmado',
      description: getPaymentMethodLabel(order.paymentMethod),
      timestamp: order.paidAt.toDate(),
      icon: CreditCard,
      color: 'green',
      status: 'completed',
    });
  } else if (order.paymentStatus === 'paid') {
    // If paid but no paidAt, use createdAt + a few seconds
    const paidTime = createdTime?.toDate();
    if (paidTime) {
      const adjustedTime = new Date(paidTime.getTime() + 2000);
      events.push({
        id: 'paid',
        title: 'Pagamento confirmado',
        description: getPaymentMethodLabel(order.paymentMethod),
        timestamp: adjustedTime,
        icon: CreditCard,
        color: 'green',
        status: 'completed',
      });
    }
  }

  // Dispensing event (kiosk: 'dispensing', legacy: 'processing')
  if (order.processingAt) {
    events.push({
      id: 'processing',
      title: 'Dispensando',
      timestamp: order.processingAt.toDate(),
      icon: Package,
      color: 'yellow',
      status: (order.status === 'dispensing' || order.status === 'processing') ? 'current' : 'completed',
    });
  } else if (order.status === 'dispensing' || order.status === 'processing' || order.status === 'completed') {
    // If dispensing/completed but no processingAt
    const processingTime = order.paidAt?.toDate() || createdTime?.toDate();
    if (processingTime) {
      const adjustedTime = new Date(processingTime.getTime() + 5000);
      events.push({
        id: 'processing',
        title: 'Dispensando',
        timestamp: adjustedTime,
        icon: Package,
        color: 'yellow',
        status: (order.status === 'dispensing' || order.status === 'processing') ? 'current' : 'completed',
      });
    }
  }

  // Completed event
  if (order.completedAt) {
    events.push({
      id: 'completed',
      title: 'Pedido concluído',
      description: 'Entregue ao cliente',
      timestamp: order.completedAt.toDate(),
      icon: CheckCircle,
      color: 'green',
      status: 'completed',
    });
  } else if (order.status === 'completed') {
    // If completed but no completedAt
    const completedTime = order.processingAt?.toDate() || order.paidAt?.toDate() || createdTime?.toDate();
    if (completedTime) {
      const adjustedTime = new Date(completedTime.getTime() + 120000);
      events.push({
        id: 'completed',
        title: 'Pedido concluído',
        description: 'Entregue ao cliente',
        timestamp: adjustedTime,
        icon: CheckCircle,
        color: 'green',
        status: 'completed',
      });
    }
  }

  // Cancelled event
  if (order.cancelledAt) {
    events.push({
      id: 'cancelled',
      title: 'Pedido cancelado',
      timestamp: order.cancelledAt.toDate(),
      icon: XCircle,
      color: 'red',
      status: 'completed',
    });
  } else if (order.status === 'cancelled') {
    const cancelTime = createdTime?.toDate() || new Date();
    events.push({
      id: 'cancelled',
      title: 'Pedido cancelado',
      timestamp: cancelTime,
      icon: XCircle,
      color: 'red',
      status: 'completed',
    });
  }

  // Pending steps (future) — kiosk uses 'paid_pending_dispense' or legacy 'pending'
  if (order.status === 'pending' || order.status === 'paid_pending_dispense') {
    events.push({
      id: 'awaiting-dispense',
      title: order.status === 'paid_pending_dispense' ? 'Aguardando dispensa' : 'Aguardando pagamento',
      timestamp: new Date(),
      icon: Clock,
      color: 'yellow',
      status: 'current',
    });
  }

  // Failed dispense event
  if (order.status === 'failed_dispense') {
    const failTime = createdTime?.toDate() || new Date();
    events.push({
      id: 'failed-dispense',
      title: 'Falha na dispensa',
      description: 'O produto não foi dispensado corretamente',
      timestamp: failTime,
      icon: XCircle,
      color: 'red',
      status: 'current',
    });
  }

  // Sort by timestamp
  events.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Sem eventos registrados
      </div>
    );
  }

  return <Timeline events={events} />;
}

function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'cash': return 'Dinheiro';
    case 'card': return 'Cartão de crédito/débito';
    case 'pix':
    case 'pix_qr': return 'PIX';
    case 'mercadopago': return 'Mercado Pago';
    default: return method;
  }
}
