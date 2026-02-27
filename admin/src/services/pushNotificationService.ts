/**
 * ============================================================================
 * Push Notification Service
 * ============================================================================
 *
 * Client-side service for Firebase Cloud Messaging (FCM).
 * - Requests browser notification permission
 * - Obtains FCM device token
 * - Stores/removes token in Firestore (member document)
 * - Handles foreground messages
 */

import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import app from '@/lib/firebase';
import { db } from '@/lib/firebase';

// ── Singleton messaging instance ──────────────────────────────────────────────

let messagingInstance: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported();
  if (!supported) {
    console.warn('[PushNotification] Firebase Messaging não é suportado neste navegador.');
    return null;
  }
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Checks whether the browser supports push notifications.
 */
export async function isPushSupported(): Promise<boolean> {
  return isSupported();
}

/**
 * Requests notification permission, obtains the FCM token,
 * and saves it to the member's Firestore document.
 *
 * @returns The FCM token string, or null if denied / unsupported.
 */
export async function requestAndSavePushToken(
  franchiseId: string,
  userId: string,
): Promise<string | null> {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[PushNotification] Permissão negada pelo usuário.');
      return null;
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey) {
      console.warn('[PushNotification] VITE_FIREBASE_VAPID_KEY não configurada. Push desabilitado.');
      return null;
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
      ),
    });

    if (!token) {
      console.warn('[PushNotification] Não foi possível obter token FCM.');
      return null;
    }

    // Save token to member doc (arrayUnion avoids duplicates)
    const memberRef = doc(db, `franchises/${franchiseId}/members/${userId}`);
    await updateDoc(memberRef, { fcmTokens: arrayUnion(token) });

    console.log('[PushNotification] Token FCM salvo com sucesso.');
    return token;
  } catch (err) {
    console.error('[PushNotification] Erro ao configurar push:', err);
    return null;
  }
}

/**
 * Removes a specific FCM token from the member document.
 * Call this on logout or when the user disables notifications.
 */
export async function removePushToken(
  franchiseId: string,
  userId: string,
  token: string,
): Promise<void> {
  try {
    const memberRef = doc(db, `franchises/${franchiseId}/members/${userId}`);
    await updateDoc(memberRef, { fcmTokens: arrayRemove(token) });
    console.log('[PushNotification] Token FCM removido.');
  } catch (err) {
    console.error('[PushNotification] Erro ao remover token:', err);
  }
}

/**
 * Registers a foreground message handler.
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(
  callback: (payload: { title: string; body: string; data?: Record<string, string> }) => void,
): (() => void) | null {
  // We need a sync check here; caller should ensure messaging is ready.
  // getMessagingInstance is async, so we use a fire-and-forget pattern.
  let unsubscribe: (() => void) | null = null;

  getMessagingInstance().then((messaging) => {
    if (!messaging) return;
    unsubscribe = onMessage(messaging, (payload) => {
      callback({
        title: payload.notification?.title || payload.data?.title || 'Notificação',
        body: payload.notification?.body || payload.data?.message || '',
        data: payload.data as Record<string, string> | undefined,
      });
    });
  });

  // Return a wrapper that cleans up when available
  return () => {
    unsubscribe?.();
  };
}
