import { type MouseEvent, type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
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

interface ConfirmDeleteDialogProps {
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
  children?: ReactNode;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isConfirming = false,
  confirmDisabled = false,
  confirmLabel = 'Excluir',
  confirmingLabel = 'Excluindo...',
  cancelLabel = 'Cancelar',
  children,
}: ConfirmDeleteDialogProps) {
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
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {children}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isConfirming || confirmDisabled}
            className="bg-red-600 hover:bg-red-700"
          >
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {confirmingLabel}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {confirmLabel}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
