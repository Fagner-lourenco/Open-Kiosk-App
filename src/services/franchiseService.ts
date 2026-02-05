/**
 * ============================================================================
 * Serviço de Franquias
 * ============================================================================
 * 
 * Gerencia operações de franquias, membros e convites.
 * 
 * Funcionalidades:
 * - CRUD de franquias
 * - Gerenciamento de membros
 * - Sistema de convites
 * - Verificação de acesso
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
  limit,
  orderBy,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import {
  Franchise,
  FranchiseMember,
  Invitation,
  InvitationStatus,
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  PendingInvite,
} from '../types/franchise';
import { isFranchiseMode, globalCollectionPath } from '../lib/pathResolver';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Converte Timestamps do Firestore para Date
 */
function convertTimestamps<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (value instanceof Timestamp) {
      (result as Record<string, unknown>)[key] = value.toDate();
    }
  }
  return result;
}

function resolveInviteStoreAccess(invite: Record<string, unknown>): string[] {
  const storeAccess = invite.storeAccess;
  if (Array.isArray(storeAccess) && storeAccess.length > 0) {
    return storeAccess as string[];
  }
  if (typeof invite.storeId === 'string' && invite.storeId) {
    return [invite.storeId];
  }
  return ['*'];
}

/**
 * Gera um slug a partir do nome
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]+/g, '-') // Substitui caracteres especiais por -
    .replace(/^-+|-+$/g, ''); // Remove - do início e fim
}

/**
 * Gera um token único para convites
 */
function generateInviteToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// PATHS
// ============================================================================

function franchisesPath(): string {
  return isFranchiseMode() ? globalCollectionPath('franchises') : 'franchises';
}

function membersPath(franchiseId: string): string {
  return `${franchisesPath()}/${franchiseId}/members`;
}

function storesPath(franchiseId: string): string {
  return `${franchisesPath()}/${franchiseId}/stores`;
}

function invitationsPath(): string {
  return isFranchiseMode() ? globalCollectionPath('invitations') : 'invitations';
}

/**
 * Helper para obter db de forma lazy
 */
function db() {
  return getFirebaseDb();
}

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Representa uma loja dentro de uma franquia
 */
export interface FranchiseStore {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  franchiseId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// CLASSE DO SERVIÇO
// ============================================================================

class FranchiseService {
  // ==========================================================================
  // FRANQUIAS - CRUD
  // ==========================================================================

  /**
   * Busca uma franquia por ID
   */
  async getFranchise(franchiseId: string): Promise<Franchise | null> {
    try {
      const docRef = doc(db(), franchisesPath(), franchiseId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...convertTimestamps(data),
      } as Franchise;
    } catch (error) {
      console.error('[FranchiseService] Erro ao buscar franquia:', error);
      throw error;
    }
  }

  /**
   * Busca uma franquia por slug
   */
  async getFranchiseBySlug(slug: string): Promise<Franchise | null> {
    try {
      const q = query(
        collection(db(), franchisesPath()),
        where('slug', '==', slug.toLowerCase()),
        limit(1)
      );
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return null;
      }

      const docSnap = querySnap.docs[0];
      return {
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      } as Franchise;
    } catch (error) {
      console.error('[FranchiseService] Erro ao buscar franquia por slug:', error);
      throw error;
    }
  }

