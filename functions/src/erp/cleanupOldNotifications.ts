/**
 * ============================================================================
 * cleanupOldNotifications — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 3 * * * (03:00 BRT daily)
 *
 * Deletes notifications older than 30 days (both read and dismissed).
 * Keeps unread notifications regardless of age to avoid data loss.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../lib';

const RETENTION_DAYS = 30;
const BATCH_SIZE = 400; // Firestore batch limit is 500

export const cleanupOldNotifications = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('0 3 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('[Cleanup] Starting notification cleanup');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);

    const franchisesSnap = await db.collection('franchises').get();
    let totalDeleted = 0;

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const notificationsRef = db.collection(`franchises/${franchiseId}/notifications`);

      // Delete old dismissed or read notifications
      const oldNotificationsSnap = await notificationsRef
        .where('createdAt', '<', cutoff)
        .where('isRead', '==', true)
        .limit(BATCH_SIZE)
        .get();

      if (oldNotificationsSnap.empty) continue;

      const batch = db.batch();
      oldNotificationsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += oldNotificationsSnap.size;

      console.log(`[Cleanup] Deleted ${oldNotificationsSnap.size} old notifications for franchise ${franchiseId}`);
    }

    console.log(`[Cleanup] Done. Total deleted: ${totalDeleted}`);
  });
