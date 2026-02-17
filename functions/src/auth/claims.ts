/**
 * ============================================================================
 * Claims Management - Cloud Functions para Custom Claims
 * ============================================================================
 * 
 * Funções administrativas para aplicar custom claims a usuários.
 * 
 * Claims suportados:
 * - role: 'superadmin' | 'admin' | 'owner' | 'manager' | 'operator' | 'employee' | 'technician'
 * - franchiseId: ID da franquia (para acesso multi-tenant)
 * - storeId: ID da loja (para acesso específico)
 * - storeAccess: string[] (lojas permitidas; usar ['*'] para todas)
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db, admin } from '../lib';

// ============================================================================
// TIPOS
// ============================================================================

interface SetAdminClaimsData {
  userId: string;
  claims: {
    role?: string;
    franchiseId?: string;
    storeId?: string | null;
    storeAccess?: string | string[];
  };
}

interface SyncClaimsData {
  userId: string;
  franchiseId: string;
}

// ============================================================================
// FUNÇÕES
// ============================================================================

/**
 * Callable: setAdminClaims
 * 
 * Permite que superadmins definam claims arbitrárias para qualquer usuário.
 * Uso: administração do sistema, correção de permissões.
 */
export const setAdminClaims = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as SetAdminClaimsData;
    const context = request;
    // Verificar autenticação
    if (!context.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }
    
    // Verificar se é superadmin
    const callerClaims = context.auth.token;
    const isSuperAdmin = callerClaims.role === 'superadmin';
    
    // Buscar no Firestore se não está nos claims
    if (!isSuperAdmin) {
      const superadminDoc = await db.collection('superadmins').doc(context.auth.uid).get();
      if (!superadminDoc.exists) {
        throw new HttpsError(
          'permission-denied',
          'Apenas superadmins podem usar esta função'
        );
      }
    }
    
    const { userId, claims } = data;
    
    if (!userId) {
      throw new HttpsError(
        'invalid-argument',
        'userId é obrigatório'
      );
    }
    
    try {
      // Buscar claims atuais
      const user = await admin.auth().getUser(userId);
      const currentClaims = user.customClaims || {};
      
      // Normalizar storeAccess para array (padrão canônico)
      const normalizedClaims: Record<string, unknown> = { ...claims };
      if (normalizedClaims.storeAccess) {
        normalizedClaims.storeAccess = Array.isArray(normalizedClaims.storeAccess)
          ? normalizedClaims.storeAccess
          : [normalizedClaims.storeAccess as string];
      }

      // Mesclar com novas claims
      const newClaims: Record<string, unknown> = {
        ...currentClaims,
        ...normalizedClaims,
      };
      
      // Remover claims null/undefined
      Object.keys(newClaims).forEach(key => {
        if (newClaims[key] === null || newClaims[key] === undefined) {
          delete newClaims[key];
        }
      });
      
      // Aplicar claims
      await admin.auth().setCustomUserClaims(userId, newClaims);
      
      // Log de auditoria canônico: franchises/{fId}/auditLogs
      if (typeof newClaims.franchiseId === 'string' && newClaims.franchiseId) {
        // Compatibilidade com o Admin: grava na subcollection da franquia
        try {
          await db
            .collection('franchises')
            .doc(newClaims.franchiseId)
            .collection('auditLogs')
            .add({
              action: 'auth.setClaims',
              actor: {
                id: context.auth.uid,
                email: context.auth.token.email || '',
                name: context.auth.token.name || null,
              },
              target: {
                type: 'user',
                id: userId,
                name: userId,
              },
              details: {
                claims: newClaims,
              },
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (franchiseAuditError) {
          logger.warn('[claims] Failed to mirror audit log to franchise path', {
            userId,
            franchiseId: newClaims.franchiseId,
            error: franchiseAuditError instanceof Error ? franchiseAuditError.message : franchiseAuditError,
          });
        }
      }

      // Canonical path: franchises/{fId}/auditLogs (no global dual-write)
      // Legacy global audit_logs removed per P2-03/audit contract
      
      logger.info(`[claims] Admin claims set for ${userId}`, { claims: newClaims });
      
      return { success: true, claims: newClaims };
    } catch (error) {
      logger.error('[claims] Error setting admin claims:', error);
      throw new HttpsError(
        'internal',
        'Erro ao definir claims'
      );
    }
  }
);

/**
 * Callable: syncMembershipClaims
 * 
 * Sincroniza claims de um usuário baseado no seu membership em uma franquia.
 * Uso: após aceitar convite, após mudança de role.
 */
export const syncMembershipClaims = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as SyncClaimsData;
    const context = request;
    if (!context.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }
    
    const { userId, franchiseId } = data;
    const callerUid = context.auth.uid;
    const callerClaims = context.auth.token;
    
    // Usuário pode sincronizar próprias claims ou admin pode sincronizar outros
    const isSelf = userId === callerUid;
    const isAdmin = callerClaims.role === 'superadmin' || 
                    callerClaims.role === 'owner' || 
                    callerClaims.role === 'admin';
    
    if (!isSelf && !isAdmin) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão para sincronizar claims deste usuário'
      );
    }

    // Guard cross-tenant: admin/owner só pode sincronizar na própria franquia
    if (!isSelf && callerClaims.role !== 'superadmin') {
      if (callerClaims.franchiseId !== franchiseId) {
        throw new HttpsError(
          'permission-denied',
          'Sem permissão para sincronizar claims em outra franquia'
        );
      }
    }
    
    try {
      // Buscar membership
      const memberDoc = await db
        .doc(`franchises/${franchiseId}/members/${userId}`)
        .get();
      
      if (!memberDoc.exists) {
        throw new HttpsError(
          'not-found',
          'Membership não encontrado'
        );
      }
      
      const membership = memberDoc.data()!;
      
      // Montar claims baseado no membership
      const resolvedStoreAccess = Array.isArray(membership.storeAccess) && membership.storeAccess.length > 0
        ? membership.storeAccess
        : ['*'];

      // Buscar claims existentes para fazer merge (preservar superadmin, etc.)
      const existingUser = await admin.auth().getUser(userId);
      const currentClaims = existingUser.customClaims || {};

      const claims: Record<string, unknown> = {
        ...currentClaims,
        role: membership.role,
        franchiseId: franchiseId,
        storeAccess: resolvedStoreAccess,
      };
      
      // Se tem acesso a apenas uma loja, adicionar storeId
      if (resolvedStoreAccess.length === 1 && resolvedStoreAccess[0] !== '*') {
        claims.storeId = resolvedStoreAccess[0];
      }

      // Proteger superadmin: nunca fazer downgrade via sync de membership
      if (currentClaims.role === 'superadmin' && membership.role !== 'superadmin') {
        claims.role = 'superadmin';
      }
      
      // Aplicar claims
      await admin.auth().setCustomUserClaims(userId, claims);
      
      // Atualizar documento do usuário
      await db.collection('users').doc(userId).set({
        role: membership.role,
        franchiseId: franchiseId,
        storeAccess: resolvedStoreAccess,
        claimsSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      logger.info(`[claims] Membership claims synced for ${userId}`, { claims });
      
      return { success: true, claims };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('[claims] Error syncing membership claims:', error);
      throw new HttpsError(
        'internal',
        'Erro ao sincronizar claims'
      );
    }
  }
);

