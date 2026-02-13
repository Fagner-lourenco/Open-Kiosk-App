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
              // Dedupe: avoid duplicate notifications for the same keg on same day
              const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
              const dedupeKey = `keg_low_${kegDoc.id}_${today}`;
              const existingSnap = await db.collection(`franchises/${franchiseId}/notifications`)
                .where('dedupeKey', '==', dedupeKey).limit(1).get();
              if (existingSnap.empty) {
                const notifRef = db.collection(`franchises/${franchiseId}/notifications`).doc();
                await notifRef.set({
                  id: notifRef.id,
                  type: 'stock',
                  priority: pct <= 5 ? 'critical' : 'high',
                  title: 'Barril com Nível Baixo',
                  message: `Barril ${batchCode} com nivel baixo: ${pct}% restante (${Math.round(remainingMl)}ml)`,
                  isRead: false,
                  isDismissed: false,
                  createdAt: serverTimestamp(),
                  readAt: null,
                  entityRef: `kegs/${kegDoc.id}`,
                  storeId,
                  franchiseId,
                  dedupeKey,
                  actionUrl: `/stores/${storeId}?tab=operations`,
                  actionLabel: 'Ver Operações',
                });
                console.log(`[ERP:KegLevels] Low keg: ${kegDoc.id} at ${pct}%`);
              } else {
                console.log(`[ERP:KegLevels] Skipped duplicate for keg ${kegDoc.id} (${dedupeKey})`);
              }
            }

            // Check expiring
            if (expiresAt && expiresAt.getTime() < threeDaysFromNow.getTime()) {
              const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
              // Dedupe: avoid duplicate notifications for the same keg on same day
              const today = new Date().toISOString().slice(0, 10);
              const dedupeKey = `keg_expiring_${kegDoc.id}_${today}`;
              const existingSnap = await db.collection(`franchises/${franchiseId}/notifications`)
                .where('dedupeKey', '==', dedupeKey).limit(1).get();
              if (existingSnap.empty) {
                const notifRef = db.collection(`franchises/${franchiseId}/notifications`).doc();
                await notifRef.set({
                  id: notifRef.id,
                  type: 'stock',
                  priority: daysLeft <= 0 ? 'critical' : 'high',
                  title: daysLeft <= 0 ? 'Barril Expirado' : 'Barril Próximo do Vencimento',
                  message: daysLeft <= 0
                    ? `Barril ${batchCode} EXPIRADO!`
                    : `Barril ${batchCode} expira em ${daysLeft} dia(s)`,
                  isRead: false,
                  isDismissed: false,
                  createdAt: serverTimestamp(),
                  readAt: null,
                  entityRef: `kegs/${kegDoc.id}`,
                  storeId,
                  franchiseId,
                  dedupeKey,
                  actionUrl: `/stores/${storeId}?tab=operations`,
                  actionLabel: 'Ver Operações',
                });
                console.log(`[ERP:KegLevels] Expiring keg: ${kegDoc.id} in ${daysLeft} days`);
              } else {
                console.log(`[ERP:KegLevels] Skipped duplicate for keg ${kegDoc.id} (${dedupeKey})`);
              }
            }
          }
        } catch (err) {
          console.error(`[ERP:KegLevels] Error checking ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log('[ERP:KegLevels] Done');
  });
