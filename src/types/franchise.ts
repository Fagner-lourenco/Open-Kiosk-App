/**
 * ============================================================================
 * Tipos do Sistema de Franquias
 * ============================================================================
 * 
 * Define tipos para:
 * - Usuários e autenticação
 * - Franquias e membros
 * - Roles e permissões (RBAC)
 * - Convites
 * - Auditoria
 * - Dispensers (torneiras)
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

// ============================================================================
// ROLES E PERMISSÕES
// ============================================================================

/**
 * Roles de usuário no sistema
 * 
 * Hierarquia (do mais ao menos privilegiado):
 * 0. superadmin - Super Admin da plataforma (acesso a TODAS as franquias)
 * 1. owner - Dono da franquia (acesso total)
 * 2. admin - Administrador (quase tudo, exceto billing)
 * 3. manager - Gerente de loja (apenas lojas atribuídas)
 * 4. operator - Operador de caixa (apenas PDV)
 * 5. employee - Funcionário (operação básica/PDV)
 * 6. technician - Técnico (apenas hardware/ESP32)
 * 7. viewer - Apenas visualização
 */
export type UserRole = 'superadmin' | 'owner' | 'admin' | 'manager' | 'operator' | 'employee' | 'technician' | 'viewer';

/**
 * Permissões granulares do sistema
 */
export type Permission = 
  // === Produtos ===
  | 'products:read'
  | 'products:create'
  | 'products:update'
  | 'products:delete'
  
  // === Vendas ===
  | 'sales:read'
  | 'sales:create'
  | 'sales:refund'
  | 'sales:export'
  
  // === Estoque ===
  | 'inventory:read'
  | 'inventory:adjust'
  
  // === Relatórios ===
  | 'reports:view'
  | 'reports:export'
  
  // === Configurações ===
  | 'settings:read'
  | 'settings:update'
  
  // === Pagamentos ===
  | 'payments:configure'
  | 'payments:view_credentials'
  
  // === Hardware/ESP32 ===
  | 'esp32:connect'
  | 'esp32:configure'
  | 'esp32:dispense'
  
  // === Dispensers (Torneiras) ===
  | 'dispensers:read'
  | 'dispensers:create'
  | 'dispensers:update'
  | 'dispensers:delete'
  
  // === Usuários ===
  | 'users:read'
  | 'users:invite'
  | 'users:remove'
  | 'users:update_role'
  
  // === Lojas ===
  | 'stores:read'
  | 'stores:create'
  | 'stores:update'
  | 'stores:delete'
  
  // === Franquia ===
  | 'franchise:read'
  | 'franchise:update'
  | 'franchise:billing';

