/**
 * ============================================================================
 * Permissoes Unificadas - Kiosk + Admin
 * ============================================================================
 *
 * IMPORTANTE: Este arquivo e compartilhado entre Kiosk e Admin.
 * Qualquer mudanca deve ser compativel com ambos os apps.
 *
 * Convencao de nomes: {resource}:{action}
 *
 * @author Open Kiosk Project
 * @version 1.1.0
 */

import { UserRole } from './roles';

/**
 * Permissoes granulares do sistema
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

  // === Relatorios ===
  | 'reports:read'
  | 'reports:export'

  // === Configuracoes ===
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

  // === Usuarios ===
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
  | 'audit:read'

  // === Operacoes (ERP Chopp) - Torneiras ===
  | 'taps:read'
  | 'taps:write'

  // === Operacoes - Barris (Kegs) ===
  | 'kegs:read'
  | 'kegs:write'

  // === Operacoes - Conexao Tap/Keg ===
  | 'tap_assignments:read'
  | 'tap_assignments:write'

  // === Operacoes - Sessoes de Servir ===
  | 'serving:read'
  | 'serving:create'

  // === Operacoes - Perdas ===
  | 'wastage:read'
  | 'wastage:create'

  // === Operacoes - Manutencao ===
  | 'maintenance:read'
  | 'maintenance:write'

  // === Relatorios Operacionais ===
  | 'reports:operational'
  | 'reports:op' // alias para reports:operational (spec original)

  // === Notificacoes Operacionais ===
  | 'notifications:read'

  // === Comercial (CRM) ===
  | 'commercial:read'
  | 'commercial:create'
  | 'commercial:update'
  | 'commercial:delete'

  // === Financeiro ===
  | 'finance:read'
  | 'finance:create'
  | 'finance:update'
  | 'finance:delete'
  | 'finance:configure';

/**
 * Mapeamento unificado de roles para permissoes
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
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
    'taps:read', 'taps:write',
    'kegs:read', 'kegs:write',
    'tap_assignments:read', 'tap_assignments:write',
    'serving:read', 'serving:create',
    'wastage:read', 'wastage:create',
    'maintenance:read', 'maintenance:write',
    'reports:operational', 'reports:op',
    'notifications:read',
    'commercial:read', 'commercial:create', 'commercial:update', 'commercial:delete',
    'finance:read', 'finance:create', 'finance:update', 'finance:delete', 'finance:configure',
  ],

  owner: [
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
    'taps:read', 'taps:write',
    'kegs:read', 'kegs:write',
    'tap_assignments:read', 'tap_assignments:write',
    'serving:read', 'serving:create',
    'wastage:read', 'wastage:create',
    'maintenance:read', 'maintenance:write',
    'reports:operational', 'reports:op',
    'notifications:read',
    'commercial:read', 'commercial:create', 'commercial:update', 'commercial:delete',
    'finance:read', 'finance:create', 'finance:update', 'finance:delete', 'finance:configure',
  ],

  admin: [
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
    'taps:read', 'taps:write',
    'kegs:read', 'kegs:write',
    'tap_assignments:read', 'tap_assignments:write',
    'serving:read', 'serving:create',
    'wastage:read', 'wastage:create',
    'maintenance:read', 'maintenance:write',
    'reports:operational', 'reports:op',
    'notifications:read',
    'commercial:read', 'commercial:create', 'commercial:update', 'commercial:delete',
    'finance:read', 'finance:create', 'finance:update', 'finance:delete', 'finance:configure',
  ],

  manager: [
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
    'taps:read', 'taps:write',
    'kegs:read', 'kegs:write',
    'tap_assignments:read', 'tap_assignments:write',
    'serving:read', 'serving:create',
    'wastage:read', 'wastage:create',
    'maintenance:read', 'maintenance:write',
    'reports:operational', 'reports:op',
    'notifications:read',
    'commercial:read', 'commercial:create', 'commercial:update',
    'finance:read', 'finance:create',
  ],

  operator: [
    'products:read',
    'sales:read', 'sales:create',
    'inventory:read',
    'esp32:read', 'esp32:connect', 'esp32:dispense',
    'dispensers:read',
    'stores:read',
    'franchise:read',
    'taps:read',
    'kegs:read',
    'tap_assignments:read',
    'serving:read', 'serving:create',
    'notifications:read',
    'commercial:read',
    'finance:read',
  ],

  employee: [
    'products:read',
    'sales:read', 'sales:create',
    'inventory:read',
    'esp32:read', 'esp32:connect', 'esp32:dispense',
    'dispensers:read',
    'stores:read',
    'franchise:read',
    'taps:read',
    'kegs:read',
    'tap_assignments:read',
    'serving:read', 'serving:create',
    'notifications:read',
    'commercial:read',
    'finance:read',
  ],

  technician: [
    'esp32:read', 'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update',
    'settings:read',
    'stores:read',
    'franchise:read',
    'taps:read', 'taps:write',
    'kegs:read',
    'tap_assignments:read',
    'serving:read',
    'maintenance:read', 'maintenance:write',
    'notifications:read',
  ],

  viewer: [
    'products:read',
    'sales:read',
    'inventory:read',
    'reports:read',
    'stores:read',
    'franchise:read',
    'taps:read',
    'kegs:read',
    'tap_assignments:read',
    'serving:read',
    'wastage:read',
    'maintenance:read',
    'reports:operational', 'reports:op',
    'notifications:read',
    'commercial:read',
    'finance:read',
  ],
};

/**
 * Verifica se um role tem uma permissao especifica
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Verifica se um role tem todas as permissoes listadas
 */
