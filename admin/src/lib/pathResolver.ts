/**
 * ============================================================================
 * Path Resolver
 * ============================================================================
 * 
 * Resolve paths do Firestore no modo canônico (franquia).
 * 
 * - franchises/{franchiseId}/stores/{storeId}
 * - produtos ficam sob a loja dentro da franquia
 */

/**
 * Retorna o path de uma coleção de lojas
 */
export function storesPath(franchiseId: string): string {
  if (!franchiseId) {
    throw new Error('[PathResolver] franchiseId obrigatório para storesPath');
  }
  return `franchises/${franchiseId}/stores`;
}

/**
 * Retorna o path de uma loja específica
 */
export function storePath(franchiseId: string, storeId: string): string {
  if (!franchiseId) {
    throw new Error('[PathResolver] franchiseId obrigatório para storePath');
  }
  return `franchises/${franchiseId}/stores/${storeId}`;
}

/**
 * Tipos de subcollections suportadas
 */
export type StoreSubcollection =
  | 'products'
  | 'orders'
  | 'settings'
  | 'dispensers'
  | 'inventoryLogs'
  | 'dailyStats'
  | 'metrics'
  | 'rankingAgg'
  | 'challenges'
  | 'prizes';

/**
 * Retorna o path de uma subcollection da loja
 */
export function storeSubPath(
  franchiseId: string,
  storeId: string,
  subcollection: StoreSubcollection
): string {
  if (!franchiseId) {
    throw new Error('[PathResolver] franchiseId obrigatório para storeSubPath');
  }
  return `franchises/${franchiseId}/stores/${storeId}/${subcollection}`;
}

/**
 * Retorna o path de um documento específico dentro de uma subcollection da loja
 */
export function storeDocPath(
  franchiseId: string,
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
export function ordersPath(franchiseId: string, storeId: string): string {
  return storeSubPath(franchiseId, storeId, 'orders');
}

/**
 * Retorna o path do doc tvConfig de uma loja
 */
export function tvConfigPath(franchiseId: string, storeId: string): string {
  return `${storePath(franchiseId, storeId)}/tvConfig/current`;
}

/**
 * Retorna o path do doc eventStats de uma loja
 */
export function eventStatsPath(franchiseId: string, storeId: string): string {
  return `${storePath(franchiseId, storeId)}/eventStats/current`;
}

/**
 * Retorna o path da coleção de ranking agregado de uma loja
 */
export function rankingAggPath(franchiseId: string, storeId: string): string {
  return storeSubPath(franchiseId, storeId, 'rankingAgg');
}

/**
 * Retorna o path da coleção de desafios de uma loja
 */
export function challengesPath(franchiseId: string, storeId: string): string {
  return storeSubPath(franchiseId, storeId, 'challenges');
}

/**
 * Retorna o path da coleção de prêmios de uma loja
 */
export function prizesPath(franchiseId: string, storeId: string): string {
  return storeSubPath(franchiseId, storeId, 'prizes');
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
  tvConfigPath,
  eventStatsPath,
  rankingAggPath,
  challengesPath,
  prizesPath,
};

export default pathResolver;
