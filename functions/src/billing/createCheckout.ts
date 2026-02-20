/**
 * ============================================================================
 * Billing - Create Checkout Session
 * ============================================================================
 * 
 * Callable function para criar sessão de checkout do Stripe.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import Stripe from 'stripe';
import { db, serverTimestamp } from '../lib';
import { getStripeClient, PLAN_PRICES } from '../lib/stripe';

interface CreateCheckoutData {
  plan: 'starter' | 'pro' | 'enterprise';
  interval: 'monthly' | 'yearly';
  successUrl?: string;
  cancelUrl?: string;
}

export const createCheckoutSession = onCall(async (request) => {
  const data = request.data as CreateCheckoutData;
  // Verifica autenticação
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Usuário não autenticado'
    );
  }
  
  const callerClaims = request.auth.token;
  
  // Apenas owners podem gerenciar billing
  if (callerClaims.role !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      'Apenas proprietários podem gerenciar o plano'
    );
  }
  
  const { plan, interval, successUrl, cancelUrl } = data;
  
  if (!plan || !interval) {
    throw new HttpsError(
      'invalid-argument',
      'plan e interval são obrigatórios'
    );
  }
  
  // 🔧 v4.0.7: Validação explícita de interval (proteção runtime além do TypeScript)
  if (!['monthly', 'yearly'].includes(interval)) {
    throw new HttpsError(
      'invalid-argument',
      'interval deve ser "monthly" ou "yearly"'
    );
  }
  
  if (!PLAN_PRICES[plan]) {
    throw new HttpsError(
      'invalid-argument',
      'Plano inválido'
    );
  }
  
  const franchiseId = callerClaims.franchiseId as string;
  const userEmail = request.auth.token.email;
  
  try {
    // Busca dados da franquia
    const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
    if (!franchiseDoc.exists) {
      throw new HttpsError('not-found', 'Franquia não encontrada');
    }
    
    const franchise = franchiseDoc.data()!;
    
    // Verifica ou cria customer no Stripe
    let customerId = franchise.stripeCustomerId;
    
    if (!customerId) {
      const customer = await getStripeClient().customers.create({
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
    const baseUrl = process.env.APP_URL || 'https://admin.openkiosk.app';
    const defaultSuccessUrl = `${baseUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${baseUrl}/billing?canceled=true`;

    // 🔒 FIX BUG-24: Validate redirect URLs against allowed origin to prevent open redirect
    const allowedOrigin = new URL(baseUrl).origin;
    const safeSuccessUrl = (() => {
      if (!successUrl) return defaultSuccessUrl;
      try { return new URL(successUrl).origin === allowedOrigin ? successUrl : defaultSuccessUrl; }
      catch { return defaultSuccessUrl; }
    })();
    const safeCancelUrl = (() => {
      if (!cancelUrl) return defaultCancelUrl;
      try { return new URL(cancelUrl).origin === allowedOrigin ? cancelUrl : defaultCancelUrl; }
      catch { return defaultCancelUrl; }
    })();
    
    // Cria sessão de checkout
    const session = await getStripeClient().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PLAN_PRICES[plan][interval],
          quantity: 1,
        },
      ],
      success_url: safeSuccessUrl,
      cancel_url: safeCancelUrl,
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
    
    logger.info(`Checkout session criada para franquia ${franchiseId}: ${session.id}`);
    
    return {
      sessionId: session.id,
      url: session.url,
    };
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof Stripe.errors.StripeError) {
      logger.error('Stripe error:', error);
      throw new HttpsError(
        'internal',
        `Erro do Stripe: ${error.message}`
      );
    }
    logger.error('Erro ao criar checkout:', error);
    throw new HttpsError(
      'internal',
      'Erro interno ao criar sessão de checkout'
    );
  }
});

/**
 * Callable function para criar portal de gerenciamento do Stripe
 */
export const createBillingPortalSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  
  if (request.auth.token.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Apenas proprietários podem acessar');
  }
  
  const franchiseId = request.auth.token.franchiseId as string;
  
  try {
    const franchiseDoc = await db.collection('franchises').doc(franchiseId).get();
    if (!franchiseDoc.exists) {
      throw new HttpsError('not-found', 'Franquia não encontrada');
    }
    
    const franchise = franchiseDoc.data()!;
    
    if (!franchise.stripeCustomerId) {
      throw new HttpsError(
        'failed-precondition',
        'Nenhum histórico de pagamento encontrado'
      );
    }
    
    const baseUrl = process.env.APP_URL || 'https://admin.openkiosk.app';
    
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: franchise.stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });
    
    return { url: session.url };
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('Erro ao criar portal session:', error);
    throw new HttpsError('internal', 'Erro interno');
  }
});
