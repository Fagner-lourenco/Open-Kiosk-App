/**
 * ============================================================================
 * Invitations - Accept
 * ============================================================================
 * 
 * Callable function para aceitar um convite.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface AcceptInvitationData {
  token: string;
}

export const acceptInvitation = functions.https.onCall(async (data: AcceptInvitationData, context) => {
  // Verifica autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Você precisa estar logado para aceitar o convite'
    );
  }
  
  const { token } = data;
  
  if (!token) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Token do convite é obrigatório'
    );
  }
  
  const uid = context.auth.uid;
  const userEmail = context.auth.token.email;
  
  try {
    // Busca o convite pelo token
    const inviteQuery = await db
      .collection('invitations')
      .where('token', '==', token)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    
    if (inviteQuery.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'Convite não encontrado ou já foi utilizado'
      );
    }
    
    const inviteDoc = inviteQuery.docs[0];
    const invitation = inviteDoc.data();
    
    // Verifica se o email corresponde
    if (invitation.email.toLowerCase() !== userEmail?.toLowerCase()) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Este convite foi enviado para outro email'
      );
    }
    
    // Verifica se não expirou
    const expiresAt = invitation.expiresAt.toDate();
    if (expiresAt < new Date()) {
      // Marca como expirado
      await inviteDoc.ref.update({ status: 'expired' });
      throw new functions.https.HttpsError(
        'deadline-exceeded',
        'Este convite expirou'
      );
    }
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    // Executa em batch para garantir consistência
    const batch = db.batch();
    
    // Atualiza o convite
    batch.update(inviteDoc.ref, {
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: uid,
    });
    
    // Cria ou atualiza o documento do usuário
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      // Usuário já existe - atualiza
      batch.update(userRef, {
        role: invitation.role,
        franchiseId: invitation.franchiseId,
        storeId: invitation.storeId,
        updatedAt: now,
      });
    } else {
      // Novo usuário - cria documento
      const authUser = await admin.auth().getUser(uid);
      batch.set(userRef, {
        email: authUser.email,
        displayName: authUser.displayName || null,
        photoURL: authUser.photoURL || null,
        role: invitation.role,
        franchiseId: invitation.franchiseId,
        storeId: invitation.storeId,
        createdAt: now,
        lastLoginAt: now,
        status: 'active',
        invitedBy: invitation.invitedBy,
      });
    }
    
    // CRÍTICO: Criar membership na subcollection da franquia
    // Isso garante que o usuário apareça na lista de membros e tenha acesso às lojas
    const memberRef = db.collection('franchises').doc(invitation.franchiseId).collection('members').doc(uid);
    const memberDoc = await memberRef.get();
    
    if (!memberDoc.exists) {
      const authUser = await admin.auth().getUser(uid);
      batch.set(memberRef, {
        userId: uid,
        email: authUser.email || userEmail,
        displayName: authUser.displayName || null,
        photoURL: authUser.photoURL || null,
        role: invitation.role,
        storeAccess: invitation.storeId ? [invitation.storeId] : ['*'],
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt || now,
        joinedAt: now,
        isActive: true,
      });
    } else {
      // Atualiza membership existente
      batch.update(memberRef, {
        role: invitation.role,
        storeAccess: invitation.storeId ? [invitation.storeId] : ['*'],
        isActive: true,
        updatedAt: now,
      });
    }
    
    // Executa o batch
    await batch.commit();
    
    // Atualiza custom claims
    await admin.auth().setCustomUserClaims(uid, {
      role: invitation.role,
      franchiseId: invitation.franchiseId,
      storeId: invitation.storeId,
    });
    
    functions.logger.info(`Convite aceito por ${userEmail} para franquia ${invitation.franchiseId}`);
    
    return { 
      success: true,
      franchiseId: invitation.franchiseId,
      role: invitation.role,
      storeId: invitation.storeId,
    };
    
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error('Erro ao aceitar convite:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erro interno ao processar o convite'
    );
  }
});

/**
 * HTTP endpoint para validar token (público)
 */
export const validateInvitationToken = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }
  
  const token = req.query.token as string;
  
  if (!token) {
    res.status(400).json({ error: 'Token é obrigatório' });
    return;
  }
  
  try {
    const inviteQuery = await db
      .collection('invitations')
      .where('token', '==', token)
      .limit(1)
      .get();
    
    if (inviteQuery.empty) {
      res.status(404).json({ valid: false, error: 'Convite não encontrado' });
      return;
    }
    
    const invitation = inviteQuery.docs[0].data();
    
    if (invitation.status !== 'pending') {
      res.status(400).json({ 
        valid: false, 
        error: `Convite já foi ${invitation.status === 'accepted' ? 'utilizado' : 'invalidado'}` 
      });
      return;
    }
    
    const expiresAt = invitation.expiresAt.toDate();
    if (expiresAt < new Date()) {
      res.status(400).json({ valid: false, error: 'Convite expirado' });
      return;
    }
    
    // Busca dados da franquia para exibir
    const franchiseDoc = await db.collection('franchises').doc(invitation.franchiseId).get();
    const franchiseName = franchiseDoc.exists ? franchiseDoc.data()?.name : 'Franquia';
    
    res.json({
      valid: true,
      email: invitation.email,
      role: invitation.role,
      franchiseName,
      expiresAt: expiresAt.toISOString(),
    });
    
  } catch (error) {
    functions.logger.error('Erro ao validar token:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});
