/**
 * ============================================================================
 * checkFinanceOverdue — Scheduled Cloud Function
 * ============================================================================
 *
 * Schedule: 0 8 * * * (08:00 BRT daily)
 *
 * Para cada invoice (finInvoices) com status 'issued' ou 'partially_paid'
 * e dueDate < now → atualiza status para 'overdue' + cria notification.
 *
 * Para cada bill (finBills) com status 'scheduled' ou 'partially_paid'
 * e dueDate < now → atualiza status para 'overdue' + cria notification.
 *
 * Segue o padrão de checkMaintenanceOverdue.ts.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// ── Helpers ──────────────────────────────────────────────────────────────────

interface OverdueConfig {
  collection: string;
  eligibleStatuses: string[];
  entityLabel: string;
  notificationType: string;
  actionUrlSuffix: string;
}

const INVOICE_CONFIG: OverdueConfig = {
  collection: 'finInvoices',
  eligibleStatuses: ['issued', 'partially_paid'],
  entityLabel: 'Fatura',
  notificationType: 'finance_overdue',
  actionUrlSuffix: 'finance/ar',
};

const BILL_CONFIG: OverdueConfig = {
  collection: 'finBills',
  eligibleStatuses: ['scheduled', 'partially_paid'],
  entityLabel: 'Conta a Pagar',
  notificationType: 'finance_overdue',
  actionUrlSuffix: 'finance/ap',
};

async function processOverdue(
  franchiseId: string,
  storeId: string,
  config: OverdueConfig,
  now: Date,
): Promise<number> {
  const storePath = `franchises/${franchiseId}/stores/${storeId}`;
  let count = 0;

  const overdueSnap = await db
    .collection(`${storePath}/${config.collection}`)
    .where('status', 'in', config.eligibleStatuses)
    .where('dueDate', '<', now)
    .get();

  for (const docSnap of overdueSnap.docs) {
    // Update status to overdue
    await docSnap.ref.update({
      status: 'overdue',
      updatedAt: serverTimestamp(),
      updatedBy: 'system',
    });

    // Dedupe notification
    const today = now.toISOString().slice(0, 10);
    const dedupeKey = `${config.notificationType}_${docSnap.id}_${today}`;
    const existingSnap = await db.collection(`franchises/${franchiseId}/notifications`)
      .where('dedupeKey', '==', dedupeKey).limit(1).get();

    if (existingSnap.empty) {
      const data = docSnap.data();
      const partyId = (data.partyId as string) || '';
      const amount = (data.totalAmount as number) || (data.amount as number) || 0;
      const amountStr = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const notifRef = db.collection(`franchises/${franchiseId}/notifications`).doc();
      await notifRef.set({
        id: notifRef.id,
        type: 'warning',
        priority: 'high',
        title: `${config.entityLabel} Vencida`,
        message: `${config.entityLabel} ${amountStr} vencida${partyId ? ` (parte: ${partyId.slice(0, 8)}…)` : ''}`,
        isRead: false,
        isDismissed: false,
        createdAt: serverTimestamp(),
        readAt: null,
        entityRef: `${config.collection}/${docSnap.id}`,
        storeId,
        franchiseId,
        dedupeKey,
        actionUrl: `/stores/${storeId}/${config.actionUrlSuffix}`,
        actionLabel: `Ver ${config.entityLabel}s`,
      });
    }

    count++;
    console.log(`[ERP:FinanceOverdue] Marked overdue: ${config.collection}/${docSnap.id}`);
  }

  return count;
}

// ── Scheduled Function ───────────────────────────────────────────────────────

export const checkFinanceOverdue = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    console.log('[ERP:FinanceOverdue] Starting overdue check');

    const now = new Date();
    let totalInvoices = 0;
    let totalBills = 0;
    const franchisesSnap = await db.collection('franchises').get();

    for (const franchiseDoc of franchisesSnap.docs) {
      const franchiseId = franchiseDoc.id;
      const storesSnap = await db.collection(`franchises/${franchiseId}/stores`).get();

      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;

        try {
          totalInvoices += await processOverdue(franchiseId, storeId, INVOICE_CONFIG, now);
          totalBills += await processOverdue(franchiseId, storeId, BILL_CONFIG, now);
        } catch (err) {
          console.error(`[ERP:FinanceOverdue] Error in ${franchiseId}/${storeId}:`, err);
        }
      }
    }

    console.log(`[ERP:FinanceOverdue] Done — ${totalInvoices} invoices, ${totalBills} bills marked overdue`);
  });
