/**
 * ============================================================================
 * useToast Hook
 * ============================================================================
 * 
 * Hook para exibir toasts usando sonner.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { toast as sonnerToast } from 'sonner';

export function useToast() {
  return {
    toast: sonnerToast,
    success: (message: string, options?: Parameters<typeof sonnerToast.success>[1]) => {
      sonnerToast.success(message, options);
    },
    error: (message: string, options?: Parameters<typeof sonnerToast.error>[1]) => {
      sonnerToast.error(message, options);
    },
    info: (message: string, options?: Parameters<typeof sonnerToast.info>[1]) => {
      sonnerToast.info(message, options);
    },
    warning: (message: string, options?: Parameters<typeof sonnerToast.warning>[1]) => {
      sonnerToast.warning(message, options);
    },
    loading: (message: string, options?: Parameters<typeof sonnerToast.loading>[1]) => {
      return sonnerToast.loading(message, options);
    },
    dismiss: (toastId?: string | number) => {
      sonnerToast.dismiss(toastId);
    },
  };
}
