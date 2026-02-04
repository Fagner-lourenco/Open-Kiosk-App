/**
 * ============================================================================
 * Billing - Stripe Webhook
 * ============================================================================
 * 
 * HTTP endpoint para receber webhooks do Stripe.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import * as functions from 'firebase-functions';
import Stripe from 'stripe';
import { db, admin, serverTimestamp } from '../lib';
import { verifyWebhookSignature, getPlanFromPriceId } from '../lib/stripe';

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
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
    functions.logger.error('Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return;
  }
  
  functions.logger.info(`Stripe webhook received: ${event.type}`);
  
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
        functions.logger.info(`Evento não tratado: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    functions.logger.error('Erro ao processar webhook:', error);
    res.status(500).send('Erro interno');
  }
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const franchiseId = session.metadata?.franchiseId;
  const plan = session.metadata?.plan;
  
  if (!franchiseId || !plan) {
    functions.logger.warn('Checkout sem metadata válida');
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
  
  functions.logger.info(`Checkout completado para franquia ${franchiseId}, plano: ${plan}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  // Busca franquia pelo customerId
  const franchiseQuery = await db
    .collection('franchises')
    .where('stripeCustomerId', '==', subscription.customer)
    .limit(1)
    .get();
  
  if (franchiseQuery.empty) {
    functions.logger.warn(`Franquia não encontrada para customer ${subscription.customer}`);
    return;
  }
  
  const franchiseDoc = franchiseQuery.docs[0];
  const now = serverTimestamp();
  
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
  
  await franchiseDoc.ref.update({
    stripeSubscriptionId: subscription.id,
    plan,
    planStatus: statusMap[subscription.status] || subscription.status,
    billingStatus: statusMap[subscription.status] || subscription.status,
    planExpiresAt: subscription.current_period_end 
      ? admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000)
      : null,
    trialEndsAt: subscription.current_period_end 
      ? admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000)
      : null,
    updatedAt: now,
  });
  
  functions.logger.info(`Subscription atualizada para franquia ${franchiseDoc.id}`);
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
  
  const franchiseDoc = franchiseQuery.docs[0];
  const now = serverTimestamp();
  
  await franchiseDoc.ref.update({
    plan: 'free',
    planStatus: 'canceled',
    billingStatus: 'canceled',
    stripeSubscriptionId: null,
    updatedAt: now,
  });
  
  // Registra evento
  await franchiseDoc.ref.collection('billingEvents').add({
    type: 'subscription_canceled',
    subscriptionId: subscription.id,
    timestamp: now,
  });
  
  functions.logger.info(`Subscription cancelada para franquia ${franchiseDoc.id}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;
  
  const franchiseQuery = await db
    .collection('franchises')
    .where('stripeSubscriptionId', '==', invoice.subscription)
    .limit(1)
    .get();
  
  if (franchiseQuery.empty) return;
  
  const franchiseDoc = franchiseQuery.docs[0];
  const now = serverTimestamp();
  
  // Registra pagamento
  await franchiseDoc.ref.collection('billingEvents').add({
    type: 'invoice_paid',
    invoiceId: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    timestamp: now,
  });
  
  // Atualiza status se necessário
  await franchiseDoc.ref.update({
    planStatus: 'active',
    billingStatus: 'active',
    lastPaymentAt: now,
    updatedAt: now,
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
  
  const franchiseDoc = franchiseQuery.docs[0];
  const now = serverTimestamp();
  
  // Registra falha
  await franchiseDoc.ref.collection('billingEvents').add({
    type: 'invoice_payment_failed',
    invoiceId: invoice.id,
    amount: invoice.amount_due,
    currency: invoice.currency,
    timestamp: now,
  });
  
  // Atualiza status
  await franchiseDoc.ref.update({
    planStatus: 'past_due',
    billingStatus: 'past_due',
    updatedAt: now,
  });
  
  functions.logger.warn(`Pagamento falhou para franquia ${franchiseDoc.id}`);
}
