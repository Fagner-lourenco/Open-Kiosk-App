/**
 * ============================================================================
 * onOrderPaidLedger — Cloud Function Trigger
 * ============================================================================
 *
 * Trigger: franchises/{franchiseId}/stores/{storeId}/orders/{orderId}
 * Tipo: onDocumentUpdated
 *
 * Cenário 1 — Pagamento:
 *   Quando paymentStatus muda para 'paid' | 'dispensed' | 'completed':
 *   1. Verifica idempotência (sourceType='kiosk_order', sourceId=orderId)
 *   2. Busca conta financeira (finAccounts) compatível com paymentMethod
 *   3. Busca primeira categoria de receita ativa (direction='in')
 *   4. Cria LedgerEntry com direction='in', sourceType='kiosk_order'
 *
 * Cenário 2 — Cancelamento / Reembolso:
 *   Quando paymentStatus muda para 'refunded' | 'canceled' | 'cancelled' | 'expired':
 *   1. Busca LedgerEntry existente (kiosk_order + orderId)
 *   2. Atualiza status para 'canceled'
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, admin } from '../lib';

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

// ============================================================================
// CONSTANTS
// ============================================================================

const PAID_STATUSES = ['paid', 'dispensed', 'completed'] as const;
const CANCELED_STATUSES = ['refunded', 'canceled', 'cancelled', 'expired'] as const;

// ============================================================================
// TYPES
// ============================================================================

interface OrderData {
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt?: admin.firestore.Timestamp;
  timestamp?: admin.firestore.Timestamp;
  paidAt?: admin.firestore.Timestamp;
  customerName?: string;
  orderNumber?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Maps kiosk paymentMethod to LedgerEntry method.
 */
function mapPaymentMethod(pm: string): 'pix' | 'card' | 'cash' | 'transfer' {
  switch (pm) {
    case 'pix':
    case 'pix_qr':
      return 'pix';
    case 'card':
    case 'mercadopago':
    case 'credit':
    case 'debit':
      return 'card';
    case 'cash':
      return 'cash';
    case 'transfer':
      return 'transfer';
    default:
      return 'card';
  }
}

/**
 * Picks the best finAccount for the payment method.
 * Falls back to any active account.
 */
async function pickAccount(
  storePath: string,
  method: 'pix' | 'card' | 'cash' | 'transfer',
): Promise<string | null> {
  // Map method to preferred account type keywords
  const typeHints: Record<string, string[]> = {
    pix: ['pix', 'bank'],
    card: ['card', 'clearing'],
    cash: ['cash', 'caixa'],
    transfer: ['bank', 'transfer'],
  };

  const accountsSnap = await db
    .collection(`${storePath}/finAccounts`)
    .where('status', '==', 'active')
    .get();

  if (accountsSnap.empty) return null;

  // Try to find a matching account by type keywords
  const hints = typeHints[method] || [];
  for (const doc of accountsSnap.docs) {
    const data = doc.data();
    const accType = (data.type || '').toLowerCase();
    const accName = (data.name || '').toLowerCase();
    if (hints.some((h) => accType.includes(h) || accName.includes(h))) {
      return doc.id;
    }
  }

  // Fallback: first active account
  return accountsSnap.docs[0].id;
}

// ============================================================================
// TRIGGER
// ============================================================================

export const onOrderPaidLedger = onDocumentUpdated(
  {
    document: 'franchises/{franchiseId}/stores/{storeId}/orders/{orderId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!beforeSnap || !afterSnap) return;

    const before = beforeSnap.data() as OrderData;
    const after = afterSnap.data() as OrderData;
    const { franchiseId, storeId, orderId } = event.params;

    // Only trigger when paymentStatus actually changed
    if (before.paymentStatus === after.paymentStatus) return;

    const storePath = `franchises/${franchiseId}/stores/${storeId}`;
    const ledgerCol = db.collection(`${storePath}/finLedger`);

    const isPaidNow =
      !PAID_STATUSES.includes(before.paymentStatus as typeof PAID_STATUSES[number]) &&
      PAID_STATUSES.includes(after.paymentStatus as typeof PAID_STATUSES[number]);

    const isCanceledNow =
      !CANCELED_STATUSES.includes(before.paymentStatus as typeof CANCELED_STATUSES[number]) &&
      CANCELED_STATUSES.includes(after.paymentStatus as typeof CANCELED_STATUSES[number]);

    // ── Cenário 1: Order paid → create ledger entry ─────────────────────
    if (isPaidNow) {
      // Idempotency check
      const existing = await ledgerCol
        .where('sourceType', '==', 'kiosk_order')
        .where('sourceId', '==', orderId)
        .limit(1)
        .get();

      if (!existing.empty) {
        console.log(`[Finance:Order] Ledger already exists for order ${orderId} — skip`);
        return;
      }

      if (!after.total || after.total <= 0) {
        console.log(`[Finance:Order] Order ${orderId} total=0 — skip`);
        return;
      }

      const method = mapPaymentMethod(after.paymentMethod);
      const accountId = await pickAccount(storePath, method);

      if (!accountId) {
        console.warn(`[Finance:Order] No active finAccount for store ${storeId} — skip`);
        return;
      }

      // Find first active income category
      const catSnap = await db
        .collection(`${storePath}/finCategories`)
        .where('direction', '==', 'in')
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (catSnap.empty) {
        console.warn(`[Finance:Order] No active income finCategory for store ${storeId} — skip`);
        return;
      }

      const categoryId = catSnap.docs[0].id;
      const orderDate = after.paidAt || after.createdAt || after.timestamp || admin.firestore.Timestamp.now();
      const orderLabel = after.orderNumber ? `#${after.orderNumber}` : orderId.slice(0, 8);
      const customerLabel = after.customerName ? ` — ${after.customerName}` : '';

      const ref = ledgerCol.doc();
      await ref.set({
        direction: 'in',
        status: 'paid',
        competenceDate: orderDate,
        cashDate: orderDate,
        amount: Math.round(after.total * 100) / 100,
        accountId,
        categoryId,
        costCenterId: null,
        partyId: null,
        method,
        sourceType: 'kiosk_order',
        sourceId: orderId,
        description: `Venda ${orderLabel}${customerLabel}`,
        attachments: [],
        createdBy: 'system',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log(
        `[Finance:Order] Created ledger ${ref.id} for order ${orderId} — R$ ${after.total} (${method})`,
      );
      return;
    }

    // ── Cenário 2: Order canceled/refunded → cancel ledger entry ────────
    if (isCanceledNow) {
      const existing = await ledgerCol
        .where('sourceType', '==', 'kiosk_order')
        .where('sourceId', '==', orderId)
        .limit(1)
        .get();

      if (existing.empty) {
        console.log(`[Finance:Order] No ledger to cancel for order ${orderId}`);
        return;
      }

      const entryDoc = existing.docs[0];
      if (entryDoc.data().status === 'canceled') {
        console.log(`[Finance:Order] Ledger ${entryDoc.id} already canceled — skip`);
        return;
      }

      await entryDoc.ref.update({
        status: 'canceled',
        updatedAt: serverTimestamp(),
      });

      console.log(`[Finance:Order] Canceled ledger ${entryDoc.id} for order ${orderId}`);
    }
  },
);
