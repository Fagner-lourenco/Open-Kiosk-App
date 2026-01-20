/**
 * ============================================================================
 * Sonner Toast Component
 * ============================================================================
 * 
 * Componente de toast usando sonner.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { Toaster as SonnerToaster } from 'sonner';

interface ToasterProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  richColors?: boolean;
  expand?: boolean;
  duration?: number;
  closeButton?: boolean;
}

export function Toaster({
  position = 'top-right',
  richColors = true,
  expand = true,
  duration = 4000,
  closeButton = true,
}: ToasterProps) {
  return (
    <SonnerToaster
      position={position}
      richColors={richColors}
      expand={expand}
      duration={duration}
      closeButton={closeButton}
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
    />
  );
}
