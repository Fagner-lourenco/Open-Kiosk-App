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
  // User actions
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_INVITE: 'user.invite',
  USER_ACCEPT_INVITE: 'user.accept_invite',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_REMOVE: 'user.remove',

  // Store actions
  STORE_CREATE: 'store.create',
  STORE_UPDATE: 'store.update',
  STORE_DELETE: 'store.delete',
  STORE_TOGGLE_STATUS: 'store.toggle_status',

  // Product actions
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',

  // Order actions
  ORDER_CREATE: 'order.create',
  ORDER_UPDATE: 'order.update',
  ORDER_CANCEL: 'order.cancel',

  // Settings actions
  SETTINGS_UPDATE: 'settings.update',

  // Franchise actions
  FRANCHISE_UPDATE: 'franchise.update',
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
    'user.login': 'Login',
    'user.logout': 'Logout',
    'user.invite': 'Convite enviado',
    'user.accept_invite': 'Convite aceito',
    'user.role_change': 'Função alterada',
    'user.remove': 'Usuário removido',
    'store.create': 'Loja criada',
    'store.update': 'Loja atualizada',
    'store.delete': 'Loja excluída',
    'store.toggle_status': 'Status da loja alterado',
    'product.create': 'Produto criado',
    'product.update': 'Produto atualizado',
    'product.delete': 'Produto excluído',
    'order.create': 'Pedido criado',
    'order.update': 'Pedido atualizado',
    'order.cancel': 'Pedido cancelado',
    'settings.update': 'Configurações atualizadas',
    'franchise.update': 'Franquia atualizada',
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
