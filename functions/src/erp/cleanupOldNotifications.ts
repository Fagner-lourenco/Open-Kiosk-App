/**
 * ============================================================================
 * cleanupOldNotifications — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 3 * * * (03:00 BRT daily)
 *
 * Deletes notifications older than 30 days when they are read OR dismissed.
 * Keeps unread + non-dismissed notifications regardless of age to avoid data loss.
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
      let deletedForFranchise = 0;

      while (true) {
        // Firestore does not support OR with simple where-chain in all environments,
        // so we query read and dismissed separately and merge by doc id.
        const [readSnap, dismissedSnap] = await Promise.all([
          notificationsRef
            .where('createdAt', '<', cutoff)
            .where('isRead', '==', true)
            .limit(BATCH_SIZE)
            .get(),
          notificationsRef
            .where('createdAt', '<', cutoff)
            .where('isDismissed', '==', true)
            .limit(BATCH_SIZE)
            .get(),
        ]);

        const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        for (const doc of readSnap.docs) docsById.set(doc.id, doc);
        for (const doc of dismissedSnap.docs) docsById.set(doc.id, doc);

        const docsToDelete = Array.from(docsById.values()).slice(0, BATCH_SIZE);
        if (docsToDelete.length === 0) break;

        const batch = db.batch();
        docsToDelete.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();

        deletedForFranchise += docsToDelete.length;
        totalDeleted += docsToDelete.length;

        // If we didn't fill the batch, there is likely no more work for this franchise.
        if (docsToDelete.length < BATCH_SIZE) break;
      }

      if (deletedForFranchise > 0) {
        console.log(`[Cleanup] Deleted ${deletedForFranchise} old notifications for franchise ${franchiseId}`);
      }
    }

    console.log(`[Cleanup] Done. Total deleted: ${totalDeleted}`);
  });
