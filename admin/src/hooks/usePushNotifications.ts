/**
 * ============================================================================
 * usePushNotifications Hook
 * ============================================================================
 *
 * React hook for managing FCM push notification state:
 * - Checks browser support
 * - Tracks permission status
 * - Requests permission & saves token
 * - Listens for foreground messages
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isPushSupported,
  requestAndSavePushToken,
  removePushToken,
  onForegroundMessage,
} from '@/services/pushNotificationService';

export interface ForegroundMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface UsePushNotificationsReturn {
  /** Whether the browser supports push notifications */
  isSupported: boolean;
  /** Current Notification.permission value */
  permissionStatus: NotificationPermission | 'loading';
  /** The active FCM token, if any */
  fcmToken: string | null;
  /** Whether a request is in flight */
  isRequesting: boolean;
  /** Last foreground message received */
  lastMessage: ForegroundMessage | null;
  /** Request permission and register the token */
  enablePush: () => Promise<void>;
  /** Remove stored token (e.g., on logout) */
  disablePush: () => Promise<void>;
}

export function usePushNotifications(
  franchiseId: string | undefined,
  userId: string | undefined,
): UsePushNotificationsReturn {
  const [supported, setSupported] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | 'loading'>('loading');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [lastMessage, setLastMessage] = useState<ForegroundMessage | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Check support & current permission on mount
  useEffect(() => {
    isPushSupported().then(setSupported);
    if (typeof Notification !== 'undefined') {
      setPermissionStatus(Notification.permission);
    } else {
      setPermissionStatus('denied');
    }
  }, []);

  // Set up foreground listener
  useEffect(() => {
    if (!supported) return;

    const unsub = onForegroundMessage((msg) => {
      setLastMessage(msg);
    });

    unsubRef.current = unsub;
    return () => {
      unsub?.();
      unsubRef.current = null;
    };
  }, [supported]);

  const enablePush = useCallback(async () => {
    if (!franchiseId || !userId || !supported) return;
    setIsRequesting(true);
    try {
      const token = await requestAndSavePushToken(franchiseId, userId);
      if (token) {
        setFcmToken(token);
        setPermissionStatus('granted');
      } else {
        setPermissionStatus(Notification.permission);
      }
    } finally {
      setIsRequesting(false);
    }
  }, [franchiseId, userId, supported]);

  const disablePush = useCallback(async () => {
    if (!franchiseId || !userId || !fcmToken) return;
    await removePushToken(franchiseId, userId, fcmToken);
    setFcmToken(null);
  }, [franchiseId, userId, fcmToken]);

  return {
    isSupported: supported,
    permissionStatus,
    fcmToken,
    isRequesting,
    lastMessage,
    enablePush,
    disablePush,
  };
}
