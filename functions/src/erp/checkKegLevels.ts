/**
 * ============================================================================
 * checkKegLevels — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 8 * * * (08:00 BRT daily)
 *
 * Verifica niveis de barris ativos:
 * - remainingMl < volumeMl * 0.15 → notification keg_low
 * - expiresAt < now + 3 dias → notification keg_expiring
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

export const checkKegLevels = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('0 8 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('[ERP:KegLevels] Checking keg levels');

    const franchisesSnap = await db.collection('franchises').get();

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();

      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        const storePath = `franchises/${franchiseId}/stores/${storeId}`;

        try {
          // Check tapped kegs
          const kegsSnap = await db
            .collection(`${storePath}/kegs`)
            .where('status', '==', 'tapped')
            .get();

          const threeDaysFromNow = new Date();
          threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

          for (const kegDoc of kegsSnap.docs) {
            const data = kegDoc.data();
            const volumeMl = (data.volumeMl as number) || 0;
            const remainingMl = (data.remainingMl as number) || 0;
            const expiresAt = data.expiresAt?.toDate?.() || null;
            const batchCode = (data.batchCode as string) || kegDoc.id.slice(0, 8);

            // Check low level (< 15%)
            if (volumeMl > 0 && remainingMl < volumeMl * 0.15) {
              const pct = Math.round((remainingMl / volumeMl) * 100);
              const notifRef = db.collection(`${storePath}/notifications`).doc();
              await notifRef.set({
                id: notifRef.id,
                type: 'keg_low',
                severity: pct <= 5 ? 'critical' : 'warning',
                message: `Barril ${batchCode} com nivel baixo: ${pct}% restante (${Math.round(remainingMl)}ml)`,
                createdAt: serverTimestamp(),
                readAt: null,
                entityRef: `kegs/${kegDoc.id}`,
                storeId,
                franchiseId,
              });
              console.log(`[ERP:KegLevels] Low keg: ${kegDoc.id} at ${pct}%`);
            }

            // Check expiring
            if (expiresAt && expiresAt.getTime() < threeDaysFromNow.getTime()) {
              const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
              const notifRef = db.collection(`${storePath}/notifications`).doc();
              await notifRef.set({
                id: notifRef.id,
                type: 'keg_expiring',
                severity: daysLeft <= 0 ? 'critical' : 'warning',
                message: daysLeft <= 0
                  ? `Barril ${batchCode} EXPIRADO!`
                  : `Barril ${batchCode} expira em ${daysLeft} dia(s)`,
                createdAt: serverTimestamp(),
                readAt: null,
                entityRef: `kegs/${kegDoc.id}`,
                storeId,
                franchiseId,
              });
              console.log(`[ERP:KegLevels] Expiring keg: ${kegDoc.id} in ${daysLeft} days`);
            }
          }
        } catch (err) {
          console.error(`[ERP:KegLevels] Error checking ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log('[ERP:KegLevels] Done');
  });
