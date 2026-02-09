/**
 * ============================================================================
 * resetTapDailyCounters — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 1 0 * * * (00:01 BRT daily)
 *
 * Reseta contadores diarios de todas as torneiras:
 * todayMlDispensed=0, todaySessions=0, todayWastageMl=0
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

export const resetTapDailyCounters = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('1 0 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('[ERP:ResetCounters] Resetting tap daily counters');

    const franchisesSnap = await db.collection('franchises').get();

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();

      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        const storePath = `franchises/${franchiseId}/stores/${storeId}`;

        try {
          const tapsSnap = await db.collection(`${storePath}/taps`).get();

          if (tapsSnap.empty) continue;

          const batch = db.batch();
          for (const tapDoc of tapsSnap.docs) {
            batch.update(tapDoc.ref, {
              todayMlDispensed: 0,
              todaySessions: 0,
              todayWastageMl: 0,
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
            });
          }

          await batch.commit();
          console.log(`[ERP:ResetCounters] Reset ${tapsSnap.size} taps for ${franchiseId}/${storeId}`);
        } catch (err) {
          console.error(`[ERP:ResetCounters] Error resetting ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log('[ERP:ResetCounters] Done');
  });
