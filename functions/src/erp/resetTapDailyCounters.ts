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

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// 🔒 FIX BUG-31: Firestore batch limit is 500 operations
const MAX_BATCH_OPS = 450;

// 🔒 FIX BUG-32: Add memory/timeout for functions that iterate all franchises
export const resetTapDailyCounters = onSchedule(
  {
    schedule: '1 0 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
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

          // 🔒 FIX BUG-31: Chunk batch operations to respect Firestore 500-op limit
          let batch = db.batch();
          let opCount = 0;
          for (const tapDoc of tapsSnap.docs) {
            batch.update(tapDoc.ref, {
              todayMlDispensed: 0,
              todaySessions: 0,
              todayWastageMl: 0,
              processedEvents: [], // 🔧 FIX R12-02: Limpar array de idempotência diariamente
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
            });
            opCount++;
            if (opCount >= MAX_BATCH_OPS) {
              await batch.commit();
              batch = db.batch();
              opCount = 0;
            }
          }
          if (opCount > 0) {
            await batch.commit();
          }

          console.log(`[ERP:ResetCounters] Reset ${tapsSnap.size} taps for ${franchiseId}/${storeId}`);
        } catch (err) {
          console.error(`[ERP:ResetCounters] Error resetting ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log('[ERP:ResetCounters] Done');
  });
