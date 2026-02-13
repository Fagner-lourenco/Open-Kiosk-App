/**
 * ============================================================================
 * EmptyState Component
 * ============================================================================
 *
 * Componente reutilizável para estados vazios (sem dados).
 * Exibe ícone, título, descrição e ação opcional.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Ícone exibido acima do título. Default: Inbox */
  icon?: LucideIcon;
  /** Título principal */
  title: string;
  /** Texto descritivo abaixo do título */
  description?: string;
  /** Label do botão de ação (CTA). Se omitido, nenhum botão é renderizado. */
  actionLabel?: string;
  /** Callback do botão de ação */
  onAction?: () => void;
  /** Conteúdo customizado abaixo da descrição */
  children?: ReactNode;
  /** Classes extras no container */
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {children}
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline" size="sm" className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
