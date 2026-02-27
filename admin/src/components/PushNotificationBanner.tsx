/**
 * ============================================================================
 * PushNotificationBanner
 * ============================================================================
 *
 * A dismissible banner that prompts the user to enable push notifications.
 * Shows in the top of the layout when notifications haven't been granted yet.
 * Also displays a toast when a foreground message arrives.
 */

import { useEffect } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

interface PushNotificationBannerProps {
  franchiseId: string | undefined;
  userId: string | undefined;
}

export function PushNotificationBanner({ franchiseId, userId }: PushNotificationBannerProps) {
  const {
    isSupported,
    permissionStatus,
    isRequesting,
    lastMessage,
    enablePush,
  } = usePushNotifications(franchiseId, userId);

  // Show toast for foreground messages
  useEffect(() => {
    if (!lastMessage) return;
    toast.info(lastMessage.title, {
      description: lastMessage.body,
      action: lastMessage.data?.actionUrl
        ? {
            label: 'Ver',
            onClick: () => {
              window.location.href = lastMessage.data!.actionUrl!;
            },
          }
        : undefined,
    });
  }, [lastMessage]);

  // Don't render if unsupported, already granted, or denied (can't re-ask)
  if (!isSupported) return null;
  if (permissionStatus === 'loading') return null;
  if (permissionStatus === 'granted') return null;
  if (permissionStatus === 'denied') return null;
  if (!franchiseId || !userId) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center gap-3 text-sm">
      <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
      <span className="flex-1 text-blue-800 dark:text-blue-200">
        Ative as notificações push para receber alertas em tempo real.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
        onClick={enablePush}
        disabled={isRequesting}
      >
        {isRequesting ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <Bell className="h-3 w-3 mr-1" />
        )}
        Ativar
      </Button>
    </div>
  );
}
