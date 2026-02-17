/**
 * ============================================================================
 * Audit Types
 * ============================================================================
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Ações de auditoria
 */
export type AuditAction =
  // Auth
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.password_reset'
  | 'user.password_change'
  // Users
  | 'user.invite'
  | 'user.accept_invite'
  | 'user.role_change'
  | 'user.remove'
  | 'user.invite_revoke'
  | 'user.invite_resend'
  | 'user.profile_update'
  // Stores
  | 'store.create'
  | 'store.update'
  | 'store.delete'
  | 'store.toggle_status'
  | 'store.settings_update'
  | 'store.member_add'
  | 'store.member_remove'
  // Products
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  // Orders
  | 'order.create'
  | 'order.update'
  | 'order.cancel'
  | 'order.refund'
  // Settings
  | 'settings.update'
  // Franchise
  | 'franchise.create'
  | 'franchise.update'
  | 'franchise.delete'
  // Kegs / Taps
  | 'keg.create'
  | 'keg.status_update'
  | 'tap.connect'
  | 'tap.disconnect'
  // Wastage / Maintenance
  | 'wastage.create'
  | 'maintenance.schedule'
  | 'maintenance.complete'
  | 'maintenance.cancel'
  // TV / Events / Ranking
  | 'tv.config_update'
  | 'event.mode_toggle'
  | 'event.goal_set'
  | 'event.goal_disable'
  | 'challenge.create'
  | 'challenge.activate'
  | 'challenge.delete'
  | 'prize.add'
  | 'prize.redeem'
  | 'golden_serve.update'
  | 'ranking.reset'
  // Billing
  | 'billing.checkout'
  | 'billing.portal_open'
  // CRM
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'deal.create'
  | 'deal.update'
  | 'deal.stage_change'
  | 'deal.delete'
  // Commercial Events / Quotes
  | 'commercial_event.create'
  | 'commercial_event.update'
  | 'commercial_event.delete'
  | 'quote.create'
  | 'quote.update'
  | 'quote.delete'
  // Finance
  | 'bill.create'
  | 'bill.update'
  | 'bill.delete'
  | 'ledger.create'
  | 'ledger.update'
  | 'ledger.delete'
  | 'invoice.create'
  | 'invoice.update'
  | 'invoice.delete'
  | 'payment.create'
  | 'payment.delete'
  | 'fin_category.create'
  | 'fin_category.update'
  | 'fin_category.delete'
  | 'fin_account.create'
  | 'fin_account.update'
  | 'fin_account.delete'
  | 'cost_center.create'
  | 'cost_center.update'
  | 'cost_center.delete'
  // Dynamic Pricing
  | 'dynamic_pricing.update'
  | 'dynamic_pricing.toggle'
  | 'dynamic_pricing.rule_add'
  | 'dynamic_pricing.rule_remove'
  // Calendar / Parties
  | 'calendar.create'
  | 'calendar.update'
  | 'calendar.delete'
  | 'party.create'
  | 'party.update'
  | 'party.delete';

/**
 * Recursos que podem ser auditados
 */
export type AuditResource =
  | 'users'
  | 'stores'
  | 'products'
  | 'sales'
  | 'orders'
  | 'inventory'
  | 'settings'
  | 'esp32'
  | 'franchise'
  | 'invitations'
  | 'kegs'
  | 'taps'
  | 'maintenance'
  | 'wastage'
  | 'tv'
  | 'events'
  | 'challenges'
  | 'prizes'
  | 'ranking'
  | 'billing'
  | 'customers'
  | 'deals'
  | 'commercial_events'
  | 'quotes'
  | 'finance'
  | 'payments'
  | 'user'
  | 'store'
  | 'product'
  | 'order'
  | 'keg'
  | 'tap'
  | 'challenge'
  | 'prize'
  | 'customer'
  | 'deal'
  | 'commercial_event'
  | 'quote'
  | 'bill'
  | 'invoice'
  | 'ledger'
  | 'payment'
  | 'category'
  | 'account'
  | 'cost_center'
  | 'calendar'
  | 'party'
  | 'dynamic_pricing';

/**
 * Ator que realizou a ação
 */
export interface AuditActor {
  id: string;
  email: string;
  name?: string;
}

/**
 * Alvo da ação
 */
export interface AuditTarget {
  type: AuditResource;
  id: string;
  name?: string;
}

/**
 * Log de auditoria
 */