/**
 * Mapeamento de roles para permissões padrão
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    // SuperAdmin tem TODAS as permissões de todas as franquias
    'products:read', 'products:create', 'products:update', 'products:delete',
    'sales:read', 'sales:create', 'sales:refund', 'sales:export',
    'inventory:read', 'inventory:adjust',
    'reports:view', 'reports:export',
    'settings:read', 'settings:update',
    'payments:configure', 'payments:view_credentials',
    'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update', 'dispensers:delete',
    'users:read', 'users:invite', 'users:remove', 'users:update_role',
    'stores:read', 'stores:create', 'stores:update', 'stores:delete',
    'franchise:read', 'franchise:update', 'franchise:billing',
  ],
  
  owner: [
    // Owner tem TODAS as permissões
    'products:read', 'products:create', 'products:update', 'products:delete',
    'sales:read', 'sales:create', 'sales:refund', 'sales:export',
    'inventory:read', 'inventory:adjust',
    'reports:view', 'reports:export',
    'settings:read', 'settings:update',
    'payments:configure', 'payments:view_credentials',
    'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update', 'dispensers:delete',
    'users:read', 'users:invite', 'users:remove', 'users:update_role',
    'stores:read', 'stores:create', 'stores:update', 'stores:delete',
    'franchise:read', 'franchise:update', 'franchise:billing',
  ],
  
  admin: [
    // Admin tem quase tudo, exceto billing
    'products:read', 'products:create', 'products:update', 'products:delete',
    'sales:read', 'sales:create', 'sales:refund', 'sales:export',
    'inventory:read', 'inventory:adjust',
    'reports:view', 'reports:export',
    'settings:read', 'settings:update',
    'payments:configure', 'payments:view_credentials',
    'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update', 'dispensers:delete',
    'users:read', 'users:invite', 'users:remove', 'users:update_role',
    'stores:read', 'stores:create', 'stores:update', 'stores:delete',
    'franchise:read', 'franchise:update',
  ],
  
  manager: [
    // Manager: gestão da loja (produtos, estoque, relatórios)
    'products:read', 'products:create', 'products:update',
    'sales:read', 'sales:create', 'sales:refund',
    'inventory:read', 'inventory:adjust',
    'reports:view',
    'settings:read', 'settings:update',
    'esp32:connect', 'esp32:dispense',
    'dispensers:read', 'dispensers:update',
    'users:read', 'users:invite', // Pode convidar operators
    'stores:read',
    'franchise:read',
  ],
  
  operator: [
    // Operator: apenas PDV
    'products:read',
    'sales:read', 'sales:create',
    'esp32:connect', 'esp32:dispense',
    'dispensers:read',
    'stores:read',
    'franchise:read',
  ],
  
  employee: [
    // Employee: mesmas permissões do operator (compatibilidade com Admin)
    'products:read',
    'sales:read', 'sales:create',
    'esp32:connect', 'esp32:dispense',
    'dispensers:read',
    'stores:read',
    'franchise:read',
  ],
  
  technician: [
    // Technician: apenas hardware
    'esp32:connect', 'esp32:configure', 'esp32:dispense',
    'dispensers:read', 'dispensers:create', 'dispensers:update',
    'settings:read',
    'stores:read',
    'franchise:read',
  ],
  
  viewer: [
    // Viewer: apenas visualização (read-only)
    'products:read',
    'sales:read',
    'inventory:read',
    'reports:view',
    'dispensers:read',
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
 * Labels amigáveis para os roles (i18n)
 */
export const ROLE_LABELS: Record<UserRole, { pt: string; en: string }> = {
  superadmin: { pt: 'Super Admin', en: 'Super Admin' },
  owner: { pt: 'Proprietário', en: 'Owner' },
  admin: { pt: 'Administrador', en: 'Administrator' },
  manager: { pt: 'Gerente', en: 'Manager' },
  operator: { pt: 'Operador', en: 'Operator' },
  employee: { pt: 'Funcionário', en: 'Employee' },
  technician: { pt: 'Técnico', en: 'Technician' },
  viewer: { pt: 'Visualizador', en: 'Viewer' },
};

// ============================================================================
// USUÁRIOS
// ============================================================================

/**
 * Dados do usuário no Firestore (collection: users)
 */
export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  
  /** Última franquia acessada (para redirect no login) */
  defaultFranchiseId?: string;
  
  /** Última loja acessada */
  defaultStoreId?: string;

  /** Role atual (pode vir de claims sincronizadas) */
  role?: UserRole;
  
  /** Franquia associada (quando aplicável) */
  franchiseId?: string | null;
  
  /** Loja associada (quando aplicável) */
  storeId?: string | null;
  
  /** Lojas com acesso (claims) */
  storeAccess?: string[];
  
  /** Status interno (ex: active) */
  status?: string;

  /** Quem convidou o usuário (quando originado de convite) */
  invitedBy?: string;
  
  /** Usuário ativo/desativado */
  isActive: boolean;
  
  /** Metadados */
  createdAt: Date;
  lastLoginAt?: Date;
  updatedAt?: Date;
  
  /** Timestamp de sincronização de claims */
  claimsSyncedAt?: Date;
}

/**
 * Usuário autenticado com dados de sessão
 */
export interface AuthenticatedUser extends User {
  /** Firebase Auth UID */
  uid: string;
  
  /** Token JWT para API calls */
  accessToken?: string;
  
  /** Claims customizadas do Firebase */
  customClaims?: {
    franchiseId?: string;
    role?: UserRole;
    storeAccess?: string[];
  };
}

