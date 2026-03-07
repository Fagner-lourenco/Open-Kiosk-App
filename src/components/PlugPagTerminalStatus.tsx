/**
 * PlugPagTerminalStatus — Componente de feedback visual do terminal PlugPag
 *
 * Exibe o estado atual da conexão/transação com animações e ícones.
 * Usado dentro do DrinkQuickCheckoutModal durante pagamentos card-present.
 */
import React, { useEffect, useState } from 'react';
import {
  plugpagPaymentService,
  type PlugPagTerminalState,
} from '@/services/plugpagPaymentService';
import { Loader2, CheckCircle2, XCircle, Wifi, WifiOff, CreditCard, Smartphone } from 'lucide-react';

interface PlugPagTerminalStatusProps {
  /** Exibir em modo compacto (inline) */
  compact?: boolean;
  /** Classe CSS adicional */
  className?: string;
}

const stateConfig: Record<PlugPagTerminalState, {
  label: string;
  icon: React.ReactNode;
  color: string;
  animate?: boolean;
}> = {
  idle: {
    label: 'Terminal não inicializado',
    icon: <WifiOff className="h-5 w-5" />,
    color: 'text-gray-400',
  },
  initializing: {
    label: 'Inicializando...',
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    color: 'text-blue-500',
    animate: true,
  },
  disconnected: {
    label: 'Terminal desconectado',
    icon: <WifiOff className="h-5 w-5" />,
    color: 'text-orange-500',
  },
  connecting: {
    label: 'Conectando ao terminal...',
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    color: 'text-blue-500',
    animate: true,
  },
  connected: {
    label: 'Terminal pronto',
    icon: <Wifi className="h-5 w-5" />,
    color: 'text-green-500',
  },
  waiting_card: {
    label: 'Insira ou aproxime o cartão',
    icon: <CreditCard className="h-6 w-6 animate-pulse" />,
    color: 'text-blue-600',
    animate: true,
  },
  processing: {
    label: 'Processando...',
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    color: 'text-yellow-600',
    animate: true,
  },
  approved: {
    label: 'Pagamento aprovado!',
    icon: <CheckCircle2 className="h-6 w-6" />,
    color: 'text-green-600',
  },
  rejected: {
    label: 'Pagamento não aprovado',
    icon: <XCircle className="h-6 w-6" />,
    color: 'text-red-600',
  },
  error: {
    label: 'Erro no terminal',
    icon: <XCircle className="h-5 w-5" />,
    color: 'text-red-500',
  },
};

export const PlugPagTerminalStatus: React.FC<PlugPagTerminalStatusProps> = ({
  compact = false,
  className = '',
}) => {
  const [state, setState] = useState<PlugPagTerminalState>(plugpagPaymentService.getState());
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    const unsub = plugpagPaymentService.onStateChange((newState, msg) => {
      setState(newState);
      setMessage(msg);
    });
    return unsub;
  }, []);

  const config = stateConfig[state];

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${config.color} ${className}`}>
        {config.icon}
        <span className="text-sm">{message || config.label}</span>
      </div>
    );
  }

  // Full-size display (for modal payment flow)
  return (
    <div className={`flex flex-col items-center justify-center p-6 space-y-4 ${className}`}>
      {/* Terminal illustration */}
      <div className={`p-4 rounded-full bg-gray-100 ${config.animate ? 'animate-pulse' : ''}`}>
        <Smartphone className={`h-12 w-12 ${config.color}`} />
      </div>

      {/* State icon + label */}
      <div className={`flex items-center gap-2 ${config.color}`}>
        {config.icon}
        <span className="text-lg font-medium">{message || config.label}</span>
      </div>

      {/* Connected MAC */}
      {state === 'connected' && plugpagPaymentService.getConnectedMac() && (
        <span className="text-xs text-muted-foreground font-mono">
          {plugpagPaymentService.getConnectedMac()}
        </span>
      )}

      {/* Waiting card animation hint */}
      {state === 'waiting_card' && (
        <p className="text-sm text-muted-foreground animate-pulse">
          Aguardando cartão na maquininha...
        </p>
      )}

      {/* Abort hint */}
      {(state === 'waiting_card' || state === 'processing') && (
        <button
          onClick={() => plugpagPaymentService.abortPayment()}
          className="text-xs text-red-500 hover:text-red-700 underline"
        >
          Cancelar
        </button>
      )}
    </div>
  );
};

export default PlugPagTerminalStatus;