export interface AuditLog {
  id: string;
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  details?: Record<string, unknown>;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  franchiseId: string;
  storeId?: string;
  ip?: string;
  userAgent?: string;
  timestamp: Timestamp | Date;
}

/**
 * Filtros de auditoria
 */
export interface AuditFilters {
  action?: AuditAction;
  resource?: AuditResource;
  actorId?: string;
  storeId?: string;
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}

/**
 * Labels para ações de auditoria
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'user.login': 'Login',
  'user.logout': 'Logout',
  'user.register': 'Registro',
  'user.password_reset': 'Recuperação de senha',
  'user.password_change': 'Alteração de senha',
  'user.invite': 'Convite enviado',
  'user.accept_invite': 'Convite aceito',
  'user.role_change': 'Alteração de função',
  'user.remove': 'Usuário removido',
  'user.invite_revoke': 'Convite revogado',
  'user.invite_resend': 'Convite reenviado',
  'user.profile_update': 'Perfil atualizado',
  'store.create': 'Loja criada',
  'store.update': 'Loja atualizada',
  'store.delete': 'Loja excluída',
  'store.toggle_status': 'Status da loja alterado',
  'store.settings_update': 'Configurações da loja atualizadas',
  'store.member_add': 'Membro adicionado à loja',
  'store.member_remove': 'Membro removido da loja',
  'product.create': 'Produto criado',
  'product.update': 'Produto atualizado',
  'product.delete': 'Produto excluído',
  'order.create': 'Pedido criado',
  'order.update': 'Pedido atualizado',
  'order.cancel': 'Pedido cancelado',
  'order.refund': 'Pedido reembolsado',
  'settings.update': 'Configurações alteradas',
  'franchise.create': 'Franquia criada',
  'franchise.update': 'Franquia atualizada',
  'franchise.delete': 'Franquia excluída',
  'keg.create': 'Barril criado',
  'keg.status_update': 'Status do barril atualizado',
  'tap.connect': 'Torneira conectada',
  'tap.disconnect': 'Torneira desconectada',
  'wastage.create': 'Desperdício registrado',
  'maintenance.schedule': 'Manutenção agendada',
  'maintenance.complete': 'Manutenção concluída',
  'maintenance.cancel': 'Manutenção cancelada',
  'tv.config_update': 'Config do telão atualizada',
  'event.mode_toggle': 'Modo evento alternado',
  'event.goal_set': 'Meta coletiva definida',
  'event.goal_disable': 'Meta coletiva desabilitada',
  'challenge.create': 'Desafio criado',
  'challenge.activate': 'Desafio ativado',
  'challenge.delete': 'Desafio excluído',
  'prize.add': 'Prêmio adicionado',
  'prize.redeem': 'Prêmio resgatado',
  'golden_serve.update': 'Serve dourado atualizado',
  'ranking.reset': 'Ranking resetado',
  'billing.checkout': 'Checkout de faturamento',
  'billing.portal_open': 'Portal de faturamento aberto',
  'customer.create': 'Cliente criado',
  'customer.update': 'Cliente atualizado',
  'customer.delete': 'Cliente excluído',
  'deal.create': 'Negócio criado',
  'deal.update': 'Negócio atualizado',
  'deal.stage_change': 'Estágio do negócio alterado',
  'deal.delete': 'Negócio excluído',
  'commercial_event.create': 'Evento comercial criado',
  'commercial_event.update': 'Evento comercial atualizado',
  'commercial_event.delete': 'Evento comercial excluído',
  'quote.create': 'Proposta criada',
  'quote.update': 'Proposta atualizada',
  'quote.delete': 'Proposta excluída',
  'bill.create': 'Conta criada',
  'bill.update': 'Conta atualizada',
  'bill.delete': 'Conta excluída',
  'ledger.create': 'Lançamento criado',
  'ledger.update': 'Lançamento atualizado',
  'ledger.delete': 'Lançamento excluído',
  'invoice.create': 'Fatura criada',
  'invoice.update': 'Fatura atualizada',
  'invoice.delete': 'Fatura excluída',
  'payment.create': 'Pagamento criado',
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
  'dynamic_pricing.update': 'Preço dinâmico atualizado',
  'dynamic_pricing.toggle': 'Preço dinâmico alternado',
  'dynamic_pricing.rule_add': 'Regra de preço adicionada',
  'dynamic_pricing.rule_remove': 'Regra de preço removida',
  'calendar.create': 'Evento de calendário criado',
  'calendar.update': 'Evento de calendário atualizado',
  'calendar.delete': 'Evento de calendário excluído',
  'party.create': 'Terceiro criado',
  'party.update': 'Terceiro atualizado',
  'party.delete': 'Terceiro excluído',
};

/**
 * Ícones para ações (Lucide icon names)
 */