/**
 * Callable: getClaimsForUser
 * 
 * Retorna claims atuais de um usuário.
 * Uso: debug, verificação de permissões.
 */
export const getClaimsForUser = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as { userId: string };
    const context = request;
    if (!context.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }
    
    const { userId } = data;
    const callerUid = context.auth.uid;
    const callerClaims = context.auth.token;
    
    // Apenas superadmin ou próprio usuário pode ver claims
    const isSelf = userId === callerUid;
    const isSuperAdmin = callerClaims.role === 'superadmin';
    
    if (!isSelf && !isSuperAdmin) {
      // Verificar se caller tem role admin/owner na mesma franquia
      const callerRole = callerClaims.role;
      if (callerRole !== 'owner' && callerRole !== 'admin') {
        throw new HttpsError(
          'permission-denied',
          'Sem permissão para ver claims de outros usuários'
        );
      }

      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'Usuário não encontrado');
      }
      
      const userData = userDoc.data()!;
      if (callerClaims.franchiseId !== userData.franchiseId) {
        throw new HttpsError(
          'permission-denied',
          'Sem permissão para ver claims deste usuário'
        );
      }
    }
    
    try {
      const user = await admin.auth().getUser(userId);
      return {
        success: true,
        claims: user.customClaims || {},
        email: user.email,
        displayName: user.displayName,
      };
    } catch (error) {
      logger.error('[claims] Error getting claims:', error);
      throw new HttpsError(
        'internal',
        'Erro ao buscar claims'
      );
    }
  }
);

/**
 * Callable: refreshUserToken
 * 
 * Força refresh do token do usuário (útil após mudança de claims).
 * Uso: após aceitar convite, após mudança de role.
 */
export const refreshUserToken = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const data = request.data as { userId?: string };
    const context = request;
    if (!context.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }
    
    const userId = data.userId || context.auth.uid;
    
    // Apenas próprio usuário ou superadmin
    if (userId !== context.auth.uid && context.auth.token.role !== 'superadmin') {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }
    
    try {
      // Revogar tokens existentes força refresh
      await admin.auth().revokeRefreshTokens(userId);
      
      logger.info(`[claims] Tokens revoked for ${userId}`);
      
      return { success: true, message: 'Token refresh forçado. Faça login novamente.' };
    } catch (error) {
      logger.error('[claims] Error revoking tokens:', error);
      throw new HttpsError(
        'internal',
        'Erro ao revogar tokens'
      );
    }
  }
);
