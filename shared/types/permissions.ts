/**
 * ============================================================================
 * Permissões Unificadas - Kiosk + Admin
 * ============================================================================
 * 
 * IMPORTANTE: Este arquivo é compartilhado entre Kiosk e Admin.
 * Qualquer mudança deve ser compatível com ambos os apps.
 * 
 * Convenção de nomes: {resource}:{action}
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { UserRole } from './roles';

/**
 * Permissões granulares do sistema
 */
export type Permission = 
  // === Super Admin (plataforma) ===
  | 'superadmin:access'
  | 'superadmin:manage_franchises'
  | 'superadmin:manage_users'
  | 'superadmin:manage_billing'
  | 'superadmin:view_metrics'
  | 'superadmin:system_settings'
  
  // === Produtos ===
  | 'products:read'
  | 'products:create'
  | 'products:update'
  | 'products:delete'
  
  // === Vendas/Pedidos ===
  | 'sales:read'
  | 'sales:create'
  | 'sales:refund'
  | 'sales:export'
  
  // === Estoque ===
  | 'inventory:read'
  | 'inventory:update'
  
  // === Relatórios ===
  | 'reports:read'
  | 'reports:export'
  
  // === Configurações ===
  | 'settings:read'
  | 'settings:update'
  
  // === Pagamentos ===
  | 'payments:read'
  | 'payments:configure'
  
  // === Hardware/ESP32 ===
  | 'esp32:read'
  | 'esp32:connect'
  | 'esp32:configure'
  | 'esp32:dispense'
  
  // === Dispensers ===
  | 'dispensers:read'
  | 'dispensers:create'
  | 'dispensers:update'
  | 'dispensers:delete'
  
  // === Usuários ===
  | 'users:read'
  | 'users:invite'
  | 'users:update'
  | 'users:delete'
  
  // === Lojas ===
  | 'stores:read'
  | 'stores:create'
  | 'stores:update'
  | 'stores:delete'
  
  // === Franquia ===
  | 'franchise:read'
  | 'franchise:update'
  
  // === Billing (apenas owner) ===
  | 'billing:read'
  | 'billing:update'
  
  // === Auditoria ===
  | 'audit:read';

/**
 * Mapeamento unificado de roles para permissões
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    // Super Admin tem TODAS as permissões + permissões de plataforma
    'superadmin:access', 'superadmin:manage_franchises', 'superadmin:manage_users',
    'superadmin:manage_billing', 'superadmin:view_metrics', 'superadmin:system_settings',
    'products:read', 'products:create', 'products:update', 'products:delete',
    'sales:read', 'sales:create', 'sales:refund', 'sales:export',
    'inventory:read', 'inventory:update',
    'reports:read', 'reports:export',
    'settings:read', 'settings:update',
    'payments:read', 'payments:configure',
    'esp32:read', 'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update', 'dispensers:delete',
    'users:read', 'users:invite', 'users:update', 'users:delete',
    'stores:read', 'stores:create', 'stores:update', 'stores:delete',
    'franchise:read', 'franchise:update',
    'billing:read', 'billing:update',
    'audit:read',
  ],

  owner: [
    // Owner tem TODAS as permissões
    'products:read', 'products:create', 'products:update', 'products:delete',
    'sales:read', 'sales:create', 'sales:refund', 'sales:export',
    'inventory:read', 'inventory:update',
    'reports:read', 'reports:export',
    'settings:read', 'settings:update',
    'payments:read', 'payments:configure',
    'esp32:read', 'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update', 'dispensers:delete',
    'users:read', 'users:invite', 'users:update', 'users:delete',
    'stores:read', 'stores:create', 'stores:update', 'stores:delete',
    'franchise:read', 'franchise:update',
    'billing:read', 'billing:update',
    'audit:read',
  ],
  
  admin: [
    // Admin: tudo exceto billing
    'products:read', 'products:create', 'products:update', 'products:delete',
    'sales:read', 'sales:create', 'sales:refund', 'sales:export',
    'inventory:read', 'inventory:update',
    'reports:read', 'reports:export',
    'settings:read', 'settings:update',
    'payments:read', 'payments:configure',
    'esp32:read', 'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update', 'dispensers:delete',
    'users:read', 'users:invite', 'users:update', 'users:delete',
    'stores:read', 'stores:create', 'stores:update', 'stores:delete',
    'franchise:read', 'franchise:update',
    'audit:read',
  ],
  
  manager: [
    // Manager: gestão de loja, sem criar/deletar lojas ou usuários
    'products:read', 'products:create', 'products:update',
    'sales:read', 'sales:create', 'sales:refund',
    'inventory:read', 'inventory:update',
    'reports:read', 'reports:export',
    'settings:read', 'settings:update',
    'esp32:read', 'esp32:connect', 'esp32:dispense',
    'dispensers:read', 'dispensers:update',
    'users:read', 'users:invite',
    'stores:read',
    'franchise:read',
  ],
  
  operator: [
    // Operator: apenas PDV e operações básicas
    'products:read',
    'sales:read', 'sales:create',
    'inventory:read',
    'esp32:read', 'esp32:connect', 'esp32:dispense',
    'dispensers:read',
    'stores:read',
    'franchise:read',
  ],
  
  technician: [
    // Technician: foco em hardware e dispensers
    'esp32:read', 'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update',
    'settings:read',
    'stores:read',
    'franchise:read',
  ],
  
  viewer: [
    // Viewer: apenas leitura
    'products:read',
    'sales:read',
    'inventory:read',
    'reports:read',
    'stores:read',
    'franchise:read',
  ],
};

/**
 * Verifica se um role tem uma permissão específica
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Verifica se um role tem todas as permissões listadas
 */
