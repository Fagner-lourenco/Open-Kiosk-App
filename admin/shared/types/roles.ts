/**
 * ============================================================================
 * Tipos de Roles Unificados - Kiosk + Admin
 * ============================================================================
 * 
 * IMPORTANTE: Este arquivo é compartilhado entre Kiosk e Admin.
 * Qualquer mudança deve ser compatível com ambos os apps.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

/**
 * Roles de usuário no sistema
 * 
 * Hierarquia (do mais ao menos privilegiado):
 * 0. superadmin - Super Administrador da plataforma (acesso a TODAS as franquias)
 * 1. owner - Dono da franquia (acesso total + billing)
 * 2. admin - Administrador (quase tudo, exceto billing)
 * 3. manager - Gerente de loja (gestão operacional)
 * 4. operator - Operador de caixa/PDV
 * 5. technician - Técnico de hardware/ESP32
 * 6. viewer - Apenas visualização (relatórios)
 */
export type UserRole = 
  | 'superadmin'
  | 'owner' 
  | 'admin' 
  | 'manager' 
  | 'operator' 
  | 'technician'
  | 'viewer';

/**
 * Hierarquia numérica para comparações
 * Quanto maior o número, mais privilégios
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  superadmin: 200,
  owner: 100,
  admin: 80,
  manager: 60,
  operator: 40,
  technician: 30,
  viewer: 10,
};

/**
 * Labels para UI em português e inglês
 */
export const ROLE_LABELS: Record<UserRole, { pt: string; en: string }> = {
  superadmin: { pt: 'Super Admin', en: 'Super Admin' },
  owner: { pt: 'Proprietário', en: 'Owner' },
  admin: { pt: 'Administrador', en: 'Administrator' },
  manager: { pt: 'Gerente', en: 'Manager' },
  operator: { pt: 'Operador', en: 'Operator' },
  technician: { pt: 'Técnico', en: 'Technician' },
  viewer: { pt: 'Visualizador', en: 'Viewer' },
};

/**
 * Descrições dos roles
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, { pt: string; en: string }> = {
  superadmin: { 
    pt: 'Acesso total à plataforma, gerencia TODAS as franquias',
    en: 'Full platform access, manages ALL franchises'
  },
  owner: { 
    pt: 'Acesso total à franquia, incluindo billing e configurações críticas',
    en: 'Full access to franchise, including billing and critical settings'
  },
  admin: { 
    pt: 'Acesso administrativo completo, exceto billing',
    en: 'Full administrative access, except billing'
  },
  manager: { 
    pt: 'Gerenciamento de loja, produtos, estoque e relatórios',
    en: 'Store management, products, inventory and reports'
  },
  operator: { 
    pt: 'Operação do PDV e processamento de vendas',
    en: 'POS operation and sales processing'
  },
  technician: { 
    pt: 'Configuração de hardware e dispensadores',
    en: 'Hardware and dispenser configuration'
  },
  viewer: { 
    pt: 'Apenas visualização de dados e relatórios',
    en: 'Read-only access to data and reports'
  },
};

/**
 * Verifica se roleA é igual ou superior a roleB na hierarquia
 */
export function isRoleAtLeast(roleA: UserRole, roleB: UserRole): boolean {
  return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB];
}

/**
 * Verifica se roleA é estritamente superior a roleB
 */
export function isRoleAbove(roleA: UserRole, roleB: UserRole): boolean {
  return ROLE_HIERARCHY[roleA] > ROLE_HIERARCHY[roleB];
}

/**
 * Lista de todos os roles ordenados por hierarquia (decrescente)
 */
export const ALL_ROLES: UserRole[] = [
  'superadmin',
  'owner',
  'admin', 
  'manager',
  'operator',
  'technician',
  'viewer',
];

/**
 * Roles que podem ser atribuídos por um superadmin
 */
export const SUPERADMIN_ASSIGNABLE_ROLES: UserRole[] = [
  'superadmin',
  'owner',
  'admin',
  'manager', 
  'operator',
  'technician',
  'viewer',
];

/**
 * Roles que podem ser atribuídos por um owner
 */
export const OWNER_ASSIGNABLE_ROLES: UserRole[] = [
  'admin',
  'manager', 
  'operator',
  'technician',
  'viewer',
];

/**
 * Roles que podem ser atribuídos por um admin
 */
export const ADMIN_ASSIGNABLE_ROLES: UserRole[] = [
  'manager',
  'operator',
  'technician',
  'viewer',
];

/**
 * Roles que podem ser atribuídos por um manager
 */
export const MANAGER_ASSIGNABLE_ROLES: UserRole[] = [
  'operator',
  'viewer',
];

/**
 * Retorna os roles que um usuário pode atribuir
 */
export function getAssignableRoles(role: UserRole): UserRole[] {
  switch (role) {
    case 'superadmin':
      return SUPERADMIN_ASSIGNABLE_ROLES;
    case 'owner':
      return OWNER_ASSIGNABLE_ROLES;
    case 'admin':
      return ADMIN_ASSIGNABLE_ROLES;
    case 'manager':
      return MANAGER_ASSIGNABLE_ROLES;
    default:
      return [];
  }
}

/**
 * Verifica se o role é superadmin
 */
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'superadmin';
}
