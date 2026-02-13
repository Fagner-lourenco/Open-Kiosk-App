/**
 * ============================================================================
 * LoadingState Component
 * ============================================================================
 *
 * Componente reutilizável para estados de carregamento.
 * Usa o mesmo padrão visual (Loader2 spinner) já adotado por todas as tabs.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  /** Texto de acessibilidade para screen readers */
  label?: string;
  /** Mostrar a label visivelmente abaixo do spinner */
  showLabel?: boolean;
  /** Classes extras no container */
  className?: string;
}

export function LoadingState({
  label = 'Carregando...',
  showLabel = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12',
        className,
      )}
      role="status"
      aria-label={label}
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      {showLabel ? (
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
