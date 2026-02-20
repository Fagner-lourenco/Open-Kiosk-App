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

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// 🔒 FIX BUG-32: Add memory/timeout for franchise-wide iteration
export const checkMaintenanceOverdue = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
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

            // Dedupe: avoid duplicate notifications for the same maintenance log on same day
            const today = new Date().toISOString().slice(0, 10);
            const dedupeKey = `maintenance_overdue_${logDoc.id}_${today}`;
            const existingSnap = await db.collection(`franchises/${franchiseId}/notifications`)
              .where('dedupeKey', '==', dedupeKey).limit(1).get();

            if (existingSnap.empty) {
              // Create notification at franchise-level (admin UI reads this path)
              const notifRef = db.collection(`franchises/${franchiseId}/notifications`).doc();
              await notifRef.set({
                id: notifRef.id,
                type: 'warning',
                priority: 'high',
                title: 'Manutenção Atrasada',
                message: `Manutencao atrasada: ${logType}${tapId && tapId !== 'all' ? ` (T${Number(tapId) + 1})` : ''}`,
                isRead: false,
                isDismissed: false,
                createdAt: serverTimestamp(),
                readAt: null,
                entityRef: `maintenanceLogs/${logDoc.id}`,
                storeId,
                franchiseId,
                dedupeKey,
                actionUrl: `/stores/${storeId}?tab=operations`,
                actionLabel: 'Ver Operações',
              });
            } else {
              console.log(`[ERP:Maintenance] Skipped duplicate for ${logDoc.id} (${dedupeKey})`);
            }

            console.log(`[ERP:Maintenance] Marked overdue: ${logDoc.id}`);
          }
        } catch (err) {
          console.error(`[ERP:Maintenance] Error checking ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log('[ERP:Maintenance] Done');
  });
