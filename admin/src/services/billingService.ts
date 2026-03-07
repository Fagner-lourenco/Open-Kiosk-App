/**
 * ============================================================================
 * Billing Service
 * ============================================================================
 * 
 * Serviço para gerenciamento de billing via Stripe.
 */

import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { franchisePath, billingEventsPath } from '../lib/pathResolver';
import {
  BillingPlan,
  BillingStatus,
  BillingInterval,
  FranchiseBilling,
  BillingEvent,
  PLAN_DETAILS,
  PlanDetails
} from '../types/billing';

/**
 * Obtém informações de billing da franquia
 */
export async function getFranchiseBilling(franchiseId: string): Promise<FranchiseBilling | null> {
  try {
    const franchiseRef = doc(db, franchisePath(franchiseId));
    const franchiseSnap = await getDoc(franchiseRef);

    if (!franchiseSnap.exists()) {
      return null;
    }

    const data = franchiseSnap.data();

    return {
      plan: (data.plan as BillingPlan) || 'free',
      planStatus: (data.planStatus as BillingStatus) || 'active',
      planExpiresAt: data.planExpiresAt?.toDate() || null,
      stripeCustomerId: data.stripeCustomerId || null,
      stripeSubscriptionId: data.stripeSubscriptionId || null,
      lastPaymentAt: data.lastPaymentAt?.toDate() || null,
    };
  } catch (error) {
    console.error('Erro ao buscar billing:', error);
    throw error;
  }
}

/**
 * Obtém histórico de eventos de billing
 */
export async function getBillingHistory(
  franchiseId: string,
  maxItems = 20
): Promise<BillingEvent[]> {
  try {
    const eventsRef = collection(db, billingEventsPath(franchiseId));
    const eventsQuery = query(eventsRef, orderBy('timestamp', 'desc'), limit(maxItems));
    const eventsSnap = await getDocs(eventsQuery);

    return eventsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        plan: data.plan,
        amount: data.amount,
        currency: data.currency,
        invoiceId: data.invoiceId,
        subscriptionId: data.subscriptionId,
        sessionId: data.sessionId,
        timestamp: data.timestamp instanceof Timestamp
          ? data.timestamp.toDate()
          : new Date(data.timestamp),
      } as BillingEvent;
    });
  } catch (error) {
    console.error('Erro ao buscar histórico de billing:', error);
    return [];
  }
}

/**
 * Cria sessão de checkout para upgrade de plano
 */
export async function createCheckoutSession(
  plan: 'starter' | 'pro' | 'enterprise',
  interval: BillingInterval
): Promise<{ sessionId: string; url: string }> {
  try {
    const createCheckout = httpsCallable<
      { plan: string; interval: string },
      { sessionId: string; url: string }
    >(functions, 'createCheckoutSession');

    const result = await createCheckout({ plan, interval });
    return result.data;
  } catch (error) {
    console.error('Erro ao criar checkout:', error);
    throw error;
  }
}

/**
 * Abre portal de gerenciamento do Stripe
 */
export async function openBillingPortal(): Promise<string> {
  try {
    const createPortal = httpsCallable<
      Record<string, never>,
      { url: string }
    >(functions, 'createBillingPortalSession');

    const result = await createPortal({});
    return result.data.url;
  } catch (error) {
    console.error('Erro ao abrir portal:', error);
    throw error;
  }
}

/**
 * Obtém todos os planos disponíveis
 */
export function getAvailablePlans(): PlanDetails[] {
  return Object.values(PLAN_DETAILS).filter(plan =>
    plan.id !== 'free' && plan.id !== 'trial'
  );
}

/**
 * Obtém detalhes de um plano
 */
export function getPlanDetails(plan: BillingPlan): PlanDetails {
  return PLAN_DETAILS[plan] || PLAN_DETAILS.free;
}

/**
 * Calcula dias restantes do trial ou plano
 */
export function getDaysRemaining(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;

  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Verifica se a franquia pode fazer upgrade
 */
export function canUpgrade(currentPlan: BillingPlan): boolean {
  const upgradablePlans: BillingPlan[] = ['free', 'trial', 'starter', 'pro'];
  return upgradablePlans.includes(currentPlan);
}

/**
 * Verifica se a franquia pode fazer downgrade
 */
export function canDowngrade(currentPlan: BillingPlan): boolean {
  const downgradablePlans: BillingPlan[] = ['starter', 'pro', 'enterprise'];
  return downgradablePlans.includes(currentPlan);
}

/**
 * Formata valor em moeda
 */
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Verifica status de pagamento
 */
export function isPaymentOk(status: BillingStatus): boolean {
  const okStatuses: BillingStatus[] = ['active', 'trial'];
  return okStatuses.includes(status);
}

/**
 * Verifica se precisa de ação do usuário
 */
export function needsUserAction(status: BillingStatus): boolean {
  const actionNeeded: BillingStatus[] = ['past_due', 'unpaid', 'incomplete', 'expired'];
  return actionNeeded.includes(status);
}
