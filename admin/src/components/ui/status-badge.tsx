/**
 * ============================================================================
 * Status Badge Component
 * ============================================================================
 *
 * Badge colorido com icone para exibicao de status.
 * Padronizado para pedidos, pagamentos e outros estados.
 */

import { cn } from '@/lib/utils';
import {
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  RefreshCw,
  DollarSign,
  LucideIcon,
} from 'lucide-react';

export type StatusType =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'canceled'
  | 'refunded'
  | 'paid'
  | 'failed'
  | 'warning'
  | 'expired'
  | 'paid_pending_dispense'
  | 'dispensing'
  | 'failed_dispense';

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

const canceledConfig: StatusConfig = {
  label: 'Cancelado',
  icon: XCircle,
  className: 'bg-red-100 text-red-800 border-red-200',
};

const statusConfigs: Record<StatusType, StatusConfig> = {
  pending: {
    label: 'Pendente',
    icon: Clock,
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  processing: {
    label: 'Processando',
    icon: Loader2,
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  completed: {
    label: 'Concluido',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  cancelled: canceledConfig,
  canceled: canceledConfig,
  refunded: {
    label: 'Estornado',
    icon: RefreshCw,
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  paid: {
    label: 'Pago',
    icon: DollarSign,
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  failed: {
    label: 'Falhou',
    icon: Ban,
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  warning: {
    label: 'Atencao',
    icon: AlertCircle,
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  expired: {
    label: 'Expirado',
    icon: Clock,
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  paid_pending_dispense: {
    label: 'Pago (aguardando)',
    icon: DollarSign,
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
  dispensing: {
    label: 'Dispensando',
    icon: Loader2,
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  failed_dispense: {
    label: 'Falha na entrega',
    icon: Ban,
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

export interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  showIcon?: boolean;
  animate?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusBadge({
  status,
  label,
  showIcon = true,
  animate = false,
  size = 'md',
  className,
}: StatusBadgeProps) {
  const normalizedStatus = normalizeStatus(status);
  const config = statusConfigs[normalizedStatus];
  const Icon = config.icon;
  const displayLabel = label || config.label;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        config.className,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            iconSizes[size],
            animate &&
              (normalizedStatus === 'processing' || normalizedStatus === 'dispensing') &&
              'animate-spin'
          )}
        />
      )}
      {displayLabel}
    </span>
  );
}

function normalizeStatus(status: string): StatusType {
  switch (status) {
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'expired':
      return 'expired';
    case 'paid_pending_dispense':
      return 'paid_pending_dispense';
    case 'dispensing':
      return 'dispensing';
    case 'failed_dispense':
      return 'failed_dispense';
    default:
      if (statusConfigs[status as StatusType]) {
        return status as StatusType;
      }
      return 'pending';
  }
}

// Helper to get status from string
export function getOrderStatus(status: string): StatusType {
  return normalizeStatus(status);
}

// Helper to get payment status
export function getPaymentStatus(status: string): StatusType {
  switch (status) {
    case 'paid':
    case 'approved':
    case 'confirmed':
      return 'paid';
    case 'pending':
    case 'awaiting':
      return 'pending';
    case 'refunded':
      return 'refunded';
    case 'failed':
    case 'rejected':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'expired':
      return 'expired';
    case 'paid_pending_dispense':
      return 'paid_pending_dispense';
    case 'dispensing':
      return 'dispensing';
    case 'failed_dispense':
      return 'failed_dispense';
    default:
      return 'pending';
  }
}