export function roleHasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  return permissions.every(p => rolePerms.includes(p));
}

/**
 * Verifica se um role tem alguma das permissões listadas
 */
export function roleHasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  return permissions.some(p => rolePerms.includes(p));
}

/**
 * Agrupa permissões por recurso
 */
export function groupPermissionsByResource(permissions: Permission[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  
  permissions.forEach(perm => {
    const [resource, action] = perm.split(':');
    if (!groups[resource]) {
      groups[resource] = [];
    }
    groups[resource].push(action);
  });
  
  return groups;
}

/**
 * Labels para permissões em português
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  // Super Admin
  'superadmin:access': 'Acesso Super Admin',
  'superadmin:manage_franchises': 'Gerenciar todas as franquias',
  'superadmin:manage_users': 'Gerenciar todos os usuários',
  'superadmin:manage_billing': 'Gerenciar billing global',
  'superadmin:view_metrics': 'Ver métricas da plataforma',
  'superadmin:system_settings': 'Configurações do sistema',
  // Produtos
  'products:read': 'Ver produtos',
  'products:create': 'Criar produtos',
  'products:update': 'Editar produtos',
  'products:delete': 'Excluir produtos',
  'sales:read': 'Ver vendas',
  'sales:create': 'Registrar vendas',
  'sales:refund': 'Fazer reembolsos',
  'sales:export': 'Exportar vendas',
  'inventory:read': 'Ver estoque',
  'inventory:update': 'Ajustar estoque',
  'reports:read': 'Ver relatórios',
  'reports:export': 'Exportar relatórios',
  'settings:read': 'Ver configurações',
  'settings:update': 'Alterar configurações',
  'payments:read': 'Ver pagamentos',
  'payments:configure': 'Configurar pagamentos',
  'esp32:read': 'Ver status ESP32',
  'esp32:connect': 'Conectar ESP32',
  'esp32:configure': 'Configurar ESP32',
  'esp32:dispense': 'Acionar dispenser',
  'dispensers:read': 'Ver dispensers',
  'dispensers:create': 'Criar dispensers',
  'dispensers:update': 'Editar dispensers',
  'dispensers:delete': 'Excluir dispensers',
  'users:read': 'Ver usuários',
  'users:invite': 'Convidar usuários',
  'users:update': 'Editar usuários',
  'users:delete': 'Remover usuários',
  'stores:read': 'Ver lojas',
  'stores:create': 'Criar lojas',
  'stores:update': 'Editar lojas',
  'stores:delete': 'Excluir lojas',
  'franchise:read': 'Ver franquia',
  'franchise:update': 'Editar franquia',
  'billing:read': 'Ver faturamento',
  'billing:update': 'Gerenciar faturamento',
  'audit:read': 'Ver logs de auditoria',
};