export function roleHasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  return permissions.every(p => rolePerms.includes(p));
}

/**
 * Verifica se um role tem alguma das permissoes listadas
 */
export function roleHasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  return permissions.some(p => rolePerms.includes(p));
}

/**
 * Agrupa permissoes por recurso
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
 * Labels para permissoes em portugues
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'superadmin:access': 'Acesso Super Admin',
  'superadmin:manage_franchises': 'Gerenciar todas as franquias',
  'superadmin:manage_users': 'Gerenciar todos os usuarios',
  'superadmin:manage_billing': 'Gerenciar billing global',
  'superadmin:view_metrics': 'Ver metricas da plataforma',
  'superadmin:system_settings': 'Configuracoes do sistema',
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
  'reports:read': 'Ver relatorios',
  'reports:export': 'Exportar relatorios',
  'settings:read': 'Ver configuracoes',
  'settings:update': 'Alterar configuracoes',
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
  'users:read': 'Ver usuarios',
  'users:invite': 'Convidar usuarios',
  'users:update': 'Editar usuarios',
  'users:delete': 'Remover usuarios',
  'stores:read': 'Ver lojas',
  'stores:create': 'Criar lojas',
  'stores:update': 'Editar lojas',
  'stores:delete': 'Excluir lojas',
  'franchise:read': 'Ver franquia',
  'franchise:update': 'Editar franquia',
  'billing:read': 'Ver faturamento',
  'billing:update': 'Gerenciar faturamento',
  'audit:read': 'Ver logs de auditoria',
  'taps:read': 'Ver torneiras (operacao)',
  'taps:write': 'Gerenciar torneiras (operacao)',
  'kegs:read': 'Ver barris',
  'kegs:write': 'Gerenciar barris',
  'tap_assignments:read': 'Ver conexoes torneira/barril',
  'tap_assignments:write': 'Conectar/desconectar barris',
  'serving:read': 'Ver sessoes de servir',
  'serving:create': 'Registrar sessao de servir',
  'wastage:read': 'Ver perdas',
  'wastage:create': 'Registrar perdas',
  'maintenance:read': 'Ver manutencoes',
  'maintenance:write': 'Gerenciar manutencoes',
  'reports:operational': 'Ver relatorios operacionais',
  'reports:op': 'Ver relatorios operacionais (alias)',
  'notifications:read': 'Ver notificacoes operacionais',
  'commercial:read': 'Ver comercial (CRM)',
  'commercial:create': 'Criar registros comerciais',
  'commercial:update': 'Editar registros comerciais',
  'commercial:delete': 'Excluir registros comerciais',
  'finance:read': 'Ver financeiro',
  'finance:create': 'Criar lancamentos financeiros',
  'finance:update': 'Editar lancamentos financeiros',
  'finance:delete': 'Excluir lancamentos financeiros',
  'finance:configure': 'Configurar financeiro (contas/categorias)',
};
