/**
 * ============================================================================
 * cleanupDedupCollections — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 4 * * * (04:00 BRT daily, after cleanupOldNotifications at 03:00)
 *
 * Deletes dedup markers older than 7 days from:
 * 1. `_webhookDedup` — Stripe webhook idempotency markers (stripeWebhook.ts)
 * 2. `analytics/daily/{date}/processedEvents` — aggOrders idempotency markers
 *
 * These collections grow indefinitely without cleanup.
 * 7-day retention is more than enough since Cloud Functions replays happen
 * within minutes, not days.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

const RETENTION_DAYS = 7;
const BATCH_SIZE = 400;

export const cleanupDedupCollections = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);

    let totalDeleted = 0;

    // --- 1. Cleanup _webhookDedup ---
    totalDeleted += await cleanupCollection(
      db.collection('_webhookDedup'),
      'processedAt',
      cutoff,
      '_webhookDedup'
    );

    // --- 2. Cleanup analytics/daily/*/processedEvents ---
    // Only scan daily docs older than retention period (date key format: YYYY-MM-DD)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    const dailyDocs = await db
      .collection('analytics/daily')
      .where(admin.firestore.FieldPath.documentId(), '<=', cutoffDateStr)
      .get();

    for (const dailyDoc of dailyDocs.docs) {
      const subCol = dailyDoc.ref.collection('processedEvents');
      const deleted = await cleanupCollection(subCol, 'ts', cutoff, `analytics/daily/${dailyDoc.id}/processedEvents`);
      totalDeleted += deleted;
    }

    console.log(`[cleanupDedup] Done. Total deleted: ${totalDeleted}`);
  }
);

async function cleanupCollection(
  collectionRef: admin.firestore.CollectionReference,
  timestampField: string,
  cutoff: admin.firestore.Timestamp,
  label: string
): Promise<number> {
  let deleted = 0;

  while (true) {
    const snap = await collectionRef
      .where(timestampField, '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deleted += snap.size;

    if (snap.size < BATCH_SIZE) break;
  }

  if (deleted > 0) {
    console.log(`[cleanupDedup] Deleted ${deleted} old entries from ${label}`);
  }

  return deleted;
}
