/**
 * ============================================================================
 * cleanupKegProcessedEvents — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 4 * * * (04:00 BRT daily)
 *
 * Para cada keg com status 'depleted' ou 'returned':
 * limpa o array processedEvents (usado para idempotência, sem valor após
 * finalização do barril).
 *
 * Previne crescimento ilimitado do documento do keg no Firestore.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

export const cleanupKegProcessedEvents = onSchedule(
  { schedule: '0 4 * * *', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    console.log('[ERP:KegCleanup] Starting processedEvents cleanup');

    let totalCleaned = 0;
    const franchisesSnap = await db.collection('franchises').get();

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();

      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        const storePath = `franchises/${franchiseId}/stores/${storeId}`;

        try {
          // Find finalized kegs that still have processedEvents
          for (const status of ['depleted', 'returned'] as const) {
            const kegsSnap = await db
              .collection(`${storePath}/kegs`)
              .where('status', '==', status)
              .get();

            const batch = db.batch();
            let batchCount = 0;

            for (const kegDoc of kegsSnap.docs) {
              const data = kegDoc.data();
              const processedEvents: unknown[] = data.processedEvents || [];
              if (processedEvents.length === 0) continue;

              batch.update(kegDoc.ref, {
                processedEvents: [],
                updatedAt: serverTimestamp(),
                updatedBy: 'system',
              });
              batchCount++;

              // Firestore batch limit is 500
              if (batchCount >= 490) {
                await batch.commit();
                totalCleaned += batchCount;
                batchCount = 0;
              }
            }

            if (batchCount > 0) {
              await batch.commit();
              totalCleaned += batchCount;
            }
          }
        } catch (err) {
          console.error(`[ERP:KegCleanup] Error in ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log(`[ERP:KegCleanup] Done — cleaned ${totalCleaned} kegs`);
  });
