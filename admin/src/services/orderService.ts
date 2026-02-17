/**
 * ============================================================================
 * Order Service - Ações operacionais de pedidos no Admin
 * ============================================================================
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import type { Order } from '@/components/orders';
import { AuditActions, logUserAction } from '@/services/auditService';

interface OrderActionActor {
  id: string;
  email: string;
  name?: string;
}

interface OrderActionParams {
  franchiseId: string;
  storeId: string;
  orderId: string;
  actor: OrderActionActor;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function cancelOrder({
  franchiseId,
  storeId,
  orderId,
  actor,
}: OrderActionParams): Promise<void> {
  const orderRef = doc(db, ordersPath(franchiseId, storeId), orderId);

  await updateDoc(orderRef, {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await logUserAction(
      franchiseId,
      AuditActions.ORDER_CANCEL,
      actor,
      { type: 'order', id: orderId, name: `Pedido ${orderId.slice(-8).toUpperCase()}` },
      { storeId }
    );
  } catch (error) {
    // Não bloquear fluxo operacional se o audit falhar.
    console.warn('[audit] Falha ao registrar cancelamento de pedido:', error);
  }
}

export async function refundOrder({
  franchiseId,
  storeId,
  orderId,
  actor,
}: OrderActionParams): Promise<void> {
  const orderRef = doc(db, ordersPath(franchiseId, storeId), orderId);

  await updateDoc(orderRef, {
    paymentStatus: 'refunded',
    refundedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await logUserAction(
      franchiseId,
      AuditActions.ORDER_REFUND,
      actor,
      { type: 'order', id: orderId, name: `Pedido ${orderId.slice(-8).toUpperCase()}` },
      { storeId, operation: 'refund' }
    );
  } catch (error) {
    console.warn('[audit] Falha ao registrar estorno de pedido:', error);
  }
}

export function printOrderReceipt(order: Order): void {
  const receiptWindow = window.open('', '_blank', 'width=420,height=700');
  if (!receiptWindow) return;

  const orderLabel = escapeHtml(order.orderNumber || order.orderId || order.id);
  const orderDate = (order.timestamp || order.createdAt)?.toDate?.();
  const paymentMethod = escapeHtml(order.paymentMethod || '-');
  const itemsHtml = (order.items || [])
    .map((item) => {
      const name = escapeHtml(item.title || item.productName || 'Produto');
      const qty = item.quantity || 1;
      const unitPrice = Number(item.price || 0);
      const lineTotal = unitPrice * qty;
      return `
        <tr>
          <td>${name}</td>
          <td style="text-align:center">${qty}x</td>
          <td style="text-align:right">R$ ${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  receiptWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Recibo ${orderLabel}</title>
        <style>
          body { font-family: monospace; max-width: 340px; margin: 0 auto; padding: 16px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 12px; text-align: center; }
          p { margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          td { padding: 4px 0; border-bottom: 1px dashed #ccc; vertical-align: top; }
          .totals { margin-top: 12px; border-top: 2px solid #111; padding-top: 8px; }
          .total-line { display: flex; justify-content: space-between; font-weight: bold; }
          .meta { font-size: 12px; color: #444; }
          .actions { margin-top: 16px; display: flex; gap: 8px; }
          button { flex: 1; padding: 8px 10px; border: 1px solid #111; background: #fff; cursor: pointer; }
          @media print { .actions { display: none; } }
        </style>
      </head>
      <body>
        <h1>Open Kiosk</h1>
        <p><strong>Pedido:</strong> ${orderLabel}</p>
        <p class="meta"><strong>Data:</strong> ${orderDate ? orderDate.toLocaleString('pt-BR') : '-'}</p>
        <p class="meta"><strong>Pagamento:</strong> ${paymentMethod}</p>
        <table>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="totals">
          <div class="total-line">
            <span>Total</span>
            <span>R$ ${Number(order.total || 0).toFixed(2)}</span>
          </div>
        </div>
        <div class="actions">
          <button onclick="window.print()">Imprimir</button>
          <button onclick="window.close()">Fechar</button>
        </div>
      </body>
    </html>
  `);

  receiptWindow.document.close();
}
