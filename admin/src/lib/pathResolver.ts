/**
 * ============================================================================
 * Path Resolver
 * ============================================================================
 * 
 * Resolve paths do Firestore com suporte a feature flag para modo franquia.
 * 
 * Quando franchiseMode está ativo:
 *   - stores/{storeId} → franchises/{franchiseId}/stores/{storeId}
 *   - produtos ficam sob a loja dentro da franquia
 * 
 * Quando franchiseMode está desativado:
 *   - Mantém estrutura legada: stores/{storeId}
 */

/**
 * Verifica se o modo franquia está ativo
 * Default: true para compatibilidade com Kiosk
 */
export function franchiseMode(): boolean {
  // Verificar localStorage primeiro (para toggle dinâmico)
  const localValue = localStorage.getItem('franchiseMode');
  if (localValue !== null) {
    return localValue === 'true';
  }

  // Verificar variável de ambiente (default true)
  return import.meta.env.VITE_FRANCHISE_MODE !== 'false';
}

/**
 * Ativar/desativar modo franquia dinamicamente
 */
export function setFranchiseMode(enabled: boolean): void {
  localStorage.setItem('franchiseMode', enabled.toString());
}

/**
 * Retorna o path de uma coleção de lojas
 */
export function storesPath(franchiseId?: string): string {
  if (franchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/stores`;
  }
  return 'stores';
}

/**
 * Retorna o path de uma loja específica
 */
export function storePath(franchiseId: string | undefined, storeId: string): string {
  if (franchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/stores/${storeId}`;
  }
  return `stores/${storeId}`;
}

/**
 * Tipos de subcollections suportadas
 */
export type StoreSubcollection =
  | 'products'
  | 'orders'
  | 'sales'
  | 'settings'
  | 'dispensers'
  | 'inventoryLogs'
  | 'inventory_logs'
  | 'dailyStats'
  | 'metrics';

/**
 * Retorna o path de uma subcollection da loja
 */
export function storeSubPath(
  franchiseId: string | undefined,
  storeId: string,
  subcollection: StoreSubcollection
): string {
  const normalizedSubcollection = subcollection === 'inventory_logs'
    ? 'inventoryLogs'
    : subcollection;
  if (franchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/stores/${storeId}/${normalizedSubcollection}`;
  }
  return `stores/${storeId}/${normalizedSubcollection}`;
}

/**
 * Retorna o path de um documento específico dentro de uma subcollection da loja
 */
export function storeDocPath(
  franchiseId: string | undefined,
  storeId: string,
  subcollection: StoreSubcollection,
  docId: string
): string {
  return `${storeSubPath(franchiseId, storeId, subcollection)}/${docId}`;
}

/**
 * Retorna o path da coleção de membros de uma franquia
 */
export function membersPath(franchiseId: string): string {
  return `franchises/${franchiseId}/members`;
}

/**
 * Retorna o path de um membro específico
 */
export function memberPath(franchiseId: string, memberId: string): string {
  return `franchises/${franchiseId}/members/${memberId}`;
}

/**
 * Retorna o path de convites
 * NOTA: Usa coleção global para compatibilidade com Cloud Functions
 */
export function invitationsPath(): string {
  return 'invitations';
}

/**
 * Retorna o path de logs de auditoria
 */
export function auditLogsPath(franchiseId: string): string {
  return `franchises/${franchiseId}/auditLogs`;
}

/**
 * Retorna o path de uma franquia
 */
export function franchisePath(franchiseId: string): string {
  return `franchises/${franchiseId}`;
}

/**
 * Retorna o path de um usuário global
 */
export function userPath(userId: string): string {
  return `users/${userId}`;
}

/**
 * Retorna o path da coleção de pedidos de uma loja
 * Usa 'orders' como nome padrão (compatível com Kiosk App)
 */
export function ordersPath(franchiseId: string | undefined, storeId: string): string {
  return storeSubPath(franchiseId, storeId, 'orders');
}

/**
 * Retorna o path da coleção de notificações da franquia
 */
export function franchiseNotificationsPath(franchiseId: string): string {
  return `franchises/${franchiseId}/notifications`;
}

/**
 * Retorna o path da coleção de eventos de billing
 */
export function billingEventsPath(franchiseId: string): string {
  return `franchises/${franchiseId}/billingEvents`;
}

/**
 * Helpers para migração de dados
 */
export const pathResolver = {
  franchiseMode,
  setFranchiseMode,
  storesPath,
  storePath,
  storeSubPath,
  storeDocPath,
  ordersPath,
  membersPath,
  memberPath,
  invitationsPath,
  auditLogsPath,
  franchisePath,
  userPath,
};

export default pathResolver;