  /**
   * Lista franquias de um usuário
   */
  async getUserFranchises(userId: string): Promise<Franchise[]> {
    try {
      const franchisesMap = new Map<string, Franchise>();

      // 1. Busca franquias onde o usuário é owner
      const ownerQuery = query(
        collection(db(), franchisesPath()),
        where('ownerId', '==', userId)
      );
      const ownerSnap = await getDocs(ownerQuery);
      ownerSnap.docs.forEach((docSnap) => {
        franchisesMap.set(docSnap.id, {
          id: docSnap.id,
          ...convertTimestamps(docSnap.data()),
        } as Franchise);
      });

      // 2. Busca memberships do usuário via collectionGroup
      // Nota: Requer índice no Firestore para 'members' collection group
      try {
        const membersQuery = query(
          collectionGroup(db(), 'members'),
          where('userId', '==', userId),
          where('isActive', '==', true)
        );
        const membersSnap = await getDocs(membersQuery);

        // Para cada membership, busca a franquia correspondente
        const franchisePromises = membersSnap.docs.map(async (memberDoc) => {
          // Path: franchises/{franchiseId}/members/{userId}
          const pathParts = memberDoc.ref.path.split('/');
          const franchiseId = pathParts[1]; // franchises/{franchiseId}/...

          // Evita duplicatas (owner já adicionado)
          if (franchisesMap.has(franchiseId)) {
            return null;
          }

          const franchise = await this.getFranchise(franchiseId);
          if (franchise) {
            franchisesMap.set(franchiseId, franchise);
          }
          return franchise;
        });

        await Promise.all(franchisePromises);
      } catch (error) {
        // CollectionGroup query pode falhar se índice não existir
        console.warn('[FranchiseService] CollectionGroup query falhou. Verifique se o índice está configurado:', error);
      }

      return Array.from(franchisesMap.values());
    } catch (error) {
      console.error('[FranchiseService] Erro ao listar franquias:', error);
      throw error;
    }
  }