// ============================================================================
// FRANQUIAS
// ============================================================================

/**
 * Planos disponíveis
 */
export type FranchisePlan = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise';

/**
 * Status de cobrança
 */
export type BillingStatus = 'active' | 'past_due' | 'unpaid' | 'canceled' | 'trial' | 'incomplete' | 'expired' | 'paused';

/**
 * Dados da franquia (collection: franchises)
 */
export interface Franchise {
  id: string;
  
  /** Nome da franquia */
  name: string;
  
  /** Slug URL-friendly */
  slug: string;
  
  /** ID do owner (ref users) */
  ownerId: string;

  /** Status da franquia (ex: active) */
  status?: string;
  
  /** Logo (URL) */
  logoUrl?: string;
  
  /** Cor primária (#hex) */
  primaryColor?: string;
  
  /** Plano atual */
  plan: FranchisePlan;
  
  /** Limites do plano */
  maxStores: number;
  maxUsersPerStore: number;
  
  /** Status de cobrança (legado) */
  billingStatus?: BillingStatus;
  
  /** Status de plano (padrão atual) */
  planStatus?: BillingStatus;
  
  /** Data de fim do trial (legado) */
  trialEndsAt?: Date;
  
  /** Data de fim do plano (padrão atual) */
  planExpiresAt?: Date;
  
  /** ID do cliente no Stripe */
  stripeCustomerId?: string;
  
  /** ID da assinatura no Stripe */
  stripeSubscriptionId?: string;
  
  /** Features habilitadas */
  features: string[];
  
  /** Metadados */
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * Membro de uma franquia (subcollection: franchises/{fid}/members)
 */
export interface FranchiseMember {
  /** User ID (mesmo ID do documento na subcollection) */
  userId: string;
  
  /** Role do membro */
  role: UserRole;
  
  /** Lojas com acesso (['*'] = todas, ou IDs específicos) */
  storeAccess: string[];
  
  /** Permissões customizadas (override do role) */
  customPermissions?: Permission[];
  
  /** Quem convidou este membro */
  invitedBy: string;
  
  /** Data do convite */
  invitedAt: Date;
  
  /** Data que aceitou o convite */
  joinedAt: Date;
  
  /** Membro ativo/desativado */
  isActive: boolean;
}

// ============================================================================
// CONVITES
// ============================================================================

/**
 * Status do convite
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Convite para membro (collection: invitations)
 */
export interface Invitation {
  id: string;
  
  /** Email do convidado */
  email: string;
  
  /** ID da franquia */
  franchiseId: string;
  
  /** Lojas com acesso */
  storeAccess: string[];
  
  /** Role que será atribuído */
  role: UserRole;
  
  /** Quem enviou o convite */
  invitedBy: string;
  
  /** Status do convite */
  status: InvitationStatus;
  
  /** Token único para o link */
  token: string;
  
  /** Data de expiração */
  expiresAt: Date;
  
  /** Data de criação */
  createdAt: Date;
}

/**
 * Convite pendente com informações extras para exibição
 * Usado na página de aceitar convite
 */
export interface PendingInvite {
  id: string;
  email: string;
  franchiseId: string;
  franchiseName: string;
  storeId: string;
  storeName: string;
  role: UserRole;
  invitedBy: string;
  invitedByName?: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Informações resumidas de uma loja para seleção/exibição
 */
export interface StoreInfo {
  franchiseId: string;
  franchiseName?: string;
  storeId: string;
  storeName: string;
  role: UserRole;
  address?: string;
  isActive?: boolean;
}

// ============================================================================
// AUDITORIA
// ============================================================================

/**
 * Ações auditáveis
 */
export type AuditAction = 
  | 'user.login'
  | 'user.logout'
  | 'user.invite'
  | 'user.remove'
  | 'user.update_role'
  | 'store.create'
  | 'store.update'
  | 'store.delete'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'sale.create'
  | 'sale.refund'
  | 'settings.update'
  | 'dispenser.create'
  | 'dispenser.update'
  | 'dispenser.delete'
  | 'esp32.connect'
  | 'esp32.disconnect'
  | 'esp32.dispense';

/**
 * Log de auditoria (collection: audit_logs)
 */
export interface AuditLog {
  id: string;
  
