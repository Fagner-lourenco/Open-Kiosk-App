/**
 * ============================================================================
 * Billing - Create Checkout Session
 * ============================================================================
 * 
 * Callable function para criar sessão de checkout do Stripe.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import * as functions from 'firebase-functions';
import Stripe from 'stripe';
import { db, serverTimestamp } from '../lib';
import { stripe, PLAN_PRICES } from '../lib/stripe';

interface CreateCheckoutData {
  plan: 'starter' | 'pro' | 'enterprise';
  interval: 'monthly' | 'yearly';
  successUrl?: string;
  cancelUrl?: string;
}

export const createCheckoutSession = functions.https.onCall(async (data: CreateCheckoutData, context) => {
  // Verifica autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Usuário não autenticado'
    );
  }
  
  const callerClaims = context.auth.token;
  
  // Apenas owners podem gerenciar billing
  if (callerClaims.role !== 'owner') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Apenas proprietários podem gerenciar o plano'
    );
  }
  
  const { plan, interval, successUrl, cancelUrl } = data;
  
  if (!plan || !interval) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'plan e interval são obrigatórios'
    );
  }
  
  // 🔧 v4.0.7: Validação explícita de interval (proteção runtime além do TypeScript)
  if (!['monthly', 'yearly'].includes(interval)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'interval deve ser "monthly" ou "yearly"'
    );
  }
  
  if (!PLAN_PRICES[plan]) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Plano inválido'
    );
  }
  
  const franchiseId = callerClaims.franchiseId as string;
  const userEmail = context.auth.token.email;
  
  try {
    // Busca dados da franquia
    const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
    if (!franchiseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Franquia não encontrada');
    }
    
    const franchise = franchiseDoc.data()!;
    
    // Verifica ou cria customer no Stripe
    let customerId = franchise.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        name: franchise.name,
        metadata: {
          franchiseId,
        },
      });
      customerId = customer.id;
      
      // Salva o customerId
      await franchiseDoc.ref.update({
        stripeCustomerId: customerId,
        updatedAt: serverTimestamp(),
      });
    }
    
    // Define URLs
    const baseUrl = functions.config().app?.url || 'https://admin.openkiosk.app';
    const defaultSuccessUrl = `${baseUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${baseUrl}/billing?canceled=true`;
    
    // Cria sessão de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PLAN_PRICES[plan][interval],
          quantity: 1,
        },
      ],
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      metadata: {
        franchiseId,
        plan,
        interval,
      },
      subscription_data: {
        metadata: {
          franchiseId,
          plan,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
    });
    
    functions.logger.info(`Checkout session criada para franquia ${franchiseId}: ${session.id}`);
    
    return {
      sessionId: session.id,
      url: session.url,
    };
    
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    if (error instanceof Stripe.errors.StripeError) {
      functions.logger.error('Stripe error:', error);
      throw new functions.https.HttpsError(
        'internal',
        `Erro do Stripe: ${error.message}`
      );
    }
    functions.logger.error('Erro ao criar checkout:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erro interno ao criar sessão de checkout'
    );
  }
});

/**
 * Callable function para criar portal de gerenciamento do Stripe
 */
export const createBillingPortalSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  
  if (context.auth.token.role !== 'owner') {
    throw new functions.https.HttpsError('permission-denied', 'Apenas proprietários podem acessar');
  }
  
  const franchiseId = context.auth.token.franchiseId as string;
  
  try {
    const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
    if (!franchiseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Franquia não encontrada');
    }
    
    const franchise = franchiseDoc.data()!;
    
    if (!franchise.stripeCustomerId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Nenhum histórico de pagamento encontrado'
      );
    }
    
    const baseUrl = functions.config().app?.url || 'https://admin.openkiosk.app';
    
    const session = await stripe.billingPortal.sessions.create({
      customer: franchise.stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });
    
    return { url: session.url };
    
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error('Erro ao criar portal session:', error);
    throw new functions.https.HttpsError('internal', 'Erro interno');
  }
});
