/**
 * ============================================================================
 * Migration: Unify Store Settings
 * ============================================================================
 *
 * Migrates store-level settings from legacy fields and sub-documents
 * to canonical field names in the main store document.
 *
 * What it does:
 * 1. Reads `settings/attract_video` sub-doc and copies to `attractVideoConfig` in store doc
 * 2. Renames: `kioskMode` → `kioskEnabled`, `idleTimeout` → `attractTimeoutSeconds`
 * 3. Normalizes language: `en-US` → `en`
 * 4. Sets `_migrationVersion: 2` on the store doc
 * 5. Does NOT delete legacy fields/docs (kept for rollback safety)
 *
 * @see Plan: hashed-leaping-liskov.md (Phase 4)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, admin, requireAuth } from '../lib';

interface UnifyStoreSettingsInput {
  dryRun?: boolean;
  commit?: boolean;
  franchiseId?: string;
  storeId?: string;
}

const TARGET_MIGRATION_VERSION = 2;

export const unifyStoreSettings = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as UnifyStoreSettingsInput;
    requireAuth(request);

    const role = request.auth?.token?.role as string | undefined;
    const isSuperAdmin = role === 'superadmin';
    const isOwnerAdmin = role === 'owner' || role === 'admin';

    if (!isSuperAdmin && !isOwnerAdmin) {
      throw new HttpsError('permission-denied', 'Sem permissao para executar migracao.');
    }

    const dryRun = data.dryRun ?? !data.commit;

    const runId = `${Date.now()}`;
    const runRef = db.doc(`migrations/unifyStoreSettings/${runId}`);
    const runMeta = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      dryRun,
      franchiseId: data.franchiseId || null,
      storeId: data.storeId || null,
      executedBy: request.auth?.uid || null,
      targetVersion: TARGET_MIGRATION_VERSION,
    };

    // Collect target stores
    const targets: Array<{ franchiseId: string; storeId: string }> = [];

    if (data.franchiseId && data.storeId) {
      targets.push({ franchiseId: data.franchiseId, storeId: data.storeId });
    } else if (data.franchiseId) {
      const storesSnap = await db.collection(`franchises/${data.franchiseId}/stores`).get();
      storesSnap.forEach((doc) => targets.push({ franchiseId: data.franchiseId!, storeId: doc.id }));
    } else {
      if (!isSuperAdmin) {
        throw new HttpsError('permission-denied', 'Somente superadmin pode migrar todas as franquias.');
      }
      const franchisesSnap = await db.collection('franchises').get();
      for (const franchise of franchisesSnap.docs) {
        const storesSnap = await db.collection(`franchises/${franchise.id}/stores`).get();
        storesSnap.forEach((doc) => targets.push({ franchiseId: franchise.id, storeId: doc.id }));
      }
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const affected: Array<{ franchiseId: string; storeId: string; changes: string[] }> = [];

    for (const target of targets) {
      const storeRef = db.doc(`franchises/${target.franchiseId}/stores/${target.storeId}`);
      const storeSnap = await storeRef.get();
      if (!storeSnap.exists) {
        skippedCount++;
        continue;
      }

      const storeData = storeSnap.data() as Record<string, unknown>;

      // Skip if already migrated
      if ((storeData._migrationVersion as number) >= TARGET_MIGRATION_VERSION) {
        skippedCount++;
        continue;
      }

      const changes: string[] = [];
      const updates: Record<string, unknown> = {};

      // 1. Rename kioskMode → kioskEnabled
      if (storeData.kioskMode !== undefined && storeData.kioskEnabled === undefined) {
        updates.kioskEnabled = storeData.kioskMode;
        changes.push(`kioskMode(${storeData.kioskMode}) → kioskEnabled`);
      }

      // 2. Rename idleTimeout → attractTimeoutSeconds
      if (storeData.idleTimeout !== undefined && storeData.attractTimeoutSeconds === undefined) {
        updates.attractTimeoutSeconds = storeData.idleTimeout;
        changes.push(`idleTimeout(${storeData.idleTimeout}) → attractTimeoutSeconds`);
      }

      // 3. Normalize language
      if (storeData.language === 'en-US') {
        updates.language = 'en';
        changes.push('language en-US → en');
      }

      // 4. Promote attract_video sub-doc to attractVideoConfig
      if (storeData.attractVideoConfig === undefined) {
        const videoDocRef = db.doc(
          `franchises/${target.franchiseId}/stores/${target.storeId}/settings/attract_video`
        );
        const videoSnap = await videoDocRef.get();
        if (videoSnap.exists) {
          const videoData = videoSnap.data() as Record<string, unknown>;
          updates.attractVideoConfig = {
            isEnabled: videoData.isEnabled ?? false,
            videoUrl: videoData.videoUrl,
            displayTitle: videoData.displayTitle,
            displaySubtitle: videoData.displaySubtitle,
            videoOpacity: videoData.videoOpacity ?? 0.4,
            videoCoverMode: videoData.videoCoverMode ?? 'cover',
          };
          changes.push('settings/attract_video → attractVideoConfig');
        }
      }

      // 5. Set migration version
      updates._migrationVersion = TARGET_MIGRATION_VERSION;

      if (changes.length > 0) {
        // Save before-snapshot for rollback
        if (!dryRun) {
          await runRef.collection('stores').doc(`${target.franchiseId}_${target.storeId}`).set({
            franchiseId: target.franchiseId,
            storeId: target.storeId,
            before: storeData,
            changes,
          });

          updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          await storeRef.update(updates);
        }

        updatedCount++;
        affected.push({ ...target, changes });
      } else {
        // No changes needed but stamp version
        if (!dryRun) {
          await storeRef.update({
            _migrationVersion: TARGET_MIGRATION_VERSION,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        skippedCount++;
      }
    }

    // Log run metadata
    if (!dryRun) {
      await runRef.set({ ...runMeta, updatedCount, skippedCount, totalTargets: targets.length });
    }

    return {
      runId,
      dryRun,
      totalTargets: targets.length,
      updatedCount,
      skippedCount,
      affected,
    };
  });
