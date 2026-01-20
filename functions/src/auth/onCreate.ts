/**
 * ============================================================================
 * Auth - onCreate Trigger
 * ============================================================================
 * 
 * Dispara quando um novo usuário é criado no Firebase Auth.
 * Cria o documento base no Firestore.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Inicializa o app apenas se não estiver inicializado
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  const { uid, email, displayName, photoURL } = user;
  
  functions.logger.info(`Novo usuário criado: ${email} (${uid})`);
  
  try {
    // Verificar se o usuário está na lista de superadmins
    const superAdminDoc = await db.collection('superadmins').doc(uid).get();
    if (superAdminDoc.exists) {
      functions.logger.info(`Usuário ${email} é super admin pré-cadastrado`);
      
      // Define claims de superadmin
      await admin.auth().setCustomUserClaims(uid, {
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
      });
      
      // Cria documento do usuário
      await db.collection('users').doc(uid).set({
        email,
        displayName: displayName || null,
        photoURL: photoURL || null,
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
      });
      
      return;
    }
    
    // Verifica se existe um convite pendente para este email
    const invitationQuery = await db
      .collection('invitations')
      .where('email', '==', email)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    
    if (!invitationQuery.empty) {
      // Usuário foi convidado - não cria documento ainda
      // O documento será criado quando aceitar o convite
      functions.logger.info(`Usuário ${email} tem convite pendente, aguardando aceitação`);
      return;
    }
    
    // Novo usuário sem convite - cria como owner de nova franquia
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    // Cria a franquia
    const franchiseRef = db.collection('franchises').doc();
    await franchiseRef.set({
      name: `Franquia de ${displayName || email}`,
      ownerId: uid,
      createdAt: now,
      status: 'active',
      plan: 'trial',
      planExpiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 dias trial
      ),
    });
    
    // Cria o documento do usuário
    await db.collection('users').doc(uid).set({
      email,
      displayName: displayName || null,
      photoURL: photoURL || null,
      role: 'owner',
      franchiseId: franchiseRef.id,
      storeId: null, // Owner tem acesso a todas as lojas
      createdAt: now,
      lastLoginAt: now,
      status: 'active',
    });
    
    // Define custom claims
    await admin.auth().setCustomUserClaims(uid, {
      role: 'owner',
      franchiseId: franchiseRef.id,
      storeId: null,
    });
    
    functions.logger.info(`Franquia ${franchiseRef.id} criada para usuário ${uid}`);
    
  } catch (error) {
    functions.logger.error('Erro ao processar novo usuário:', error);
    throw error;
  }
});
