/**
 * ============================================================================
 * Audit Service - Serviços para log de auditoria
 * ============================================================================
 */

import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { auditLogsPath } from '@/lib/pathResolver';

export interface AuditLog {
  id: string;
  action: string;
  actor: {
    id: string;
    email: string;
    name?: string;
  };
  target?: {
    type: string;
    id: string;
    name?: string;
  };
  details?: Record<string, any>;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}

export interface AuditLogFilter {
  action?: string;
  actorId?: string;
  targetType?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateAuditLogData {
  action: string;
  actor: {
    id: string;
    email: string;
    name?: string;
  };
  target?: {
    type: string;
    id: string;
    name?: string;
  };
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

// Audit action types
export const AuditActions = {
  // ── Auth ───────────────────────────────────────────────────────────────
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_REGISTER: 'user.register',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_PASSWORD_CHANGE: 'user.password_change',

  // ── Users / Team ──────────────────────────────────────────────────────
  USER_INVITE: 'user.invite',
  USER_ACCEPT_INVITE: 'user.accept_invite',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_REMOVE: 'user.remove',
  USER_INVITE_REVOKE: 'user.invite_revoke',
  USER_INVITE_RESEND: 'user.invite_resend',
  USER_PROFILE_UPDATE: 'user.profile_update',

  // ── Store ─────────────────────────────────────────────────────────────
  STORE_CREATE: 'store.create',
  STORE_UPDATE: 'store.update',
  STORE_DELETE: 'store.delete',
  STORE_TOGGLE_STATUS: 'store.toggle_status',
  STORE_SETTINGS_UPDATE: 'store.settings_update',
  STORE_MEMBER_ADD: 'store.member_add',
  STORE_MEMBER_REMOVE: 'store.member_remove',

  // ── Product ───────────────────────────────────────────────────────────
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',

  // ── Order ─────────────────────────────────────────────────────────────
  ORDER_CREATE: 'order.create',
  ORDER_UPDATE: 'order.update',
  ORDER_CANCEL: 'order.cancel',
  ORDER_REFUND: 'order.refund',

  // ── Settings ──────────────────────────────────────────────────────────
  SETTINGS_UPDATE: 'settings.update',

  // ── Franchise ─────────────────────────────────────────────────────────
  FRANCHISE_CREATE: 'franchise.create',
  FRANCHISE_UPDATE: 'franchise.update',
  FRANCHISE_DELETE: 'franchise.delete',

  // ── Kegs / Taps ───────────────────────────────────────────────────────
  KEG_CREATE: 'keg.create',
  KEG_STATUS_UPDATE: 'keg.status_update',
  TAP_CONNECT: 'tap.connect',
  TAP_DISCONNECT: 'tap.disconnect',

  // ── Wastage / Maintenance ─────────────────────────────────────────────
  WASTAGE_CREATE: 'wastage.create',
  MAINTENANCE_SCHEDULE: 'maintenance.schedule',
  MAINTENANCE_COMPLETE: 'maintenance.complete',
  MAINTENANCE_CANCEL: 'maintenance.cancel',

  // ── TV / Events / Ranking ─────────────────────────────────────────────
  TV_CONFIG_UPDATE: 'tv.config_update',
  EVENT_MODE_TOGGLE: 'event.mode_toggle',
  EVENT_GOAL_SET: 'event.goal_set',
  EVENT_GOAL_DISABLE: 'event.goal_disable',
  CHALLENGE_CREATE: 'challenge.create',
  CHALLENGE_ACTIVATE: 'challenge.activate',
  CHALLENGE_DELETE: 'challenge.delete',
  PRIZE_ADD: 'prize.add',
  PRIZE_REDEEM: 'prize.redeem',
  GOLDEN_SERVE_UPDATE: 'golden_serve.update',
  RANKING_RESET: 'ranking.reset',

  // ── Billing ───────────────────────────────────────────────────────────
  BILLING_CHECKOUT: 'billing.checkout',
  BILLING_PORTAL_OPEN: 'billing.portal_open',

  // ── CRM ───────────────────────────────────────────────────────────────
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',
  CUSTOMER_DELETE: 'customer.delete',
  DEAL_CREATE: 'deal.create',
  DEAL_UPDATE: 'deal.update',
  DEAL_STAGE_CHANGE: 'deal.stage_change',
  DEAL_DELETE: 'deal.delete',

  // ── Commercial Events / Quotes ────────────────────────────────────────
  COMMERCIAL_EVENT_CREATE: 'commercial_event.create',
  COMMERCIAL_EVENT_UPDATE: 'commercial_event.update',
  COMMERCIAL_EVENT_DELETE: 'commercial_event.delete',
  QUOTE_CREATE: 'quote.create',
  QUOTE_UPDATE: 'quote.update',
  QUOTE_DELETE: 'quote.delete',

  // ── Finance ───────────────────────────────────────────────────────────
  BILL_CREATE: 'bill.create',
  BILL_UPDATE: 'bill.update',
  BILL_DELETE: 'bill.delete',
  LEDGER_CREATE: 'ledger.create',
  LEDGER_UPDATE: 'ledger.update',
  LEDGER_DELETE: 'ledger.delete',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_DELETE: 'invoice.delete',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_DELETE: 'payment.delete',
  FIN_CATEGORY_CREATE: 'fin_category.create',
  FIN_CATEGORY_UPDATE: 'fin_category.update',
  FIN_CATEGORY_DELETE: 'fin_category.delete',
  FIN_ACCOUNT_CREATE: 'fin_account.create',
  FIN_ACCOUNT_UPDATE: 'fin_account.update',
  FIN_ACCOUNT_DELETE: 'fin_account.delete',
  COST_CENTER_CREATE: 'cost_center.create',
  COST_CENTER_UPDATE: 'cost_center.update',
  COST_CENTER_DELETE: 'cost_center.delete',

  // ── Dynamic Pricing ────────────────────────────────────────────────────
  DYNAMIC_PRICING_UPDATE: 'dynamic_pricing.update',
  DYNAMIC_PRICING_TOGGLE: 'dynamic_pricing.toggle',
  DYNAMIC_PRICING_RULE_ADD: 'dynamic_pricing.rule_add',
  DYNAMIC_PRICING_RULE_REMOVE: 'dynamic_pricing.rule_remove',

  // ── Calendar / Parties ────────────────────────────────────────────────
  CALENDAR_CREATE: 'calendar.create',
  CALENDAR_UPDATE: 'calendar.update',
  CALENDAR_DELETE: 'calendar.delete',
  PARTY_CREATE: 'party.create',
  PARTY_UPDATE: 'party.update',
  PARTY_DELETE: 'party.delete',
} as const;

/**
 * Get audit logs for a franchise
 */
export async function getAuditLogs(
  franchiseId: string,
  options: {
    filter?: AuditLogFilter;
    pageSize?: number;
    lastDoc?: QueryDocumentSnapshot;
  } = {}
): Promise<{ logs: AuditLog[]; lastDoc?: QueryDocumentSnapshot }> {
  const { filter, pageSize = 20, lastDoc } = options;

  let q = query(
    collection(db, auditLogsPath(franchiseId)),
    orderBy('timestamp', 'desc'),
    limit(pageSize)
  );

  // Apply filters
  if (filter?.action) {
    q = query(q, where('action', '==', filter.action));
  }

  if (filter?.actorId) {
    q = query(q, where('actor.id', '==', filter.actorId));
  }

  if (filter?.targetType) {
    q = query(q, where('target.type', '==', filter.targetType));
  }

  if (filter?.startDate) {
    q = query(q, where('timestamp', '>=', Timestamp.fromDate(filter.startDate)));
  }

  if (filter?.endDate) {
    q = query(q, where('timestamp', '<=', Timestamp.fromDate(filter.endDate)));
  }

  // Pagination
  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);

  const logs: AuditLog[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate() || new Date(),
  })) as AuditLog[];

  return {
    logs,
    lastDoc: snapshot.docs[snapshot.docs.length - 1],
  };
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  franchiseId: string,
  data: CreateAuditLogData
): Promise<string> {
  const logData = {
    ...data,
    timestamp: serverTimestamp(),
  };

  const docRef = await addDoc(
    collection(db, auditLogsPath(franchiseId)),
    logData
  );

  return docRef.id;
}