export const AUDIT_ACTION_ICONS: Record<AuditAction, string> = {
  'user.login': 'LogIn',
  'user.logout': 'LogOut',
  'user.register': 'UserPlus',
  'user.password_reset': 'KeyRound',
  'user.password_change': 'Key',
  'user.invite': 'Mail',
  'user.accept_invite': 'UserCheck',
  'user.role_change': 'UserCog',
  'user.remove': 'UserMinus',
  'user.invite_revoke': 'MailX',
  'user.invite_resend': 'MailPlus',
  'user.profile_update': 'UserCog',
  'store.create': 'Store',
  'store.update': 'Edit',
  'store.delete': 'Trash2',
  'store.toggle_status': 'ToggleRight',
  'store.settings_update': 'Settings',
  'store.member_add': 'UserPlus',
  'store.member_remove': 'UserMinus',
  'product.create': 'PackagePlus',
  'product.update': 'Package',
  'product.delete': 'PackageMinus',
  'order.create': 'ShoppingCart',
  'order.update': 'ShoppingBag',
  'order.cancel': 'XCircle',
  'order.refund': 'RotateCcw',
  'settings.update': 'Settings',
  'franchise.create': 'Building2',
  'franchise.update': 'Building',
  'franchise.delete': 'Trash',
  'keg.create': 'Beer',
  'keg.status_update': 'Beer',
  'tap.connect': 'Plug',
  'tap.disconnect': 'Unplug',
  'wastage.create': 'AlertTriangle',
  'maintenance.schedule': 'Wrench',
  'maintenance.complete': 'CheckCircle',
  'maintenance.cancel': 'XCircle',
  'tv.config_update': 'Monitor',
  'event.mode_toggle': 'ToggleRight',
  'event.goal_set': 'Target',
  'event.goal_disable': 'XCircle',
  'challenge.create': 'Trophy',
  'challenge.activate': 'Zap',
  'challenge.delete': 'Trash2',
  'prize.add': 'Gift',
  'prize.redeem': 'Gift',
  'golden_serve.update': 'Star',
  'ranking.reset': 'RotateCcw',
  'billing.checkout': 'CreditCard',
  'billing.portal_open': 'ExternalLink',
  'customer.create': 'UserPlus',
  'customer.update': 'UserCog',
  'customer.delete': 'UserMinus',
  'deal.create': 'Handshake',
  'deal.update': 'Edit',
  'deal.stage_change': 'ArrowRight',
  'deal.delete': 'Trash2',
  'commercial_event.create': 'Calendar',
  'commercial_event.update': 'Edit',
  'commercial_event.delete': 'Trash2',
  'quote.create': 'FileText',
  'quote.update': 'Edit',
  'quote.delete': 'Trash2',
  'bill.create': 'Receipt',
  'bill.update': 'Edit',
  'bill.delete': 'Trash2',
  'ledger.create': 'BookOpen',
  'ledger.update': 'Edit',
  'ledger.delete': 'Trash2',
  'invoice.create': 'FileText',
  'invoice.update': 'Edit',
  'invoice.delete': 'Trash2',
  'payment.create': 'DollarSign',
  'payment.delete': 'Trash2',
  'fin_category.create': 'FolderPlus',
  'fin_category.update': 'Folder',
  'fin_category.delete': 'FolderMinus',
  'fin_account.create': 'Wallet',
  'fin_account.update': 'Wallet',
  'fin_account.delete': 'Trash2',
  'cost_center.create': 'Building',
  'cost_center.update': 'Edit',
  'cost_center.delete': 'Trash2',
  'dynamic_pricing.update': 'TrendingUp',
  'dynamic_pricing.toggle': 'ToggleRight',
  'dynamic_pricing.rule_add': 'Plus',
  'dynamic_pricing.rule_remove': 'Minus',
  'calendar.create': 'Calendar',
  'calendar.update': 'Edit',
  'calendar.delete': 'Trash2',
  'party.create': 'UserPlus',
  'party.update': 'Edit',
  'party.delete': 'Trash2',
};
