/**
 * ============================================================================
 * Auth - Set Custom Claims
 * ============================================================================
 * 
 * Callable function para atualizar claims do usuário.
 * Apenas admins ou owners podem chamar esta função.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface SetClaimsData {
  userId: string;
  role?: string;
  franchiseId?: string;
  storeId?: string | null;
}

export const setCustomClaims = functions.https.onCall(async (data: SetClaimsData, context) => {
  // Verifica autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Usuário não autenticado'
    );
  }
  
  const callerUid = context.auth.uid;
  const callerClaims = context.auth.token;
  
  // Verifica se o caller é owner ou admin
  if (!['owner', 'admin'].includes(callerClaims.role as string)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Apenas owners e admins podem modificar claims'
    );
  }
  
  const { userId, role, franchiseId, storeId } = data;
  
  if (!userId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId é obrigatório'
    );
  }
  
  try {
    // Busca usuário alvo
    const targetUserDoc = await db.collection('users').doc(userId).get();
    
    if (!targetUserDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Usuário não encontrado'
      );
    }
    
    const targetUser = targetUserDoc.data()!;
    
    // Verifica se o caller tem permissão sobre este usuário
    if (callerClaims.franchiseId !== targetUser.franchiseId) {
      throw new functions.https.HttpsError(
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
      technician: 40,
      viewer: 20,
    };
    
    const callerLevel = roleHierarchy[callerClaims.role as string] || 0;
    const targetLevel = roleHierarchy[targetUser.role] || 0;
    const newLevel = role ? roleHierarchy[role] || 0 : targetLevel;
    
    // Não pode modificar quem está acima ou no mesmo nível (exceto owner)
    if (callerClaims.role !== 'owner' && targetLevel >= callerLevel) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Você não pode modificar usuários do mesmo nível ou superior'
      );
    }
    
    // Não pode promover alguém ao seu nível ou acima (exceto owner)
    if (callerClaims.role !== 'owner' && newLevel >= callerLevel) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Você não pode promover usuários ao seu nível ou superior'
      );
    }
    
    // Monta as novas claims
    const newClaims: Record<string, unknown> = {
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
    
    functions.logger.info(`Claims atualizadas para usuário ${userId} por ${callerUid}`);
    
    return { success: true, claims: newClaims };
    
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error('Erro ao definir claims:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erro interno ao processar a requisição'
    );
  }
});
