/**
 * ============================================================================
 * checkMaintenanceOverdue — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 8 * * * (08:00 BRT daily)
 *
 * Para cada maintenanceLog status='scheduled':
 * se scheduledAt < now → update status='overdue', cria notification.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

export const checkMaintenanceOverdue = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('0 8 * * *')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('[ERP:Maintenance] Checking overdue maintenance');

    const now = new Date();
    const franchisesSnap = await db.collection('franchises').get();

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();

      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        const storePath = `franchises/${franchiseId}/stores/${storeId}`;

        try {
          // Find scheduled maintenance with scheduledAt in the past
          const scheduledSnap = await db
            .collection(`${storePath}/maintenanceLogs`)
            .where('status', '==', 'scheduled')
            .where('scheduledAt', '<', now)
            .get();

          for (const logDoc of scheduledSnap.docs) {
            const data = logDoc.data();
            const logType = (data.type as string) || 'other';
            const tapId = data.tapId as string | null;

            // Update status to overdue
            await logDoc.ref.update({
              status: 'overdue',
              updatedAt: serverTimestamp(),
              updatedBy: 'system',
            });

            // Create notification
            const notifRef = db.collection(`${storePath}/notifications`).doc();
            await notifRef.set({
              id: notifRef.id,
              type: 'maintenance_overdue',
              severity: 'warning',
              message: `Manutencao atrasada: ${logType}${tapId && tapId !== 'all' ? ` (T${Number(tapId) + 1})` : ''}`,
              createdAt: serverTimestamp(),
              readAt: null,
              entityRef: `maintenanceLogs/${logDoc.id}`,
              storeId,
              franchiseId,
            });

            console.log(`[ERP:Maintenance] Marked overdue: ${logDoc.id}`);
          }
        } catch (err) {
          console.error(`[ERP:Maintenance] Error checking ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log('[ERP:Maintenance] Done');
  });
