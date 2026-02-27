/**
 * Firebase Cloud Messaging - Service Worker
 *
 * Handles background push notifications when the admin app is not focused.
 * This file MUST be at the root of the public directory so it can register
 * with the correct scope.
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase config is injected at build time via env vars.
// For the SW, we only need the minimal config for messaging.
firebase.initializeApp({
  apiKey: 'PLACEHOLDER',
  projectId: 'PLACEHOLDER',
  messagingSenderId: 'PLACEHOLDER',
  appId: 'PLACEHOLDER',
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message received:', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || 'Open Kiosk';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.message || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.dedupeKey || undefined,
    data: {
      url: payload.data?.actionUrl || '/',
      franchiseId: payload.data?.franchiseId || '',
      storeId: payload.data?.storeId || '',
    },
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — navigate to the relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If there's already an open window, focus it and navigate
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'NOTIFICATION_CLICK', url });
            return;
          }
        }
        // Otherwise open a new window
        return clients.openWindow(url);
      }),
  );
});
