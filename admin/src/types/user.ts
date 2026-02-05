/**
 * ============================================================================
 * User Types
 * ============================================================================
 */

import { Timestamp } from 'firebase/firestore';
import { UserRole } from './franchise';

/**
 * Usuário do sistema (Firebase Auth + Firestore)
 */
export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  defaultFranchiseId?: string;
  defaultStoreId?: string;
  role?: UserRole;
  franchiseId?: string | null;
  storeId?: string | null;
  storeAccess?: string[];
  status?: string;
  invitedBy?: string;
  createdAt: Timestamp | Date;
  lastLoginAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  claimsSyncedAt?: Timestamp | Date;
  isActive: boolean;
}

/**
 * Convite para franquia
 */
export interface Invitation {
  id: string;
  email: string;
  franchiseId: string;
  franchiseName?: string;
  storeAccess: string[];
  role: UserRole;
  invitedBy: string;
  invitedByName?: string;
  status: InvitationStatus;
  token: string;
  expiresAt: Timestamp | Date;
  createdAt: Timestamp | Date;
  acceptedAt?: Timestamp | Date;
}

/**
 * Status do convite
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Dados para criar um convite
 */
export interface CreateInvitationData {
  email: string;
  role: UserRole;
  storeAccess: string[];
}

/**
 * Sessão ativa do usuário
 */
export interface UserSession {
  id: string;
  userId: string;
  deviceInfo: string;
  browser: string;
  os: string;
  ip?: string;
  location?: string;
  createdAt: Timestamp | Date;
  lastActiveAt: Timestamp | Date;
  isCurrent: boolean;
}

/**
 * Configurações de segurança do usuário
 */
export interface UserSecuritySettings {
  twoFactorEnabled: boolean;
  twoFactorMethod?: '2fa_app' | '2fa_sms' | '2fa_email';
  lastPasswordChange?: Timestamp | Date;
  loginNotifications: boolean;
}

/**
 * Log de atividade do usuário
 */
export interface UserActivityLog {
  id: string;
  userId: string;
  action: string;
  description: string;
  ip?: string;
  userAgent?: string;
  timestamp: Timestamp | Date;
}