  /**
   * Lista lojas de uma franquia
   */
  async getFranchiseStores(franchiseId: string): Promise<FranchiseStore[]> {
    try {
      const q = query(
        collection(db(), storesPath(franchiseId)),
        orderBy('name')
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        franchiseId,
        ...convertTimestamps(docSnap.data()),
      })) as FranchiseStore[];
    } catch (error) {
      console.error('[FranchiseService] Erro ao listar lojas:', error);
      // Se não tiver lojas, retorna array vazio em vez de erro
      if ((error as any)?.code === 'permission-denied') {
        console.warn('[FranchiseService] Sem permissão para listar lojas. Retornando vazio.');
        return [];
      }
      throw error;
    }
  }

  /**
   * Cria uma nova franquia
   */
  async createFranchise(
    ownerId: string,
    data: {
      name: string;
      logoUrl?: string;
      primaryColor?: string;
    }
  ): Promise<Franchise> {
    try {
      const batch = writeBatch(db());
      
      // Gera slug único
      let slug = generateSlug(data.name);
      const existingSlug = await this.getFranchiseBySlug(slug);
      if (existingSlug) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      // Cria documento da franquia
      const franchiseRef = doc(collection(db(), franchisesPath()));
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 dias
      const franchiseData = {
        name: data.name,
        slug,
        ownerId,
        logoUrl: data.logoUrl || null,
        primaryColor: data.primaryColor || '#000000',
        plan: 'starter',
        maxStores: 1,
        maxUsersPerStore: 5,
        billingStatus: 'trial', // legado
        planStatus: 'trial',
        trialEndsAt,
        planExpiresAt: Timestamp.fromDate(trialEndsAt),
        features: ['basic'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(franchiseRef, franchiseData);

      // Adiciona owner como membro
      const memberRef = doc(db(), membersPath(franchiseRef.id), ownerId);
      const memberData: Omit<FranchiseMember, 'userId'> = {
        role: 'owner',
        storeAccess: ['*'],
        invitedBy: ownerId,
        invitedAt: new Date(),
        joinedAt: new Date(),
        isActive: true,
      };

      batch.set(memberRef, {
        userId: ownerId,
        ...memberData,
        invitedAt: serverTimestamp(),
        joinedAt: serverTimestamp(),
      });

      await batch.commit();

      return {
        id: franchiseRef.id,
        ...data,
        slug,
        ownerId,
        plan: 'starter',
        maxStores: 1,
        maxUsersPerStore: 5,
        billingStatus: 'trial', // legado
        planStatus: 'trial',
        trialEndsAt,
        planExpiresAt: trialEndsAt,
        features: ['basic'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Franchise;
    } catch (error) {
      console.error('[FranchiseService] Erro ao criar franquia:', error);
      throw error;
    }
  }

  /**
   * Atualiza uma franquia
   */
  async updateFranchise(
    franchiseId: string,
    updates: Partial<Pick<Franchise, 'name' | 'logoUrl' | 'primaryColor'>>
  ): Promise<void> {
    try {
      const docRef = doc(db(), franchisesPath(), franchiseId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('[FranchiseService] Erro ao atualizar franquia:', error);
      throw error;
    }
  }

  // ==========================================================================
  // MEMBROS
  // ==========================================================================

  /**
   * Busca membership de um usuário em uma franquia
   */
  async getMembership(
    franchiseId: string,
    userId: string
  ): Promise<FranchiseMember | null> {
    try {
      const docRef = doc(db(), membersPath(franchiseId), userId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return {
        userId: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      } as FranchiseMember;
    } catch (error) {
      console.error('[FranchiseService] Erro ao buscar membership:', error);
      throw error;
    }
  }

  /**
   * Lista membros de uma franquia
   */
  async listMembers(franchiseId: string): Promise<FranchiseMember[]> {
    try {
      const q = query(
        collection(db(), membersPath(franchiseId)),
        where('isActive', '==', true),
        orderBy('joinedAt', 'desc')
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => ({
        userId: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      })) as FranchiseMember[];
    } catch (error) {
      console.error('[FranchiseService] Erro ao listar membros:', error);
      throw error;
    }
  }

  /**
   * Atualiza role de um membro
   */
  async updateMemberRole(
    franchiseId: string,
    userId: string,
    role: UserRole,
    storeAccess?: string[]
  ): Promise<void> {
    try {
      const docRef = doc(db(), membersPath(franchiseId), userId);
      const updates: Record<string, unknown> = { role };
      
      if (storeAccess) {
        updates.storeAccess = storeAccess;
      }

      await updateDoc(docRef, updates);
    } catch (error) {
      console.error('[FranchiseService] Erro ao atualizar role:', error);
      throw error;
    }
  }

  /**
   * Remove um membro da franquia
   */
  async removeMember(franchiseId: string, userId: string): Promise<void> {
    try {
      // Verifica se não é o owner
      const franchise = await this.getFranchise(franchiseId);
      if (franchise?.ownerId === userId) {
        throw new Error('Não é possível remover o proprietário da franquia');
      }

      // Soft delete - marca como inativo
      const docRef = doc(db(), membersPath(franchiseId), userId);
      await updateDoc(docRef, { isActive: false });
    } catch (error) {
      console.error('[FranchiseService] Erro ao remover membro:', error);
      throw error;
    }
  }

  /**
   * Adiciona permissões customizadas a um membro
   */
  async addCustomPermissions(
    franchiseId: string,
    userId: string,
    permissions: Permission[]
  ): Promise<void> {
    try {
      const docRef = doc(db(), membersPath(franchiseId), userId);
      const member = await this.getMembership(franchiseId, userId);
      
      if (!member) {
        throw new Error('Membro não encontrado');
      }

      const currentPermissions = member.customPermissions || [];
      const newPermissions = [...new Set([...currentPermissions, ...permissions])];

      await updateDoc(docRef, { customPermissions: newPermissions });
    } catch (error) {
      console.error('[FranchiseService] Erro ao adicionar permissões:', error);
      throw error;
    }
  }

  /**
   * Remove permissões customizadas de um membro
   */
  async removeCustomPermissions(
    franchiseId: string,
    userId: string,
    permissions: Permission[]
  ): Promise<void> {
    try {
      const docRef = doc(db(), membersPath(franchiseId), userId);
      const member = await this.getMembership(franchiseId, userId);
      
      if (!member) {
        throw new Error('Membro não encontrado');
      }

      const currentPermissions = member.customPermissions || [];
      const newPermissions = currentPermissions.filter(
        (p) => !permissions.includes(p)
      );

      await updateDoc(docRef, { customPermissions: newPermissions });
    } catch (error) {
      console.error('[FranchiseService] Erro ao remover permissões:', error);
      throw error;
    }
  }

  // ==========================================================================
  // CONVITES
  // ==========================================================================

  /**
   * Cria um convite para um novo membro
   */
  async createInvitation(
    franchiseId: string,
    invitedBy: string,
    data: {
      email: string;
      role: UserRole;
      storeAccess: string[];
    }
  ): Promise<Invitation> {
    try {
      // Verifica se já existe convite pendente para este email
      const existing = await this.getPendingInvitation(franchiseId, data.email);
      if (existing) {
        throw new Error('Já existe um convite pendente para este email');
      }

      // Cria o convite
      const inviteRef = doc(collection(db(), invitationsPath()));
      const token = generateInviteToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

      const inviteData = {
        email: data.email.toLowerCase(),
        franchiseId,
        storeAccess: data.storeAccess,
        role: data.role,
        invitedBy,
        status: 'pending' as InvitationStatus,
        token,
        expiresAt,
        createdAt: serverTimestamp(),
      };

      await setDoc(inviteRef, inviteData);

      return {
        id: inviteRef.id,
        ...data,
        email: data.email.toLowerCase(),
        franchiseId,
        invitedBy,
        status: 'pending',
        token,
        expiresAt,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('[FranchiseService] Erro ao criar convite:', error);
      throw error;
    }
  }

  /**
   * Busca convite por token
   */
  async getInvitationByToken(token: string): Promise<Invitation | null> {
    try {
      const q = query(
        collection(db(), invitationsPath()),
        where('token', '==', token),
        where('status', '==', 'pending'),
        limit(1)
      );
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return null;
      }

      const docSnap = querySnap.docs[0];
      const data = convertTimestamps(docSnap.data());
      return {
        id: docSnap.id,
        ...data,
        storeAccess: resolveInviteStoreAccess(data as Record<string, unknown>),
      } as Invitation;
    } catch (error) {
      console.error('[FranchiseService] Erro ao buscar convite:', error);
      throw error;
    }
  }

  /**
   * Busca convite pendente por email
   */
  async getPendingInvitation(
    franchiseId: string,
    email: string
  ): Promise<Invitation | null> {
    try {
      const q = query(
        collection(db(), invitationsPath()),
        where('franchiseId', '==', franchiseId),
        where('email', '==', email.toLowerCase()),
        where('status', '==', 'pending'),
        limit(1)
      );
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return null;
      }

      const docSnap = querySnap.docs[0];
      const data = convertTimestamps(docSnap.data());
      return {
        id: docSnap.id,
        ...data,
        storeAccess: resolveInviteStoreAccess(data as Record<string, unknown>),
      } as Invitation;
    } catch (error) {
      console.error('[FranchiseService] Erro ao buscar convite pendente:', error);
      throw error;
    }
  }

  /**
   * Aceita um convite
   */
  async acceptInvitation(token: string, userId: string): Promise<void> {
    try {
      const invite = await this.getInvitationByToken(token);
      
      if (!invite) {
        throw new Error('Convite não encontrado ou expirado');
      }

      if (invite.expiresAt < new Date()) {
        // Marca como expirado
        await updateDoc(doc(db(), invitationsPath(), invite.id), {
          status: 'expired',
        });
        throw new Error('Convite expirado');
      }

      const batch = writeBatch(db());

      // Atualiza status do convite
      batch.update(doc(db(), invitationsPath(), invite.id), {
        status: 'accepted',
      });

      // Adiciona como membro
      const memberRef = doc(db(), membersPath(invite.franchiseId), userId);
      batch.set(memberRef, {
        userId,
        role: invite.role,
        storeAccess: invite.storeAccess,
        invitedBy: invite.invitedBy,
        invitedAt: invite.createdAt,
        joinedAt: serverTimestamp(),
        isActive: true,
      });

      await batch.commit();
    } catch (error) {
      console.error('[FranchiseService] Erro ao aceitar convite:', error);
      throw error;
    }
  }

  /**
   * Revoga um convite
   */
  async revokeInvitation(invitationId: string): Promise<void> {
    try {
      await updateDoc(doc(db(), invitationsPath(), invitationId), {
        status: 'revoked',
      });
    } catch (error) {
      console.error('[FranchiseService] Erro ao revogar convite:', error);
      throw error;
    }
  }

  /**
   * Lista convites pendentes de uma franquia
   */
  async listPendingInvitations(franchiseId: string): Promise<Invitation[]> {
    try {
      const q = query(
        collection(db(), invitationsPath()),
        where('franchiseId', '==', franchiseId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...convertTimestamps(docSnap.data()),
      })) as Invitation[];
    } catch (error) {
      console.error('[FranchiseService] Erro ao listar convites:', error);
      throw error;
    }
  }

  /**
   * Valida um token de convite e retorna dados para exibição
   */
  async validateInviteToken(
    token: string
  ): Promise<{ valid: boolean; invite?: PendingInvite; error?: string }> {
    try {
      const invitation = await this.getInvitationByToken(token);

      if (!invitation) {
        return { valid: false, error: 'Convite não encontrado' };
      }

      if (invitation.expiresAt < new Date()) {
        return { valid: false, error: 'Convite expirado' };
      }

      // Buscar dados da franquia
      const franchise = await this.getFranchise(invitation.franchiseId);
      if (!franchise) {
        return { valid: false, error: 'Franquia não encontrada' };
      }

      // Pegar primeira loja do storeAccess (ou "todas")
      let storeId = '';
      let storeName = 'Todas as lojas';
      
      if (invitation.storeAccess.length > 0 && invitation.storeAccess[0] !== '*') {
        storeId = invitation.storeAccess[0];
        // TODO: Buscar nome da loja
        storeName = storeId;
      }

      const pendingInvite: PendingInvite = {
        id: invitation.id,
        email: invitation.email,
        franchiseId: invitation.franchiseId,
        franchiseName: franchise.name,
        storeId,
        storeName,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };

      return { valid: true, invite: pendingInvite };
    } catch (error) {
      console.error('[FranchiseService] Erro ao validar token:', error);
      return { valid: false, error: 'Erro ao validar convite' };
    }
  }

  /**
   * Aceita um convite (wrapper para uso em páginas)
   * Usa o usuário autenticado atual
   */
  async acceptInvite(
    token: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Importa auth para pegar usuário atual
      const { getFirebaseAuth } = await import('./firebase');
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        return { success: false, error: 'Usuário não autenticado' };
      }

      await this.acceptInvitation(token, currentUser.uid);
      return { success: true };
    } catch (error) {
      console.error('[FranchiseService] Erro ao aceitar convite:', error);
      const message = error instanceof Error ? error.message : 'Erro ao aceitar convite';
      return { success: false, error: message };
    }
  }

  // ==========================================================================
  // VERIFICAÇÕES DE ACESSO
  // ==========================================================================

  /**
   * Verifica se um usuário tem acesso a uma franquia
   */
  async hasAccess(franchiseId: string, userId: string): Promise<boolean> {
    const membership = await this.getMembership(franchiseId, userId);
    return membership !== null && membership.isActive;
  }

  /**
   * Verifica se um usuário tem um role específico
   */
  async hasRole(
    franchiseId: string,
    userId: string,
    role: UserRole
  ): Promise<boolean> {
    const membership = await this.getMembership(franchiseId, userId);
    return membership?.role === role;
  }

  /**
   * Verifica se um usuário tem acesso a uma loja específica
   */
  async hasStoreAccess(
    franchiseId: string,
    userId: string,
    storeId: string
  ): Promise<boolean> {
    const membership = await this.getMembership(franchiseId, userId);
    if (!membership || !membership.isActive) return false;
    
    // Owner e Admin têm acesso a tudo
    if (membership.role === 'owner' || membership.role === 'admin') {
      return true;
    }
    
    // Verifica storeAccess
    return membership.storeAccess.includes('*') || 
           membership.storeAccess.includes(storeId);
  }

  /**
   * Obtém permissões efetivas de um membro
   */
  async getEffectivePermissions(
    franchiseId: string,
    userId: string
  ): Promise<Permission[]> {
    const membership = await this.getMembership(franchiseId, userId);
    if (!membership || !membership.isActive) return [];

    // Permissões do role + customPermissions
    const rolePermissions = ROLE_PERMISSIONS[membership.role] || [];
    const customPermissions = membership.customPermissions || [];

    return [...new Set([...rolePermissions, ...customPermissions])];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const franchiseService = new FranchiseService();