/**
 * Log a user action
 */
export async function logUserAction(
  franchiseId: string,
  action: string,
  actor: { id: string; email: string; name?: string },
  target?: { type: string; id: string; name?: string },
  details?: Record<string, any>
): Promise<void> {
  await createAuditLog(franchiseId, {
    action,
    actor,
    target,
    details,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
}

/**
 * Log store action
 */
export async function logStoreAction(
  franchiseId: string,
  action: 'create' | 'update' | 'delete',
  actor: { id: string; email: string; name?: string },
  store: { id: string; name: string },
  details?: Record<string, any>
): Promise<void> {
  await logUserAction(
    franchiseId,
    `store.${action}`,
    actor,
    { type: 'store', id: store.id, name: store.name },
    details
  );
}

/**
 * Log settings change
 */
export async function logSettingsChange(
  franchiseId: string,
  actor: { id: string; email: string; name?: string },
  changes: Record<string, { old: any; new: any }>
): Promise<void> {
  await logUserAction(
    franchiseId,
    AuditActions.SETTINGS_UPDATE,
    actor,
    { type: 'franchise', id: franchiseId, name: 'settings' },
    { changes }
  );
}

/**
 * Log login
 */
export async function logLogin(
  franchiseId: string,
  user: { id: string; email: string; name?: string }
): Promise<void> {
  await logUserAction(franchiseId, AuditActions.USER_LOGIN, user);
}

/**
 * Log logout
 */
export async function logLogout(
  franchiseId: string,
  user: { id: string; email: string; name?: string }
): Promise<void> {
  await logUserAction(franchiseId, AuditActions.USER_LOGOUT, user);
}

/**
 * Get action label for display
 */
export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    // Auth
    'user.login': 'Login',
    'user.logout': 'Logout',
    'user.register': 'Registro de conta',
    'user.password_reset': 'Reset de senha solicitado',
    'user.password_change': 'Senha alterada',
    // Users / Team
    'user.invite': 'Convite enviado',
    'user.accept_invite': 'Convite aceito',
    'user.role_change': 'Função alterada',
    'user.remove': 'Membro removido',
    'user.invite_revoke': 'Convite revogado',
    'user.invite_resend': 'Convite reenviado',
    'user.profile_update': 'Perfil atualizado',
    // Store
    'store.create': 'Loja criada',
    'store.update': 'Loja atualizada',
    'store.delete': 'Loja excluída',
    'store.toggle_status': 'Status da loja alterado',
    'store.settings_update': 'Config. de loja atualizada',
    'store.member_add': 'Operador adicionado à loja',
    'store.member_remove': 'Operador removido da loja',
    // Product
    'product.create': 'Produto criado',
    'product.update': 'Produto atualizado',
    'product.delete': 'Produto excluído',
    // Order
    'order.create': 'Pedido criado',
    'order.update': 'Pedido atualizado',
    'order.cancel': 'Pedido cancelado',
    'order.refund': 'Pedido reembolsado',
    // Settings
    'settings.update': 'Configurações atualizadas',
    // Franchise
    'franchise.create': 'Franquia criada',
    'franchise.update': 'Franquia atualizada',
    'franchise.delete': 'Franquia excluída',
    // Kegs / Taps
    'keg.create': 'Barril cadastrado',
    'keg.status_update': 'Status do barril alterado',
    'tap.connect': 'Barril conectado à torneira',
    'tap.disconnect': 'Barril desconectado da torneira',
    // Wastage / Maintenance
    'wastage.create': 'Perda registrada',
    'maintenance.schedule': 'Manutenção agendada',
    'maintenance.complete': 'Manutenção concluída',
    'maintenance.cancel': 'Manutenção cancelada',
    // TV / Events / Ranking
    'tv.config_update': 'Config. TV atualizada',
    'event.mode_toggle': 'Modo evento alterado',
    'event.goal_set': 'Meta coletiva definida',
    'event.goal_disable': 'Meta coletiva desabilitada',
    'challenge.create': 'Desafio criado',
    'challenge.activate': 'Desafio ativado',
    'challenge.delete': 'Desafio excluído',
    'prize.add': 'Prêmio adicionado',
    'prize.redeem': 'Prêmio resgatado',
    'golden_serve.update': 'Golden Serve atualizado',
    'ranking.reset': 'Ranking resetado',
    // Billing
    'billing.checkout': 'Checkout de upgrade iniciado',
    'billing.portal_open': 'Portal de cobrança aberto',
    // CRM
    'customer.create': 'Cliente cadastrado',
    'customer.update': 'Cliente atualizado',
    'customer.delete': 'Cliente excluído',
    'deal.create': 'Negociação criada',
    'deal.update': 'Negociação atualizada',
    'deal.stage_change': 'Estágio de negociação alterado',
    'deal.delete': 'Negociação excluída',
    // Commercial Events / Quotes
    'commercial_event.create': 'Evento comercial criado',
    'commercial_event.update': 'Evento comercial atualizado',
    'commercial_event.delete': 'Evento comercial excluído',
    'quote.create': 'Proposta criada',
    'quote.update': 'Proposta atualizada',
    'quote.delete': 'Proposta excluída',
    // Finance
    'bill.create': 'Conta a pagar criada',
    'bill.update': 'Conta a pagar atualizada',
    'bill.delete': 'Conta a pagar excluída',
    'ledger.create': 'Lançamento contábil criado',
    'ledger.update': 'Lançamento contábil atualizado',
    'ledger.delete': 'Lançamento contábil excluído',
    'invoice.create': 'Fatura criada',
    'invoice.update': 'Fatura atualizada',
    'invoice.delete': 'Fatura excluída',
    'payment.create': 'Pagamento registrado',
    'payment.delete': 'Pagamento excluído',
    'fin_category.create': 'Categoria financeira criada',
    'fin_category.update': 'Categoria financeira atualizada',
    'fin_category.delete': 'Categoria financeira excluída',
    'fin_account.create': 'Conta financeira criada',
    'fin_account.update': 'Conta financeira atualizada',
    'fin_account.delete': 'Conta financeira excluída',
    'cost_center.create': 'Centro de custo criado',
    'cost_center.update': 'Centro de custo atualizado',
    'cost_center.delete': 'Centro de custo excluído',
    // Calendar / Parties
    'calendar.create': 'Evento de agenda criado',
    'calendar.update': 'Evento de agenda atualizado',
    'calendar.delete': 'Evento de agenda excluído',
    'party.create': 'Fornecedor/parte cadastrado',
    'party.update': 'Fornecedor/parte atualizado',
    'party.delete': 'Fornecedor/parte excluído',
  };

  return labels[action] || action;
}

/**
 * Get action icon name
 */
export function getActionIcon(action: string): string {
  const icons: Record<string, string> = {
    'user.login': 'log-in',
    'user.logout': 'log-out',
    'user.invite': 'user-plus',
    'user.accept_invite': 'user-check',
    'user.role_change': 'shield',
    'user.remove': 'user-minus',
    'store.create': 'store',
    'store.update': 'edit',
    'store.delete': 'trash-2',
    'product.create': 'package-plus',
    'product.update': 'package',
    'product.delete': 'package-x',
    'order.create': 'shopping-cart',
    'order.update': 'shopping-bag',
    'order.cancel': 'x-circle',
    'settings.update': 'settings',
    'franchise.update': 'building-2',
  };

  return icons[action] || 'activity';
}
