/**
 * ============================================================================
 * Migration: Dispensers → Taps
 * ============================================================================
 *
 * One-time migration to copy configuration from legacy dispensers[] field
 * to canonical taps[] field for all stores.
 *
 * What it does:
 * 1. Scans all franchises/{fId}/stores/{sId} documents
 * 2. If taps[] already exists and has data, SKIPS (idempotent)
 * 3. If dispensers[] exists, converts to taps[] format
 * 4. Maps mlPerPulse → calibration.pulsesPerLiter (inverse formula)
 * 5. Does NOT invent mlPerSecond from flowTimeout (different concepts)
 * 6. Logs per-store before/after counts
 *
 * Auth: Requires superadmin or owner/admin role (matches unifyStoreSettings)
 *
 * Usage (Firebase callable):
 *   { dryRun: true }   → preview
 *   { commit: true }    → execute
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, admin, requireAuth } from '../lib';

interface MigrateInput {
  dryRun?: boolean;
  commit?: boolean;
  franchiseId?: string; // optional: scope to single franchise
  storeId?: string;     // optional: scope to single store (requires franchiseId)
}

interface TapConfigMigrated {
  id: number;
  name: string;
  enabled: boolean;
  calibration?: {
    pulsesPerLiter?: number;
    // mlPerSecond NOT derived from flowTimeout
  };
  productId?: string;
}

/**
 * Converts DispenserConfig[] to canonical TapConfig[] for Firestore.
 * Maps mlPerPulse → calibration.pulsesPerLiter using inverse formula (1000 / mlPerPulse).
 * Does NOT derive mlPerSecond from flowTimeout (different concepts).
 * No magic defaults — consumer layers handle missing values.
 */
function convertDispensersToTaps(dispensers: any[]): TapConfigMigrated[] {
  return dispensers.map((d: any) => ({
    id: d.id,
    name: d.name,
    enabled: d.enabled,
    calibration: d.calibration ? {
      pulsesPerLiter: (d.calibration.mlPerPulse && d.calibration.mlPerPulse > 0)
        ? Math.round(1000 / d.calibration.mlPerPulse)
        : undefined,
      // flowTimeout is a timeout, NOT a flow rate; don't convert
    } : undefined,
    productId: d.productId,
  }));
}

export const migrateDispensersToTaps = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as MigrateInput;
    // Auth guard — same pattern as unifyStoreSettings
    requireAuth(request);

    const role = request.auth?.token?.role as string | undefined;
    const isSuperAdmin = role === 'superadmin';
    const isOwnerAdmin = role === 'owner' || role === 'admin';

    if (!isSuperAdmin && !isOwnerAdmin) {
      throw new HttpsError('permission-denied', 'Requires superadmin, owner, or admin role.');
    }

    const dryRun = data.dryRun ?? !data.commit;

    console.log(`[migrateDispensersToTaps] Starting migration (dryRun=${dryRun})`);

    let totalStores = 0;
    let storesToMigrate = 0;
    let storesAlreadyMigrated = 0;
    let storesNoDispensers = 0;
    let errors = 0;

    const results: Array<{
      franchiseId: string;
      storeId: string;
      status: 'migrated' | 'already_migrated' | 'no_dispensers' | 'error';
      dispensersCount?: number;
      tapsCount?: number;
      message?: string;
    }> = [];

    try {
      // Scope: single franchise or all
      let franchiseIds: string[];
      if (data.franchiseId) {
        franchiseIds = [data.franchiseId];
      } else {
        const franchisesSnapshot = await db.collection('franchises').get();
        franchiseIds = franchisesSnapshot.docs.map(d => d.id);
      }

      for (const franchiseId of franchiseIds) {
        // Scope: single store or all in franchise
        let storeDocs: FirebaseFirestore.QueryDocumentSnapshot[];
        if (data.storeId && data.franchiseId === franchiseId) {
          const storeDoc = await db.doc(`franchises/${franchiseId}/stores/${data.storeId}`).get();
          if (!storeDoc.exists) continue;
          storeDocs = [storeDoc as any];
        } else {
          const storesSnapshot = await db.collection(`franchises/${franchiseId}/stores`).get();
          storeDocs = storesSnapshot.docs;
        }

        for (const storeDoc of storeDocs) {
          const storeId = storeDoc.id;
          const storeData = storeDoc.data();
          totalStores++;

          try {
            // IDEMPOTENT: skip if taps[] already has data
            if (Array.isArray(storeData.taps) && storeData.taps.length > 0) {
              console.log(`[${franchiseId}/${storeId}] Already has taps[${storeData.taps.length}], skipping`);
              storesAlreadyMigrated++;
              results.push({
                franchiseId,
                storeId,
                status: 'already_migrated',
                tapsCount: storeData.taps.length,
              });
              continue;
            }

            // No dispensers to convert
            if (!Array.isArray(storeData.dispensers) || storeData.dispensers.length === 0) {
              console.log(`[${franchiseId}/${storeId}] No dispensers[], skipping`);
              storesNoDispensers++;
              results.push({
                franchiseId,
                storeId,
                status: 'no_dispensers',
              });
              continue;
            }

            // Convert
            const taps = convertDispensersToTaps(storeData.dispensers);
            storesToMigrate++;

            console.log(`[${franchiseId}/${storeId}] Converting ${storeData.dispensers.length} dispensers → ${taps.length} taps`);

            if (!dryRun) {
              await storeDoc.ref.update({
                taps,
                tapsVersion: admin.firestore.FieldValue.increment(1),
                tapsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              console.log(`[${franchiseId}/${storeId}] Migrated successfully`);
            } else {
              console.log(`[${franchiseId}/${storeId}] DRY RUN - would migrate ${taps.length} taps`);
            }

            results.push({
              franchiseId,
              storeId,
              status: 'migrated',
              dispensersCount: storeData.dispensers.length,
              tapsCount: taps.length,
            });

          } catch (err: any) {
            console.error(`[${franchiseId}/${storeId}] Error:`, err);
            errors++;
            results.push({
              franchiseId,
              storeId,
              status: 'error',
              message: err.message,
            });
          }
        }
      }

      return {
        success: true,
        dryRun,
        totalStores,
        storesToMigrate,
        storesAlreadyMigrated,
        storesNoDispensers,
        errors,
        results,
      };

    } catch (err: any) {
      console.error('[migrateDispensersToTaps] Fatal error:', err);
      throw new HttpsError('internal', err.message);
    }
  });
