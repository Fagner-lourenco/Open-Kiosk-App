/**
 * ============================================================================
 * aggregateOperationalDaily — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 2 * * * (02:00 BRT daily)
 *
 * Agrega dados operacionais do dia anterior por loja:
 * - Total ml dispensado, ml wasted, % wastage, sessoes por tap
 * - Escreve campo `operational{}` em dailyStats/{yesterday}
 * - Escreve franchises/{fId}/metrics/operational (cross-store)
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// ============================================================================
// HELPERS
// ============================================================================

function getYesterdayKey(): string {
  // 🔧 FIX Audit-R2: Usar BRT (UTC-3) para alinhar com getYesterdayRange()
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  brtNow.setDate(brtNow.getDate() - 1);
  const y = brtNow.getUTCFullYear();
  const m = String(brtNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(brtNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterdayRange(): { start: Date; end: Date } {
  // 🔧 FIX R11-01: Usar limites BRT (UTC-3) para alinhar com dados de vendas
  const now = new Date();
  // Converter para BRT: subtrair 3 horas do UTC
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = brtNow.getUTCFullYear();
  const m = String(brtNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(brtNow.getUTCDate()).padStart(2, '0');
  const todayBRT = `${y}-${m}-${d}`;
  // Meia-noite de hoje em BRT = 03:00 UTC
  const end = new Date(`${todayBRT}T03:00:00.000Z`);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { start, end };
}

// ============================================================================
// FUNCTION
// ============================================================================

export const aggregateOperationalDaily = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1' },
  async () => {
    const dateKey = getYesterdayKey();
    const { start, end } = getYesterdayRange();

    console.log(`[ERP:AggDaily] Aggregating operational data for ${dateKey}`);

    // Get all franchises
    const franchisesSnap = await db.collection('franchises').get();

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();

      let franchiseTotalMl = 0;
      let franchiseTotalWaste = 0;
      let franchiseTotalSessions = 0;
      let franchiseActiveTaps = 0;

      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        const storePath = `franchises/${franchiseId}/stores/${storeId}`;

        try {
          // Query servingSessions for yesterday
          const sessionsSnap = await db
            .collection(`${storePath}/servingSessions`)
            .where('createdAt', '>=', start)
            .where('createdAt', '<', end)
            .get();

          // Query wastageEvents for yesterday
          const wastageSnap = await db
            .collection(`${storePath}/wastageEvents`)
            .where('createdAt', '>=', start)
            .where('createdAt', '<', end)
            .get();

          // Aggregate sessions
          let totalMl = 0;
          let totalSessions = 0;
          const byTap: Record<string, { mlDispensed: number; sessions: number; mlWasted: number }> = {};

          for (const sessionDoc of sessionsSnap.docs) {
            const data = sessionDoc.data();
            const ml = (data.actualMl as number) || 0;
            const tapId = (data.tapId as string) || '0';

            totalMl += ml;
            totalSessions += 1;

            if (!byTap[tapId]) byTap[tapId] = { mlDispensed: 0, sessions: 0, mlWasted: 0 };
            byTap[tapId].mlDispensed += ml;
            byTap[tapId].sessions += 1;
          }

          // Aggregate wastage
          let totalWaste = 0;
          for (const wastageDoc of wastageSnap.docs) {
            const data = wastageDoc.data();
            const ml = (data.mlLost as number) || 0;
            const tapId = (data.tapId as string) || '0';

            totalWaste += ml;

            if (!byTap[tapId]) byTap[tapId] = { mlDispensed: 0, sessions: 0, mlWasted: 0 };
            byTap[tapId].mlWasted += ml;
          }

          const totalVolume = totalMl + totalWaste;
          const wastePercentage = totalVolume > 0 ? (totalWaste / totalVolume) * 100 : 0;

          // Write to dailyStats/{dateKey}
          const dailyStatsRef = db.doc(`${storePath}/dailyStats/${dateKey}`);
          await dailyStatsRef.set({
            operational: {
              totalMlDispensed: totalMl,
              totalMlWasted: totalWaste,
              wastePercentage: Math.round(wastePercentage * 100) / 100,
              totalServingSessions: totalSessions,
              avgMlPerSession: totalSessions > 0 ? Math.round(totalMl / totalSessions) : 0,
              byTap,
              maintenanceCompleted: 0, // could query maintenanceLogs if needed
              maintenanceOverdue: 0,
            },
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Accumulate franchise totals
          franchiseTotalMl += totalMl;
          franchiseTotalWaste += totalWaste;
          franchiseTotalSessions += totalSessions;

          // Count active taps
          const tapsSnap = await db
            .collection(`${storePath}/taps`)
            .where('currentKegId', '!=', null)
            .get();
          franchiseActiveTaps += tapsSnap.size;

          console.log(`[ERP:AggDaily] ${franchiseId}/${storeId}: ${totalMl}ml dispensed, ${totalWaste}ml wasted, ${totalSessions} sessions`);
        } catch (err) {
          console.error(`[ERP:AggDaily] Error processing ${franchiseId}/${storeId}:`, err);
        }
      }

      // Write franchise-level metrics
      const totalVolume = franchiseTotalMl + franchiseTotalWaste;
      const franchiseWastePercentage = totalVolume > 0 ? (franchiseTotalWaste / totalVolume) * 100 : 0;

      await db.doc(`franchises/${franchiseId}/metrics/operational`).set({
        date: dateKey,
        totalStores: storesSnap.size,
        totalActiveTaps: franchiseActiveTaps,
        totalMlDispensedToday: franchiseTotalMl,
        totalMlWastedToday: franchiseTotalWaste,
        wastePercentage: Math.round(franchiseWastePercentage * 100) / 100,
        totalSessions: franchiseTotalSessions,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    console.log('[ERP:AggDaily] Done');
  });
