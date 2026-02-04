/**
 * ============================================================================
 * Franchise Types - Admin
 * ============================================================================
 * 
 * IMPORTANTE: Roles e Permissions são importados de @shared/types
 * para garantir compatibilidade entre Admin e Kiosk.
 * 
 * Este arquivo contém apenas tipos específicos do Admin.
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// RE-EXPORTAR TIPOS COMPARTILHADOS
// ============================================================================

// Re-export de @shared/types para manter compatibilidade com imports existentes
export type { UserRole } from '@shared/types/roles';
export { 
  ROLE_HIERARCHY, 
  ROLE_LABELS, 
  ROLE_DESCRIPTIONS,
  isRoleAtLeast,
  isRoleAbove,
  getAssignableRoles,
  ALL_ROLES,
} from '@shared/types/roles';

export type { Permission } from '@shared/types/permissions';
export { 
  ROLE_PERMISSIONS, 
  roleHasPermission, 
  roleHasAllPermissions,
  roleHasAnyPermission,
  PERMISSION_LABELS,
} from '@shared/types/permissions';

// ============================================================================
// TIPOS ESPECÍFICOS DO ADMIN
// ============================================================================

/**
 * Planos disponíveis para franquias
 */
export type FranchisePlan = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise';

/**
 * Status de billing da franquia
 */
export type BillingStatus = 'active' | 'past_due' | 'unpaid' | 'canceled' | 'trial' | 'incomplete' | 'expired' | 'paused';

// Import types for use in interfaces
import type { UserRole, Permission } from '@shared/types';

/**
 * Franquia principal
 */
export interface Franchise {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail?: string;
  status?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan: FranchisePlan;
  maxStores: number;
  maxUsersPerStore: number;
  /** Legado */
  billingStatus?: BillingStatus;
  /** Status atual do plano (billing) */
  planStatus?: BillingStatus;
  /** Legado */
  trialEndsAt?: Timestamp | Date;
  /** Atual */
  planExpiresAt?: Timestamp | Date;
  stripeCustomerId?: string;
  features: string[];
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  updatedBy?: string;
}

/**
 * Membro de uma franquia
 */
export interface FranchiseMember {
  id: string;
  orderId?: string;
  userId: string;
  email: string;
  displayName?: string;
  role: UserRole;
  storeAccess: string[]; // ['store1', 'store2'] ou ['*'] para todas
  permissions?: Permission[];
  invitedBy: string;
  invitedAt: Timestamp | Date;
  joinedAt?: Timestamp | Date;
  addedAt?: Timestamp | Date;
  isActive?: boolean;
}

/**
 * Convite pendente
 */
export interface PendingInvitation {
  id: string;
  email: string;
  role: UserRole;
  storeAccess: string[];
  invitedBy: string;
  invitedByName?: string;
  invitedAt: Timestamp | Date;
  expiresAt?: Timestamp | Date;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

/**
 * Store (loja) dentro de uma franquia
 */
export interface Store {
  id: string;
  franchiseId: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  isActive: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/**
 * Status de hardware de uma loja (read-only no Admin)
 */
export interface StoreHardwareStatus {
  esp32Connected: boolean;
  lastHeartbeat?: Timestamp | Date;
  dispensersCount: number;
  dispensersOnline: number;
  printerConnected: boolean;
  firmwareVersion?: string;
}
