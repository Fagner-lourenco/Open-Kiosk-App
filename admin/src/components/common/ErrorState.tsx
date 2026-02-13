/**
 * ============================================================================
 * ErrorState Component
 * ============================================================================
 *
 * Componente reutilizável para estados de erro.
 * Exibe mensagem de erro e botão de retry quando disponível.
 */

import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** Ícone exibido acima do título. Default: AlertTriangle */
  icon?: LucideIcon;
  /** Título do erro */
  title?: string;
  /** Descrição do erro */
  description?: string;
  /** Callback de retry. Se omitido, nenhum botão é renderizado. */
  onRetry?: () => void;
  /** Label do botão de retry */
  retryLabel?: string;
  /** Classes extras no container */
  className?: string;
}

export function ErrorState({
  icon: Icon = AlertTriangle,
  title = 'Erro ao carregar dados',
  description = 'Ocorreu um erro inesperado. Tente novamente.',
  onRetry,
  retryLabel = 'Tentar novamente',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3 mb-4">
        <Icon className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
