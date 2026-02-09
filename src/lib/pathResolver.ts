/**
 * ============================================================================
 * Path Resolver - Paths Canônicos (Franchise)
 * ============================================================================
 * 
 * Este módulo resolve paths canônicos do Firestore
 * para o modelo multi-franquia.
 * 
 * Paths:
 *   - franchises/{franchiseId}/stores/{storeId}/products
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

// ============================================================================
// PATH RESOLVERS (CANONICAL)
// ============================================================================

/**
 * Retorna o path base para a collection de lojas
 * 
 * @param franchiseId - ID da franquia (obrigatório em modo franquia)
 * @returns Path da collection de lojas
 * 
 * @example
 * // Modo franquia (canônico)
 * storesPath("franchise123") // => "franchises/franchise123/stores"
 */
export function storesPath(franchiseId: string): string {
  if (!franchiseId) {
    throw new Error('[PathResolver] franchiseId obrigatório para storesPath');
  }
  return `franchises/${franchiseId}/stores`;
}

/**
 * Retorna o path para um documento de loja específico
 * 
 * @param franchiseId - ID da franquia (obrigatório)
 * @param storeId - ID da loja
 * @returns Path do documento da loja
 * 
 * @example
 * // Modo franquia (canônico)
 * storePath("franchise123", "loja001") // => "franchises/franchise123/stores/loja001"
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
  | 'taps'
  | 'kegs'
  | 'tapAssignments'
  | 'servingSessions'
  | 'wastageEvents'
  | 'maintenanceLogs'
  | 'notifications';

/**
 * Retorna o path de uma subcollection da loja
 * 
 * @param franchiseId - ID da franquia (obrigatório)
 * @param storeId - ID da loja
 * @param subcollection - Nome da subcollection
 * @returns Path da subcollection
 * 
 * @example
 * // Modo franquia (canônico)
 * storeSubPath("franchise123", "loja001", "products") 
 * // => "franchises/franchise123/stores/loja001/products"
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
 * Retorna o path completo de um documento em subcollection
 * 
 * @param franchiseId - ID da franquia
 * @param storeId - ID da loja
 * @param subcollection - Nome da subcollection
 * @param docId - ID do documento
 * @returns Path completo do documento
 */
export function storeDocPath(
  franchiseId: string,
  storeId: string,
  subcollection: StoreSubcollection,
  docId: string
): string {
  return `${storeSubPath(franchiseId, storeId, subcollection)}/${docId}`;
}

// ============================================================================
// COLLECTIONS GLOBAIS (sempre no mesmo lugar)
// ============================================================================

/**
 * Tipos de collections globais
 */
export type GlobalCollection =
  | 'users'
  | 'franchises'
  | 'invitations'
  | 'audit_logs';

/**
 * Retorna o path de uma collection global
 * Collections globais ficam na raiz do Firestore, não pertencem a uma loja
 * 
 * @param collectionName - Nome da collection global
 * @returns Path da collection
 * 
 * @example
 * globalCollectionPath('users') // => "users"
 * globalCollectionPath('franchises') // => "franchises"
 */
export function globalCollectionPath(collectionName: GlobalCollection): string {
  return collectionName;
}

/**
 * Path da collection de usuários (global)
 */
export const usersPath = (): string => 'users';

/**
 * Path da collection de franquias (global)
 */
export const franchisesPath = (): string => 'franchises';

/**
 * Path para um documento de franquia específico
 */
export const franchisePath = (franchiseId: string): string => `franchises/${franchiseId}`;

/**
 * Path da collection de membros de uma franquia
 */
export const franchiseMembersPath = (franchiseId: string): string =>
  `franchises/${franchiseId}/members`;

/**
 * Path da collection de convites (global)
 */
export const invitationsPath = (): string => 'invitations';

/**
 * Path da collection de logs de auditoria (franquia)
 */
export const auditLogsPath = (franchiseId: string): string => {
  if (!franchiseId) {
    throw new Error('[PathResolver] franchiseId obrigatório para auditLogsPath');
  }
  return `franchises/${franchiseId}/auditLogs`;
};


