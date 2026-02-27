/**
 * ============================================================================
 * sendPushNotification — Cloud Function
 * ============================================================================
 *
 * Triggered when a new notification document is created at:
 *   franchises/{franchiseId}/notifications/{notificationId}
 *
 * Reads all active members of the franchise (optionally filtered by store),
 * collects their FCM tokens, and sends a multicast push notification
 * via Firebase Admin Messaging.
 *
 * Token cleanup: if a token is invalid (NOT_REGISTERED, INVALID_ARGUMENT),
 * it is automatically removed from the member document.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';

const db = getFirestore();

export const sendPushNotification = onDocumentCreated(
  {
    document: 'franchises/{franchiseId}/notifications/{notificationId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const { franchiseId } = event.params;
    const storeId = (data.storeId as string) || null;

    // Build the notification content
    const title = (data.title as string) || 'Open Kiosk';
    const message = (data.message as string) || '';
    const priority = (data.priority as string) || 'normal';
    const actionUrl = (data.actionUrl as string) || '/';

    // ── Collect FCM tokens from franchise members ─────────────────────────
    let membersQuery = db.collection(`franchises/${franchiseId}/members`)
      .where('isActive', '!=', false);

    // If notification is store-specific, filter members with access to that store
    // Note: Firestore inequality filters can only be on one field, so we filter
    // storeAccess in memory.
    const membersSnap = await membersQuery.get();

    interface TokenEntry {
      memberRef: FirebaseFirestore.DocumentReference;
      token: string;
    }

    const tokenEntries: TokenEntry[] = [];

    for (const memberDoc of membersSnap.docs) {
      const memberData = memberDoc.data();
      const tokens = memberData.fcmTokens as string[] | undefined;
      if (!tokens || tokens.length === 0) continue;

      // Store access check
      if (storeId) {
        const storeAccess = memberData.storeAccess as string[] | undefined;
        if (storeAccess && !storeAccess.includes('*') && !storeAccess.includes(storeId)) {
          continue; // Member doesn't have access to this store
        }
      }

      for (const token of tokens) {
        tokenEntries.push({ memberRef: memberDoc.ref, token });
      }
    }

    if (tokenEntries.length === 0) {
      logger.info(`[sendPush] Nenhum token FCM encontrado para franchise=${franchiseId}`);
      return;
    }

    const tokens = tokenEntries.map((e) => e.token);
    logger.info(`[sendPush] Enviando push para ${tokens.length} token(s), franchise=${franchiseId}`);

    // ── Send multicast ────────────────────────────────────────────────────
    const messaging = getMessaging();

    const fcmMessage = {
      tokens,
      notification: {
        title,
        body: message,
      },
      data: {
        franchiseId,
        storeId: storeId || '',
        actionUrl,
        priority,
        notificationId: event.params.notificationId,
        dedupeKey: (data.dedupeKey as string) || '',
      },
      webpush: {
        fcmOptions: {
          link: actionUrl,
        },
        notification: {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: (data.dedupeKey as string) || undefined,
        },
      },
    };

    const response = await messaging.sendEachForMulticast(fcmMessage);

    logger.info(
      `[sendPush] Resultado: ${response.successCount} sucesso, ${response.failureCount} falha(s)`,
    );

    // ── Clean up invalid tokens ───────────────────────────────────────────
    if (response.failureCount > 0) {
      const removePromises: Promise<void>[] = [];

      response.responses.forEach((resp, idx) => {
        if (resp.success) return;

        const errorCode = resp.error?.code;
        // Remove tokens that are permanently invalid
        if (
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/invalid-argument'
        ) {
          const entry = tokenEntries[idx];
          logger.warn(`[sendPush] Removendo token inválido (${errorCode}): ${entry.token.slice(0, 20)}...`);
          removePromises.push(
            entry.memberRef.update({
              fcmTokens: FieldValue.arrayRemove(entry.token),
            }).then(() => {}),
          );
        }
      });

      if (removePromises.length > 0) {
        await Promise.all(removePromises);
        logger.info(`[sendPush] ${removePromises.length} token(s) inválido(s) removido(s).`);
      }
    }
  },
);