  /** ID do usuário que realizou a ação */
  userId: string;
  
  /** Email do usuário */
  userEmail: string;
  
  /** ID da franquia */
  franchiseId: string;
  
  /** ID da loja (se aplicável) */
  storeId?: string;
  
  /** Ação realizada */
  action: AuditAction;
  
  /** Recurso afetado */
  resource: string;
  
  /** ID do recurso */
  resourceId?: string;
  
  /** Mudanças realizadas */
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  
  /** IP do usuário */
  ip?: string;
  
  /** User agent */
  userAgent?: string;
  
  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// DISPENSERS (TORNEIRAS)
// ============================================================================

/**
 * Tipo de conexão do dispenser
 */
export type DispenserConnectionType = 'usb' | 'wifi' | 'bluetooth';

/**
 * Configuração de hardware do dispenser
 */
export interface DispenserHardwareConfig {
  /** ID do dispositivo ESP32 (MAC address) */
  deviceId: string;
  
  /** Tipo de conexão */
  connectionType: DispenserConnectionType;
  
  /** GPIO da válvula solenóide */
  valvePin: number;
  
  /** GPIO do sensor de fluxo */
  flowSensorPin: number;
  
  /** Último IP conhecido (para WiFi) */
  lastKnownIp?: string;
}

/**
 * Calibração do dispenser
 */
export interface DispenserCalibration {
  /** Pulsos por litro (sensor de fluxo) */
  pulsesPerLiter: number;
  
  /** ML por segundo (vazão média) */
  mlPerSecond: number;
}

/**
 * Dispenser/Torneira (subcollection: stores/{sid}/dispensers)
 */
export interface StoreDispenser {
  id: string;
  
  /** Nome de exibição */
  name: string;
  
  /** Ícone (emoji ou nome de ícone) */
  icon: string;
  
  /** Cor para identificação visual */
  color: string;
  
  /** Dispenser ativo/inativo */
  isActive: boolean;
  
  /** Configuração de hardware */
  hardware: DispenserHardwareConfig;
  
  /** Calibração */
  calibration: DispenserCalibration;
  
  /** IDs de produtos que podem usar esta torneira */
  allowedProductIds: string[];
  
  /** Último status conhecido */
  lastStatus?: {
    connected: boolean;
    lastSeen: Date;
    firmwareVersion?: string;
  };
  
  /** Metadados */
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CONTEXTOS E ESTADO
// ============================================================================

/**
 * Estado do contexto de autenticação
 */
export interface AuthState {
  /** Usuário autenticado (null se não logado) */
  user: AuthenticatedUser | null;
  
  /** Carregando estado de auth */
  loading: boolean;
  
  /** Erro de autenticação */
  error: string | null;
  
  /** Modo offline ativo */
  isOfflineMode: boolean;
  
  /** Sessão autenticada via PIN (fallback offline) */
  isPinAuthenticated: boolean;
}

/**
 * Estado do contexto de franquia
 */
export interface FranchiseState {
  /** Franquia atual selecionada */
  currentFranchise: Franchise | null;
  
  /** Membership do usuário na franquia atual */
  currentMembership: FranchiseMember | null;
  
  /** Lista de franquias que o usuário é membro */
  userFranchises: Franchise[];
  
  /** Carregando */
  loading: boolean;
  
  /** Erro */
  error: string | null;
}

/**
 * Estado do contexto de permissões
 */
export interface PermissionState {
  /** Role atual do usuário */
  role: UserRole | null;
  
  /** Permissões efetivas (role + customPermissions) */
  permissions: Permission[];
  
  /** Lojas com acesso */
  storeAccess: string[];
  
  /** Verifica se tem permissão */
  can: (permission: Permission) => boolean;
  
  /** Verifica se tem acesso a uma loja */
  hasStoreAccess: (storeId: string) => boolean;
}
