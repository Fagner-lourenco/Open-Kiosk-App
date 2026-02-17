/**
 * ============================================================================
 * Order Actions Component
 * ============================================================================
 * 
 * Botões de ação para o pedido (reimprimir, cancelar, estornar).
 */

import { Order } from "./types";
import { Button } from "@/components/ui/button";
import { 
  Printer, 
  XCircle, 
  RefreshCw, 
  MoreHorizontal,
  Mail,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface OrderActionsProps {
  order: Order;
  onReprint?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  onRefund?: (order: Order) => void;
}

export function OrderActions({ 
  order, 
  onReprint, 
  onCancel, 
  onRefund,
}: OrderActionsProps) {
  const canCancel = order.status === 'pending' || order.status === 'processing' || order.status === 'paid_pending_dispense' || order.status === 'dispensing';
  const canRefund = order.paymentStatus === 'paid';

  const handleCopyId = () => {
    const id = order.orderId || order.id;
    navigator.clipboard.writeText(id);
    toast.success('ID copiado para a área de transferência');
  };

  const handleReprint = () => {
    if (onReprint) {
      onReprint(order);
    } else {
      toast.info('Funcionalidade de reimpressão será implementada');
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel(order);
    } else {
      toast.info('Funcionalidade de cancelamento será implementada');
    }
  };

  const handleRefund = () => {
    if (onRefund) {
      onRefund(order);
    } else {
      toast.info('Funcionalidade de estorno será implementada');
    }
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {/* Primary Action: Reprint */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleReprint}
        className="flex-1"
      >
        <Printer className="h-4 w-4 mr-2" />
        Reimprimir
      </Button>

      {/* Cancel Button */}
      {canCancel && (
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleCancel}
          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Cancelar
        </Button>
      )}

      {/* Refund Button */}
      {canRefund && (
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRefund}
          className="flex-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Estornar
        </Button>
      )}

      {/* More Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleCopyId}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar ID
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.info('Email será implementado')}>
            <Mail className="h-4 w-4 mr-2" />
            Enviar por email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleReprint}>
            <Printer className="h-4 w-4 mr-2" />
            Reimprimir recibo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
