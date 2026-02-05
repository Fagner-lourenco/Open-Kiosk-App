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

import * as functions from 'firebase-functions';
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
export const setAdminClaims = functions
  .region('southamerica-east1')
  .https.onCall(async (data: SetAdminClaimsData, context) => {
    // Verificar autenticação
    if (!context.auth) {
      throw new functions.https.HttpsError(
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
        throw new functions.https.HttpsError(
          'permission-denied',
          'Apenas superadmins podem usar esta função'
        );
      }
    }
    
    const { userId, claims } = data;
    
    if (!userId) {
      throw new functions.https.HttpsError(
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
      
      // Log de auditoria (inclui franchiseId/storeId para compatibilidade com rules)
      const auditLog: Record<string, unknown> = {
        action: 'set_admin_claims',
        targetUserId: userId,
        performedBy: context.auth.uid,
        claims: newClaims,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (typeof newClaims.franchiseId === 'string' && newClaims.franchiseId) {
        auditLog.franchiseId = newClaims.franchiseId;
      }
      if (typeof newClaims.storeId === 'string' && newClaims.storeId) {
        auditLog.storeId = newClaims.storeId;
      }

      await db.collection('audit_logs').add(auditLog);
      
      functions.logger.info(`[claims] Admin claims set for ${userId}`, { claims: newClaims });
      
      return { success: true, claims: newClaims };
    } catch (error) {
      functions.logger.error('[claims] Error setting admin claims:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao definir claims'
      );
    }
  });

/**
 * Callable: syncMembershipClaims
 * 
 * Sincroniza claims de um usuário baseado no seu membership em uma franquia.
 * Uso: após aceitar convite, após mudança de role.
 */
export const syncMembershipClaims = functions
  .region('southamerica-east1')
  .https.onCall(async (data: SyncClaimsData, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
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
      throw new functions.https.HttpsError(
        'permission-denied',
        'Sem permissão para sincronizar claims deste usuário'
      );
    }
    
    try {
      // Buscar membership
      const memberDoc = await db
        .doc(`franchises/${franchiseId}/members/${userId}`)
        .get();
      
      if (!memberDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Membership não encontrado'
        );
      }
      
      const membership = memberDoc.data()!;
      
      // Montar claims baseado no membership
      const resolvedStoreAccess = Array.isArray(membership.storeAccess) && membership.storeAccess.length > 0
        ? membership.storeAccess
        : ['*'];

      const claims: Record<string, unknown> = {
        role: membership.role,
        franchiseId: franchiseId,
        storeAccess: resolvedStoreAccess,
      };
      
      // Se tem acesso a apenas uma loja, adicionar storeId
      if (resolvedStoreAccess.length === 1 && resolvedStoreAccess[0] !== '*') {
        claims.storeId = resolvedStoreAccess[0];
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
      
      functions.logger.info(`[claims] Membership claims synced for ${userId}`, { claims });
      
      return { success: true, claims };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error('[claims] Error syncing membership claims:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao sincronizar claims'
      );
    }
  });

/**
 * Callable: getClaimsForUser
 * 
 * Retorna claims atuais de um usuário.
 * Uso: debug, verificação de permissões.
 */
export const getClaimsForUser = functions
  .region('southamerica-east1')
  .https.onCall(async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
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
      // Verificar se é admin da mesma franquia
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Usuário não encontrado');
      }
      
      const userData = userDoc.data()!;
      if (callerClaims.franchiseId !== userData.franchiseId) {
        throw new functions.https.HttpsError(
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
      functions.logger.error('[claims] Error getting claims:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao buscar claims'
      );
    }
  });

/**
 * Callable: refreshUserToken
 * 
 * Força refresh do token do usuário (útil após mudança de claims).
 * Uso: após aceitar convite, após mudança de role.
 */
export const refreshUserToken = functions
  .region('southamerica-east1')
  .https.onCall(async (data: { userId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }
    
    const userId = data.userId || context.auth.uid;
    
    // Apenas próprio usuário ou superadmin
    if (userId !== context.auth.uid && context.auth.token.role !== 'superadmin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }
    
    try {
      // Revogar tokens existentes força refresh
      await admin.auth().revokeRefreshTokens(userId);
      
      functions.logger.info(`[claims] Tokens revoked for ${userId}`);
      
      return { success: true, message: 'Token refresh forçado. Faça login novamente.' };
    } catch (error) {
      functions.logger.error('[claims] Error revoking tokens:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao revogar tokens'
      );
    }
  });
