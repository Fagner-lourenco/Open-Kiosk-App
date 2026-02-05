/**
 * ============================================================================
 * Path Resolver - Compatibilidade Single-Tenant ↔ Multi-Tenant
 * ============================================================================
 * 
 * Este módulo resolve paths do Firestore para suportar migração gradual
 * do modelo single-tenant (atual) para multi-tenant (franquias).
 * 
 * MODO LEGADO (franchiseMode = false):
 *   - Paths: stores/{storeId}/products
 *   - Compatível com o sistema atual
 * 
 * MODO FRANQUIA (franchiseMode = true):
 *   - Paths: franchises/{franchiseId}/stores/{storeId}/products
 *   - Novo modelo multi-franquia
 * 
 * A migração é controlada por feature flag para rollout gradual.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Verifica se o modo franquia está habilitado
 * 
 * Fontes de configuração (em ordem de prioridade):
 * 1. localStorage('franchiseMode') - para testes locais
 * 2. import.meta.env.VITE_FRANCHISE_MODE - para deploy
 * 3. false (padrão) - modo legado para compatibilidade
 * 
 * @returns true se modo franquia está ativo
 */
export const isFranchiseMode = (): boolean => {
  // 1. Verificar localStorage (para testes)
  const localFlag = localStorage.getItem('franchiseMode');
  if (localFlag !== null) {
    return localFlag === 'true';
  }

  // 2. Verificar variável de ambiente
  if (import.meta.env.VITE_FRANCHISE_MODE !== undefined) {
    return import.meta.env.VITE_FRANCHISE_MODE === 'true';
  }

  // 3. Padrão: modo franquia ativo (compatível com Admin)
  return true;
};

/**
 * Habilita/desabilita modo franquia (para testes)
 */
export const setFranchiseMode = (enabled: boolean): void => {
  localStorage.setItem('franchiseMode', String(enabled));
  console.log(`[PathResolver] Franchise mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

// ============================================================================
// PATH RESOLVERS
// ============================================================================

/**
 * Retorna o path base para a collection de lojas
 * 
 * @param franchiseId - ID da franquia (obrigatório em modo franquia)
 * @returns Path da collection de lojas
 * 
 * @example
 * // Modo legado
 * storesPath() // => "stores"
 * 
 * // Modo franquia
 * storesPath("franchise123") // => "franchises/franchise123/stores"
 */
export function storesPath(franchiseId?: string): string {
  if (isFranchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/stores`;
  }
  return 'stores';
}

/**
 * Retorna o path para um documento de loja específico
 * 
 * @param franchiseId - ID da franquia (opcional em modo legado)
 * @param storeId - ID da loja
 * @returns Path do documento da loja
 * 
 * @example
 * // Modo legado
 * storePath(undefined, "loja001") // => "stores/loja001"
 * 
 * // Modo franquia
 * storePath("franchise123", "loja001") // => "franchises/franchise123/stores/loja001"
 */
export function storePath(franchiseId: string | undefined, storeId: string): string {
  if (isFranchiseMode() && franchiseId) {
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
 * 
 * @param franchiseId - ID da franquia (opcional em modo legado)
 * @param storeId - ID da loja
 * @param subcollection - Nome da subcollection
 * @returns Path da subcollection
 * 
 * @example
 * // Modo legado
 * storeSubPath(undefined, "loja001", "products") 
 * // => "stores/loja001/products"
 * 
 * // Modo franquia
 * storeSubPath("franchise123", "loja001", "products") 
 * // => "franchises/franchise123/stores/loja001/products"
 */
export function storeSubPath(
  franchiseId: string | undefined,
  storeId: string,
  subcollection: StoreSubcollection
): string {
  const normalizedSubcollection = subcollection === 'inventory_logs'
    ? 'inventoryLogs'
    : subcollection;
  if (isFranchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/stores/${storeId}/${normalizedSubcollection}`;
  }
  return `stores/${storeId}/${normalizedSubcollection}`;
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
  franchiseId: string | undefined,
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
  | 'audit_logs'
  | 'roles';

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
 * Path da collection de logs de auditoria
 * Suporta modo franquia (scoped: auditLogs) ou legado (global: audit_logs)
 */
export const auditLogsPath = (franchiseId?: string): string => {
  if (isFranchiseMode() && franchiseId) {
    return `franchises/${franchiseId}/auditLogs`;
  }
  return 'audit_logs';
};

/**
 * Path da collection de roles/templates (global)
 */
export const rolesPath = (): string => 'roles';

// ============================================================================
// HELPERS DE DEBUG
// ============================================================================

/**
 * Log do estado atual do path resolver
 */
export const logPathResolverState = (): void => {
  console.log('[PathResolver] Current state:', {
    franchiseMode: isFranchiseMode(),
    envVar: import.meta.env.VITE_FRANCHISE_MODE,
    localStorage: localStorage.getItem('franchiseMode'),
  });
};
