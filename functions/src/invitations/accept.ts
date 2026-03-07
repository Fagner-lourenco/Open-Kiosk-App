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

export const acceptInvitation = onCall({ region: 'southamerica-east1' }, async (request) => {
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

    const invitationFranchiseId = typeof invitation.franchiseId === 'string'
      ? invitation.franchiseId.trim()
      : '';

    if (!invitationFranchiseId) {
      throw new HttpsError(
        'failed-precondition',
        'Convite inválido: franchiseId ausente'
      );
    }

    // Garantir integridade: convite não pode criar membership para franquia inexistente/inativa
    const franchiseSnap = await db.collection('franchises').doc(invitationFranchiseId).get();
    if (!franchiseSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'Franquia do convite não existe'
      );
    }

    const franchiseData = franchiseSnap.data() as { status?: string; isActive?: boolean } | undefined;
    const franchiseStatus = typeof franchiseData?.status === 'string'
      ? franchiseData.status.toLowerCase()
      : 'active';
    const franchiseIsActive = franchiseData?.isActive !== false
      && franchiseStatus !== 'inactive'
      && franchiseStatus !== 'disabled'
      && franchiseStatus !== 'deleted';

    if (!franchiseIsActive) {
      throw new HttpsError(
        'failed-precondition',
        'Franquia do convite está inativa'
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


    // 🔒 FIX P0-4: Fetch Auth user BEFORE entering the Firestore transaction.
    // Auth API calls are external network calls that can cause transaction timeout
    // and redundant retries. Pre-fetch once and reuse inside the transaction.
    const authUser = await admin.auth().getUser(uid);

    // 🔒 FIX BUG-A5: Use transaction instead of batch to prevent double-accept race
    await db.runTransaction(async (txn) => {
      // Re-read invitation inside transaction to guard against concurrent accept
      const freshInviteSnap = await txn.get(inviteDoc.ref);
      if (!freshInviteSnap.exists || freshInviteSnap.data()?.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Convite j� foi utilizado ou n�o est� pendente');
      }

      const franchiseRef = db.collection('franchises').doc(invitationFranchiseId);
      const freshFranchiseSnap = await txn.get(franchiseRef);
      if (!freshFranchiseSnap.exists) {
        throw new HttpsError('failed-precondition', 'Franquia do convite n�o existe');
      }
      const freshFranchise = freshFranchiseSnap.data() as { status?: string; isActive?: boolean } | undefined;
      const freshFranchiseStatus = typeof freshFranchise?.status === 'string'
        ? freshFranchise.status.toLowerCase()
        : 'active';
      const freshFranchiseIsActive = freshFranchise?.isActive !== false
        && freshFranchiseStatus !== 'inactive'
        && freshFranchiseStatus !== 'disabled'
        && freshFranchiseStatus !== 'deleted';
      if (!freshFranchiseIsActive) {
        throw new HttpsError('failed-precondition', 'Franquia do convite est� inativa');
      }

      // Atualiza o convite
      txn.update(inviteDoc.ref, {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: uid,
      });

      // Cria ou atualiza o documento do usuário
      const userRef = db.collection('users').doc(uid);
      const userDoc = await txn.get(userRef);

      if (userDoc.exists) {
        txn.update(userRef, {
          role: invitation.role,
          franchiseId: invitationFranchiseId,
          storeId: resolvedStoreId,
          storeAccess: resolvedStoreAccess,
          updatedAt: now,
        });
      } else {
        txn.set(userRef, {
          email: authUser.email,
          displayName: authUser.displayName || null,
          photoURL: authUser.photoURL || null,
          role: invitation.role,
          franchiseId: invitationFranchiseId,
          storeId: resolvedStoreId,
          storeAccess: resolvedStoreAccess,
          createdAt: now,
          lastLoginAt: now,
          status: 'active',
          invitedBy: invitation.invitedBy,
        });
      }

      // CRÍTICO: Criar membership na subcollection da franquia
      const memberRef = db.collection('franchises').doc(invitationFranchiseId).collection('members').doc(uid);
      const memberDoc = await txn.get(memberRef);

      if (!memberDoc.exists) {
        txn.set(memberRef, {
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
        txn.update(memberRef, {
          role: invitation.role,
          storeAccess: resolvedStoreAccess,
          isActive: true,
          updatedAt: now,
        });
      }
    });

    // Atualiza custom claims (merge com existentes para preservar superadmin etc.)
    const currentUser = await admin.auth().getUser(uid);
    const currentClaims = currentUser.customClaims || {};

    const newClaims: Record<string, unknown> = {
      ...currentClaims,
      role: invitation.role,
      franchiseId: invitationFranchiseId,
      storeId: resolvedStoreId,
      storeAccess: resolvedStoreAccess,
    };

    // Proteger superadmin: nunca fazer downgrade via aceite de convite
    if (currentClaims.role === 'superadmin' && invitation.role !== 'superadmin') {
      newClaims.role = 'superadmin';
    }

    await admin.auth().setCustomUserClaims(uid, newClaims);

    logger.info(`Convite aceito por ${userEmail} para franquia ${invitationFranchiseId}`);

    return {
      success: true,
      franchiseId: invitationFranchiseId,
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
export const validateInvitationToken = onRequest({ region: 'southamerica-east1' }, async (req, res) => {
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
