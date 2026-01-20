/**
 * ============================================================================
 * Tipos de Billing
 * ============================================================================
 */

/**
 * Planos disponíveis
 */
export type BillingPlan = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise';

/**
 * Status do plano
 */
export type BillingStatus = 
  | 'active'
  | 'trial'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'expired'
  | 'paused';

/**
 * Intervalo de cobrança
 */
export type BillingInterval = 'monthly' | 'yearly';

/**
 * Informações de billing da franquia
 */
export interface FranchiseBilling {
  plan: BillingPlan;
  planStatus: BillingStatus;
  planExpiresAt: Date | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  lastPaymentAt?: Date | null;
}

/**
 * Detalhes de um plano
 */
export interface PlanDetails {
  id: BillingPlan;
  name: string;
  description: string;
  features: string[];
  limits: PlanLimits;
  pricing: {
    monthly: number;
    yearly: number;
  };
  popular?: boolean;
}

/**
 * Limites de cada plano
 */
export interface PlanLimits {
  maxStores: number;
  maxUsers: number;
  maxProducts: number;
  maxOrders: number; // por mês
  dataRetentionDays: number;
  hasReports: boolean;
  hasAudit: boolean;
  hasApi: boolean;
  hasSupport: 'email' | 'priority' | 'dedicated';
}

/**
 * Evento de billing
 */
export interface BillingEvent {
  id: string;
  type: 'checkout_completed' | 'subscription_updated' | 'subscription_canceled' | 'invoice_paid' | 'invoice_payment_failed';
  plan?: BillingPlan;
  amount?: number;
  currency?: string;
  invoiceId?: string;
  subscriptionId?: string;
  sessionId?: string;
  timestamp: Date;
}

/**
 * Detalhes dos planos
 */
export const PLAN_DETAILS: Record<BillingPlan, PlanDetails> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Para testes e avaliação',
    features: [
      '1 loja',
      '2 usuários',
      '50 produtos',
      '100 pedidos/mês',
      'Suporte por email',
    ],
    limits: {
      maxStores: 1,
      maxUsers: 2,
      maxProducts: 50,
      maxOrders: 100,
      dataRetentionDays: 30,
      hasReports: false,
      hasAudit: false,
      hasApi: false,
      hasSupport: 'email',
    },
    pricing: {
      monthly: 0,
      yearly: 0,
    },
  },
  trial: {
    id: 'trial',
    name: 'Trial',
    description: '14 dias de teste do plano Pro',
    features: [
      'Todas as features do Pro',
      'Válido por 14 dias',
      'Sem necessidade de cartão',
    ],
    limits: {
      maxStores: 3,
      maxUsers: 10,
      maxProducts: 500,
      maxOrders: 5000,
      dataRetentionDays: 90,
      hasReports: true,
      hasAudit: true,
      hasApi: true,
      hasSupport: 'priority',
    },
    pricing: {
      monthly: 0,
      yearly: 0,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Para pequenos negócios',
    features: [
      '2 lojas',
      '5 usuários',
      '200 produtos',
      '1.000 pedidos/mês',
      'Relatórios básicos',
      'Suporte por email',
    ],
    limits: {
      maxStores: 2,
      maxUsers: 5,
      maxProducts: 200,
      maxOrders: 1000,
      dataRetentionDays: 60,
      hasReports: true,
      hasAudit: false,
      hasApi: false,
      hasSupport: 'email',
    },
    pricing: {
      monthly: 99,
      yearly: 990, // 2 meses grátis
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Para negócios em crescimento',
    features: [
      '5 lojas',
      '20 usuários',
      'Produtos ilimitados',
      '10.000 pedidos/mês',
      'Relatórios avançados',
      'Auditoria completa',
      'API de integração',
      'Suporte prioritário',
    ],
    limits: {
      maxStores: 5,
      maxUsers: 20,
      maxProducts: -1, // ilimitado
      maxOrders: 10000,
      dataRetentionDays: 365,
      hasReports: true,
      hasAudit: true,
      hasApi: true,
      hasSupport: 'priority',
    },
    pricing: {
      monthly: 299,
      yearly: 2990, // 2 meses grátis
    },
    popular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Para grandes operações',
    features: [
      'Lojas ilimitadas',
      'Usuários ilimitados',
      'Produtos ilimitados',
      'Pedidos ilimitados',
      'Todas as features',
      'SLA garantido',
      'Suporte dedicado',
      'Customizações',
    ],
    limits: {
      maxStores: -1,
      maxUsers: -1,
      maxProducts: -1,
      maxOrders: -1,
      dataRetentionDays: -1, // ilimitado
      hasReports: true,
      hasAudit: true,
      hasApi: true,
      hasSupport: 'dedicated',
    },
    pricing: {
      monthly: 999,
      yearly: 9990, // 2 meses grátis
    },
  },
};

/**
 * Verifica se um plano tem acesso a uma feature
 */
export function planHasFeature(plan: BillingPlan, feature: keyof PlanLimits): boolean {
  const details = PLAN_DETAILS[plan];
  if (!details) return false;
  
  const value = details.limits[feature];
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  return !!value;
}

/**
 * Verifica limite numérico
 */
export function checkPlanLimit(plan: BillingPlan, limit: keyof PlanLimits, currentValue: number): boolean {
  const details = PLAN_DETAILS[plan];
  if (!details) return false;
  
  const maxValue = details.limits[limit];
  
  if (typeof maxValue !== 'number') return true;
  if (maxValue === -1) return true; // ilimitado
  
  return currentValue < maxValue;
}

/**
 * Retorna o label do status
 */
export function getBillingStatusLabel(status: BillingStatus): string {
  const labels: Record<BillingStatus, string> = {
    active: 'Ativo',
    trial: 'Período de teste',
    past_due: 'Pagamento pendente',
    unpaid: 'Não pago',
    canceled: 'Cancelado',
    incomplete: 'Incompleto',
    expired: 'Expirado',
    paused: 'Pausado',
  };
  
  return labels[status] || status;
}

/**
 * Retorna a cor do status para UI
 */
export function getBillingStatusColor(status: BillingStatus): 'green' | 'yellow' | 'red' | 'gray' {
  const colors: Record<BillingStatus, 'green' | 'yellow' | 'red' | 'gray'> = {
    active: 'green',
    trial: 'green',
    past_due: 'yellow',
    unpaid: 'red',
    canceled: 'gray',
    incomplete: 'yellow',
    expired: 'red',
    paused: 'gray',
  };
  
  return colors[status] || 'gray';
}
