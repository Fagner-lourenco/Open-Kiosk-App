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
  // Stores
  | 'store.create'
  | 'store.update'
  | 'store.delete'
  | 'store.activate'
  | 'store.deactivate'
  // Products
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  // Inventory
  | 'inventory.adjust'
  | 'inventory.restock'
  // Sales
  | 'order.create'
  | 'order.update'
  | 'order.refund'
  // Settings
  | 'settings.update'
  | 'settings.payment_gateway'
  // ESP32
  | 'esp32.connect'
  | 'esp32.disconnect'
  | 'esp32.configure'
  // Franchise
  | 'franchise.create'
  | 'franchise.update'
  | 'franchise.delete';

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
  | 'invitations';

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
  'store.create': 'Loja criada',
  'store.update': 'Loja atualizada',
  'store.delete': 'Loja excluída',
  'store.activate': 'Loja ativada',
  'store.deactivate': 'Loja desativada',
  'product.create': 'Produto criado',
  'product.update': 'Produto atualizado',
  'product.delete': 'Produto excluído',
  'inventory.adjust': 'Estoque ajustado',
  'inventory.restock': 'Estoque reposto',
  'order.create': 'Pedido criado',
  'order.update': 'Pedido atualizado',
  'order.refund': 'Pedido reembolsado',
  'settings.update': 'Configurações alteradas',
  'settings.payment_gateway': 'Gateway de pagamento alterado',
  'esp32.connect': 'ESP32 conectado',
  'esp32.disconnect': 'ESP32 desconectado',
  'esp32.configure': 'ESP32 configurado',
  'franchise.create': 'Franquia criada',
  'franchise.update': 'Franquia atualizada',
  'franchise.delete': 'Franquia excluída',
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
  'store.create': 'Store',
  'store.update': 'Edit',
  'store.delete': 'Trash2',
  'store.activate': 'CheckCircle',
  'store.deactivate': 'XCircle',
  'product.create': 'PackagePlus',
  'product.update': 'Package',
  'product.delete': 'PackageMinus',
  'inventory.adjust': 'ClipboardEdit',
  'inventory.restock': 'PackageCheck',
  'order.create': 'ShoppingCart',
  'order.update': 'ShoppingBag',
  'order.refund': 'RotateCcw',
  'settings.update': 'Settings',
  'settings.payment_gateway': 'CreditCard',
  'esp32.connect': 'Plug',
  'esp32.disconnect': 'Unplug',
  'esp32.configure': 'Cpu',
  'franchise.create': 'Building2',
  'franchise.update': 'Building',
  'franchise.delete': 'Trash',
};
