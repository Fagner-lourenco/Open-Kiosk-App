/**
 * ============================================================================
 * Invitations - Accept
 * ============================================================================
 * 
 * Callable function para aceitar um convite.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db, admin, requireAuth } from '../lib';

interface AcceptInvitationData {
  token?: string;
  invitationId?: string;
}

export const acceptInvitation = onCall(async (request) => {
  const data = request.data as AcceptInvitationData;
  // 🔧 v4.0.7: Usando helper centralizado
  requireAuth(request);

  const { token, invitationId } = data;

  if (!token && !invitationId) {
    throw new HttpsError(
      'invalid-argument',
      'Token ou ID do convite é obrigatório'
    );
  }

  const uid = request.auth!.uid;
  const userEmail = request.auth!.token.email;

  try {
    let inviteDoc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot;
    let invitation: FirebaseFirestore.DocumentData;

    if (token) {
      // Busca o convite pelo token
      const inviteQuery = await db
        .collection('invitations')
        .where('token', '==', token)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (inviteQuery.empty) {
        throw new HttpsError(
          'not-found',
          'Convite não encontrado ou já foi utilizado'
        );
      }

      inviteDoc = inviteQuery.docs[0];
      invitation = inviteDoc.data()!;
    } else {
      // Fallback: convite por ID
      inviteDoc = await db.collection('invitations').doc(invitationId!).get();
      if (!inviteDoc.exists) {
        throw new HttpsError(
          'not-found',
          'Convite não encontrado'
        );
      }
      invitation = inviteDoc.data() || {};

      if (invitation.status !== 'pending') {
        throw new HttpsError(
          'failed-precondition',
          'Convite não está pendente'
        );
      }
    }

    // Verifica se o email corresponde
    if (invitation.email.toLowerCase() !== userEmail?.toLowerCase()) {
      throw new HttpsError(
        'permission-denied',
        'Este convite foi enviado para outro email'
      );
    }

    // Verifica se não expirou
    const expiresAt = invitation.expiresAt.toDate();
    if (expiresAt < new Date()) {
      // Marca como expirado
      await inviteDoc.ref.update({ status: 'expired' });
      throw new HttpsError(
        'deadline-exceeded',
        'Este convite expirou'
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Resolve storeAccess e storeId de forma canonica
    const resolvedStoreAccess = Array.isArray(invitation.storeAccess) && invitation.storeAccess.length > 0
      ? invitation.storeAccess
      : (invitation.storeId ? [invitation.storeId] : ['*']);

    const resolvedStoreId = invitation.storeId || (
      resolvedStoreAccess.length === 1 && resolvedStoreAccess[0] !== '*'
        ? resolvedStoreAccess[0]
        : null
    );


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
        storeId: resolvedStoreId,
        storeAccess: resolvedStoreAccess,
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
        storeId: resolvedStoreId,
        storeAccess: resolvedStoreAccess,
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
        storeAccess: resolvedStoreAccess,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt || now,
        joinedAt: now,
        isActive: true,
      });
    } else {
      // Atualiza membership existente
      batch.update(memberRef, {
        role: invitation.role,
        storeAccess: resolvedStoreAccess,
        isActive: true,
        updatedAt: now,
      });
    }

    // Executa o batch
    await batch.commit();

    // Atualiza custom claims (merge com existentes para preservar superadmin etc.)
    const currentUser = await admin.auth().getUser(uid);
    const currentClaims = currentUser.customClaims || {};

    const newClaims: Record<string, unknown> = {
      ...currentClaims,
      role: invitation.role,
      franchiseId: invitation.franchiseId,
      storeId: resolvedStoreId,
      storeAccess: resolvedStoreAccess,
    };

    // Proteger superadmin: nunca fazer downgrade via aceite de convite
    if (currentClaims.role === 'superadmin' && invitation.role !== 'superadmin') {
      newClaims.role = 'superadmin';
    }

    await admin.auth().setCustomUserClaims(uid, newClaims);

    logger.info(`Convite aceito por ${userEmail} para franquia ${invitation.franchiseId}`);

    return {
      success: true,
      franchiseId: invitation.franchiseId,
      role: invitation.role,
      storeId: resolvedStoreId,
    };

  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('Erro ao aceitar convite:', error);
    throw new HttpsError(
      'internal',
      'Erro interno ao processar o convite'
    );
  }
});

/**
 * HTTP endpoint para validar token (público)
 */
export const validateInvitationToken = onRequest(async (req, res) => {
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

    // 🔒 FIX Bug-4: Não expor email, role, franchiseName publicamente
    res.json({
      valid: true,
      expiresAt: expiresAt.toISOString(),
    });

  } catch (error) {
    logger.error('Erro ao validar token:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});
