/**
 * ADM-03/ADM-05: Cascade delete subcollections when a store is deleted.
 *
 * Firestore does not auto-delete subcollections. This trigger removes
 * known store subcollections and nested descendants when a store doc is removed.
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
  'dailyStats',
  'metrics',
  'kegs',
  'tapAssignments',
  'devices',
  'hardware',
  'tvConfig',
  'eventStats',
  'finAccounts',
  'finBills',
  'finCategories',
  'finCostCenters',
  'finLedger',
  'finInvoices',
  'finParties',
  'finPayments',
  'calendarItems',
  'customers',
  'deals',
  'commercialEvents',
  'quotes',
  'rankingAgg',
  'challenges',
  'prizes',
] as const;

const BATCH_LIMIT = 400; // Firestore batch max is 500, keep margin

async function deleteSubcollectionBatch(parentPath: string, subcollection: string): Promise<number> {
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

    if (snap.size < BATCH_LIMIT) break;
  }

  return totalDeleted;
}

/**
 * Delete a known subcollection and all nested descendants.
 */
async function deleteSubcollection(parentPath: string, subcollection: string): Promise<number> {
  const collRef = db.collection(`${parentPath}/${subcollection}`);
  const probe = await collRef.limit(1).get();
  if (probe.empty) return 0;

  if (typeof (db as any).recursiveDelete === 'function') {
    await (db as any).recursiveDelete(collRef);
    return -1;
  }

  return deleteSubcollectionBatch(parentPath, subcollection);
}

/**
 * Firestore trigger: when a store doc is deleted, cascade-delete subcollections.
 */
export const onDeleteStore = functions
  .region('southamerica-east1')
  .firestore.document('franchises/{franchiseId}/stores/{storeId}')
  .onDelete(async (_snapshot, context) => {
    const { franchiseId, storeId } = context.params;
    const storePath = `franchises/${franchiseId}/stores/${storeId}`;

    functions.logger.info('[onDeleteStore] Cascade delete started', { franchiseId, storeId });

    const results: Record<string, number> = {};

    for (const sub of STORE_SUBCOLLECTIONS) {
      try {
        const count = await deleteSubcollection(storePath, sub);
        if (count !== 0) {
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
