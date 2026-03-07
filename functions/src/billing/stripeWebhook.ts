/**
 * ============================================================================
 * Billing - Stripe Webhook
 * ============================================================================
 * 
 * HTTP endpoint para receber webhooks do Stripe.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import Stripe from 'stripe';
import { db, admin, serverTimestamp } from '../lib';
import { verifyWebhookSignature, getPlanFromPriceId } from '../lib/stripe';

export const stripeWebhook = onRequest({ region: 'southamerica-east1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Método não permitido');
    return;
  }
  
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    res.status(400).send('Assinatura ausente');
    return;
  }
  
  let event: Stripe.Event;
  
  try {
    // 🔧 v4.0.7: Usando helper centralizado
    event = verifyWebhookSignature(req.rawBody, sig as string);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return;
  }
  
  logger.info(`Stripe webhook received: ${event.type}`);
  
  // 🔒 FIX BUG-A4: Idempotency guard — Stripe may deliver the same event multiple times
  const dedupRef = db.collection('_webhookDedup').doc(event.id);
  const dedupSnap = await dedupRef.get();
  if (dedupSnap.exists) {
    logger.info(`[stripeWebhook] Duplicate event ${event.id} — skipping`);
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
        
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      default:
        logger.info(`Evento não tratado: ${event.type}`);
    }

    // 🔒 FIX P0-1: Mark event as processed BEFORE sending response.
    // After res.json() the runtime may terminate the function, so the
    // dedup marker must be persisted first to prevent replay double-processing.
    await dedupRef.set({ type: event.type, processedAt: admin.firestore.FieldValue.serverTimestamp() });
    
    res.json({ received: true });
    
  } catch (error) {
    logger.error('Erro ao processar webhook:', error);
    res.status(500).send('Erro interno');
  }
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const franchiseId = session.metadata?.franchiseId;
  const plan = session.metadata?.plan;
  
  if (!franchiseId || !plan) {
    logger.warn('Checkout sem metadata válida');
    return;
  }
  
const now = serverTimestamp();
  
  await db.collection('franchises').doc(franchiseId).update({
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: session.subscription as string,
    plan,
    planStatus: 'active',
    billingStatus: 'active',
    updatedAt: now,
  });
  
  // Registra o evento de billing
  await db.collection('franchises').doc(franchiseId).collection('billingEvents').add({
    type: 'checkout_completed',
    plan,
    sessionId: session.id,
    timestamp: now,
  });
  
  logger.info(`Checkout completado para franquia ${franchiseId}, plano: ${plan}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  // Busca franquia pelo customerId
  const franchiseQuery = await db
    .collection('franchises')
    .where('stripeCustomerId', '==', subscription.customer)
    .limit(1)
    .get();
  
  if (franchiseQuery.empty) {
    logger.warn(`Franquia não encontrada para customer ${subscription.customer}`);
    return;
  }
  
  const franchiseRef = franchiseQuery.docs[0].ref;
  
  // Determina o plano pela price
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  
  // Mapeia status do Stripe para nosso status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    unpaid: 'unpaid',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'expired',
    trialing: 'trial',
    paused: 'paused',
  };
  
  // 🔒 FIX P0-2: Transaction to prevent concurrent webhook race conditions
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(franchiseRef);
    if (!snap.exists) return;
    txn.update(franchiseRef, {
      stripeSubscriptionId: subscription.id,
      plan,
      planStatus: statusMap[subscription.status] || subscription.status,
      billingStatus: statusMap[subscription.status] || subscription.status,
      planExpiresAt: subscription.current_period_end 
        ? admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000)
        : null,
      trialEndsAt: subscription.trial_end 
        ? admin.firestore.Timestamp.fromMillis(subscription.trial_end * 1000)
        : null,
      updatedAt: serverTimestamp(),
    });
  });
  
  logger.info(`Subscription atualizada para franquia ${franchiseRef.id}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const franchiseQuery = await db
    .collection('franchises')
    .where('stripeSubscriptionId', '==', subscription.id)
    .limit(1)
    .get();
  
  if (franchiseQuery.empty) {
    return;
  }
  
  const franchiseRef = franchiseQuery.docs[0].ref;
  
  // 🔒 FIX P0-2: Transaction to prevent concurrent webhook race conditions
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(franchiseRef);
    if (!snap.exists) return;
    txn.update(franchiseRef, {
      plan: 'free',
      planStatus: 'canceled',
      billingStatus: 'canceled',
      stripeSubscriptionId: null,
      updatedAt: serverTimestamp(),
    });
    // Registra evento within transaction
    const eventRef = franchiseRef.collection('billingEvents').doc();
    txn.set(eventRef, {
      type: 'subscription_canceled',
      subscriptionId: subscription.id,
      timestamp: serverTimestamp(),
    });
  });
  
  logger.info(`Subscription cancelada para franquia ${franchiseRef.id}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;
  
  const franchiseQuery = await db
    .collection('franchises')
    .where('stripeSubscriptionId', '==', invoice.subscription)
    .limit(1)
    .get();
  
  if (franchiseQuery.empty) return;
  
  const franchiseRef = franchiseQuery.docs[0].ref;
  
  // 🔒 FIX P0-2: Transaction for atomic read-update + billing event
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(franchiseRef);
    if (!snap.exists) return;
    txn.update(franchiseRef, {
      planStatus: 'active',
      billingStatus: 'active',
      lastPaymentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const eventRef = franchiseRef.collection('billingEvents').doc();
    txn.set(eventRef, {
      type: 'invoice_paid',
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      timestamp: serverTimestamp(),
    });
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;
  
  const franchiseQuery = await db
    .collection('franchises')
    .where('stripeSubscriptionId', '==', invoice.subscription)
    .limit(1)
    .get();
  
  if (franchiseQuery.empty) return;
  
  const franchiseRef = franchiseQuery.docs[0].ref;
  
  // 🔒 FIX P0-2: Transaction for atomic read-update + billing event
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(franchiseRef);
    if (!snap.exists) return;
    txn.update(franchiseRef, {
      planStatus: 'past_due',
      billingStatus: 'past_due',
      updatedAt: serverTimestamp(),
    });
    const eventRef = franchiseRef.collection('billingEvents').doc();
    txn.set(eventRef, {
      type: 'invoice_payment_failed',
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      timestamp: serverTimestamp(),
    });
  });
  
  logger.warn(`Pagamento falhou para franquia ${franchiseRef.id}`);
}
