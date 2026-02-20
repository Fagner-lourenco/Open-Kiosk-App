/**
 * ============================================================================
 * Auth - Set Custom Claims
 * ============================================================================
 * 
 * Callable function para atualizar claims do usuário.
 * Apenas admins ou owners podem chamar esta função.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db, admin, requireAuth, requireOwnerOrAdmin, VALID_ROLES } from '../lib';

interface SetClaimsData {
  userId: string;
  role?: string;
  franchiseId?: string;
  storeId?: string | null;
}

export const setCustomClaims = onCall(async (request) => {
  const data = request.data as SetClaimsData;
  // 🔧 v4.0.7: Usando helpers centralizados
  requireAuth(request);
  requireOwnerOrAdmin(request);
  
  const callerUid = request.auth!.uid;
  const callerClaims = request.auth!.token;
  
  // Hierarquia já verificada acima, mas mantemos check adicional
  if (!['owner', 'admin'].includes(callerClaims.role as string)) {
    throw new HttpsError(
      'permission-denied',
      'Apenas owners e admins podem modificar claims'
    );
  }
  
  const { userId, role, franchiseId, storeId } = data;
  
  if (!userId) {
    throw new HttpsError(
      'invalid-argument',
      'userId é obrigatório'
    );
  }

  // 🔒 FIX BUG-A6: Validate role against canonical enum
  if (role && !VALID_ROLES.has(role)) {
    throw new HttpsError(
      'invalid-argument',
      `Role inválida: ${role}. Válidas: ${[...VALID_ROLES].join(', ')}`
    );
  }
  
  try {
    // Busca usuário alvo
    const targetUserDoc = await db.collection('users').doc(userId).get();
    
    if (!targetUserDoc.exists) {
      throw new HttpsError(
        'not-found',
        'Usuário não encontrado'
      );
    }
    
    const targetUser = targetUserDoc.data()!;
    
    // Verifica se o caller tem permissão sobre este usuário
    if (callerClaims.franchiseId !== targetUser.franchiseId) {
      throw new HttpsError(
        'permission-denied',
        'Você não tem permissão para modificar usuários de outra franquia'
      );
    }
    
    // Hierarquia: owner > admin > outros
    const roleHierarchy: Record<string, number> = {
      owner: 100,
      admin: 80,
      manager: 60,
      operator: 40,
      employee: 40,
      technician: 30,
      viewer: 20,
    };
    
    const callerLevel = roleHierarchy[callerClaims.role as string] || 0;
    const targetLevel = roleHierarchy[targetUser.role] || 0;
    const newLevel = role ? roleHierarchy[role] || 0 : targetLevel;
    
    // Não pode modificar quem está acima ou no mesmo nível (exceto owner)
    if (callerClaims.role !== 'owner' && targetLevel >= callerLevel) {
      throw new HttpsError(
        'permission-denied',
        'Você não pode modificar usuários do mesmo nível ou superior'
      );
    }
    
    // Não pode promover alguém ao seu nível ou acima (exceto owner)
    if (callerClaims.role !== 'owner' && newLevel >= callerLevel) {
      throw new HttpsError(
        'permission-denied',
        'Você não pode promover usuários ao seu nível ou superior'
      );
    }
    
    // Buscar claims atuais para merge (preservar storeAccess e outras)
    const currentUser = await admin.auth().getUser(userId);
    const currentClaims = currentUser.customClaims || {};

    // Monta as novas claims com merge
    const newClaims: Record<string, unknown> = {
      ...currentClaims,
      role: role || targetUser.role,
      franchiseId: franchiseId || targetUser.franchiseId,
      storeId: storeId !== undefined ? storeId : targetUser.storeId,
    };
    
    // Atualiza as claims no Auth
    await admin.auth().setCustomUserClaims(userId, newClaims);
    
    // Atualiza o documento do usuário
    await db.collection('users').doc(userId).update({
      role: newClaims.role,
      storeId: newClaims.storeId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    });
    
    logger.info(`Claims atualizadas para usuário ${userId} por ${callerUid}`);
    
    return { success: true, claims: newClaims };
    
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('Erro ao definir claims:', error);
    throw new HttpsError(
      'internal',
      'Erro interno ao processar a requisição'
    );
  }
});
