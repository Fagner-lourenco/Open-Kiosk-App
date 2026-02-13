/**
 * ============================================================================
 * ConfirmActionDialog Component
 * ============================================================================
 *
 * Diálogo genérico de confirmação de ação (não apenas delete).
 * Usa AlertDialog (shadcn/Radix) - acessível, com foco trap e keyboard nav.
 * 
 * Para ações destrutivas: variant="destructive"
 * Para ações normais: variant="default"
 */

import { type MouseEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  /** "destructive" aplica estilo vermelho; "default" mantém estilo primário */
  variant?: 'destructive' | 'default';
  /** Conteúdo extra entre descrição e botões (ex.: campo de confirmação) */
  children?: ReactNode;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isConfirming = false,
  confirmDisabled = false,
  confirmLabel = 'Confirmar',
  confirmingLabel = 'Processando...',
  cancelLabel = 'Cancelar',
  variant = 'default',
  children,
}: ConfirmActionDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (isConfirming) return;
    onOpenChange(nextOpen);
  };

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isConfirming || confirmDisabled) return;
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {children}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isConfirming || confirmDisabled}
            className={cn(
              variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {confirmingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
