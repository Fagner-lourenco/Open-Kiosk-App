/**
 * ============================================================================
 * Order Details Component
 * ============================================================================
 * 
 * Painel de detalhes do pedido com timeline e ações.
 */

import { Order } from "./types";
import { OrderTimeline } from "./OrderTimeline";
import { OrderActions } from "./OrderActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, getOrderStatus, getPaymentStatus } from "@/components/ui/status-badge";
import { 
  ShoppingCart, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Package,
  FileText,
  User,
} from "lucide-react";

interface OrderDetailsProps {
  order: Order | null;
  onReprint?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  onRefund?: (order: Order) => void;
}

export function OrderDetails({ 
  order, 
  onReprint,
  onCancel,
  onRefund,
}: OrderDetailsProps) {
  if (!order) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione um pedido</p>
          <p className="text-sm">Clique em um pedido na lista para ver os detalhes</p>
        </div>
      </Card>
    );
  }

  const timestamp = order.timestamp || order.createdAt;
  const date = timestamp?.toDate?.();
  
  const fullId = order.orderId || order.id;
  const shortId = fullId.slice(-8).toUpperCase();

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="h-4 w-4" />;
      case 'card': return <CreditCard className="h-4 w-4" />;
      case 'pix':
      case 'pix_qr': return <Smartphone className="h-4 w-4" />;
      default: return <CreditCard className="h-4 w-4" />;
    }
  };

  const getPaymentLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Dinheiro';
      case 'card': return 'Cartão';
      case 'pix':
      case 'pix_qr': return 'PIX';
      case 'mercadopago': return 'Mercado Pago';
      default: return method;
    }
  };

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl font-bold">
              Pedido #{shortId}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {date ? date.toLocaleString('pt-BR') : 'Data não disponível'}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              ID: {fullId}
            </p>
          </div>
          <StatusBadge 
            status={getOrderStatus(order.status)} 
            size="lg"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto space-y-4">
        {/* Timeline */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Timeline do Pedido
          </h4>
          <OrderTimeline order={order} />
        </div>

        <Separator />

        {/* Items */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Itens ({order.items?.length || 0})
          </h4>
          <div className="space-y-2">
            {order.items?.map((item, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
              >
                {/* Image placeholder */}
                <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                  {item.imageUrl ? (
                    <img 
                      src={item.imageUrl} 
                      alt={item.title || item.productName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-gray-400" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {item.title || item.productName || 'Produto'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    R$ {item.price?.toFixed(2)} × {item.quantity}
                    {item.size && ` • ${item.size}`}
                  </p>
                </div>

                {/* Price */}
                <div className="text-right shrink-0">
                  <p className="font-semibold">
                    R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Totals */}
        <div className="space-y-2 text-sm">
          {order.subtotal && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>R$ {order.subtotal.toFixed(2)}</span>
            </div>
          )}
          {order.discount && order.discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Desconto</span>
              <span>- R$ {order.discount.toFixed(2)}</span>
            </div>
          )}
          {order.tax && order.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Impostos</span>
              <span>R$ {order.tax.toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between items-center pt-2">
            <span className="font-semibold text-lg">Total</span>
            <span className="font-bold text-2xl text-green-600">
              R$ {order.total?.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>

        <Separator />

        {/* Payment Info */}
        <div className="p-3 rounded-lg bg-muted/50">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pagamento
          </h4>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getPaymentIcon(order.paymentMethod)}
              <span>{getPaymentLabel(order.paymentMethod)}</span>
            </div>
            <StatusBadge 
              status={getPaymentStatus(order.paymentStatus || 'pending')} 
              size="sm"
            />
          </div>
        </div>

        {/* Customer Info */}
        {(order.customerName || order.customerPhone) && (
          <div className="p-3 rounded-lg bg-muted/50">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              Cliente
            </h4>
            {order.customerName && (
              <p className="text-sm">{order.customerName}</p>
            )}
            {order.customerPhone && (
              <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
            )}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
            <h4 className="text-sm font-semibold mb-1 flex items-center gap-2 text-yellow-800">
              <FileText className="h-4 w-4" />
              Observações
            </h4>
            <p className="text-sm text-yellow-700">{order.notes}</p>
          </div>
        )}

        {/* Actions */}
        <OrderActions 
          order={order}
          onReprint={onReprint}
          onCancel={onCancel}
          onRefund={onRefund}
        />
      </CardContent>
    </Card>
  );
}
