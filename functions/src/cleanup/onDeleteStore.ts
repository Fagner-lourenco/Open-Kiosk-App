/**
 * ADM-03/ADM-05: Cascade delete subcollections when a store is deleted.
 *
 * Firestore does NOT auto-delete subcollections. This trigger ensures
 * orphaned documents (products, orders, payments, settings, taps, etc.)
 * are cleaned up when a store document is removed.
 *
 * @module cleanup/onDeleteStore
 */

import * as functions from 'firebase-functions';
import { db } from '../lib';

/** Known subcollections under franchises/{fId}/stores/{sId} */
const STORE_SUBCOLLECTIONS = [
  'products',
  'orders',
  'payments',
  'settings',
  'dispensers',
  'taps',
  'servingSessions',
  'wastageEvents',
  'maintenanceLogs',
] as const;

const BATCH_LIMIT = 400; // Firestore batch max is 500, keep margin

/**
 * Delete all documents in a subcollection, in batches.
 */
async function deleteSubcollection(parentPath: string, subcollection: string): Promise<number> {
  const collRef = db.collection(`${parentPath}/${subcollection}`);
  let totalDeleted = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await collRef.limit(BATCH_LIMIT).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snap.size;

    if (snap.size < BATCH_LIMIT) break; // last batch
  }

  return totalDeleted;
}

/**
 * Firestore trigger: when a store doc is deleted, cascade-delete subcollections.
 */
export const onDeleteStore = functions
  .region('southamerica-east1')
  .firestore.document('franchises/{franchiseId}/stores/{storeId}')
  .onDelete(async (snapshot, context) => {
    const { franchiseId, storeId } = context.params;
    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    functions.logger.info('[onDeleteStore] Cascade delete started', { franchiseId, storeId });

    const results: Record<string, number> = {};

    for (const sub of STORE_SUBCOLLECTIONS) {
      try {
        const count = await deleteSubcollection(storePath, sub);
        if (count > 0) {
          results[sub] = count;
        }
      } catch (err) {
        functions.logger.error(`[onDeleteStore] Failed to delete ${sub}`, {
          franchiseId,
          storeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    functions.logger.info('[onDeleteStore] Cascade delete completed', {
      franchiseId,
      storeId,
      deleted: results,
    });
  });
