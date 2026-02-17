/**
 * ============================================================================
 * Auth - onCreate Trigger
 * ============================================================================
 * 
 * Dispara quando um novo usuário é criado no Firebase Auth.
 * Cria o documento base no Firestore.
 * 
 * 🔧 v4.0.7: Refatorado para usar módulos lib/
 */

import { user as authUser } from 'firebase-functions/v1/auth';
import * as logger from 'firebase-functions/logger';
import { db, admin, serverTimestamp, setUserClaims } from '../lib';
import type { UserClaims } from '../lib';

function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const onUserCreated = authUser().onCreate(async (user) => {
  const { uid, email, displayName, photoURL } = user;
  
  logger.info(`Novo usuário criado: ${email} (${uid})`);
  
  try {
    // Verificar se o usuário está na lista de superadmins
    const superAdminDoc = await db.collection('superadmins').doc(uid).get();
    if (superAdminDoc.exists) {
      logger.info(`Usuário ${email} é super admin pré-cadastrado`);
      
      // 🔧 v4.0.7: Usando helper centralizado
      const claims: UserClaims = {
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
      };
      await setUserClaims(uid, claims);
      
      // Cria documento do usuário
      await db.collection('users').doc(uid).set({
        email,
        displayName: displayName || null,
        photoURL: photoURL || null,
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        isActive: true,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
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
      logger.info(`Usuário ${email} tem convite pendente, aguardando aceitação`);
      return;
    }
    
    // Novo usuário sem convite - cria como owner de nova franquia
    const now = serverTimestamp();
    const trialEndsAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 dias trial
    );
    
    // Cria a franquia
    const franchiseRef = db.collection('franchises').doc();
    const baseSlug = generateSlug(displayName || email || 'franquia');
    const slug = baseSlug ? `${baseSlug}-${franchiseRef.id.slice(0, 6)}` : franchiseRef.id;
    await franchiseRef.set({
      name: `Franquia de ${displayName || email}`,
      slug,
      ownerId: uid,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      plan: 'trial',
      planStatus: 'trial',
      billingStatus: 'trial',
      planExpiresAt: trialEndsAt,
      trialEndsAt,
      maxStores: 1,
      maxUsersPerStore: 5,
      features: ['basic'],
    });
    
    // Cria o documento do usuário
    await db.collection('users').doc(uid).set({
      email,
      displayName: displayName || null,
      photoURL: photoURL || null,
      role: 'owner',
      franchiseId: franchiseRef.id,
      storeId: null, // Owner tem acesso a todas as lojas
      isActive: true,
      createdAt: now,
      lastLoginAt: now,
      status: 'active',
    });
    
    // 🔧 v4.0.7: Usando helper centralizado
    await setUserClaims(uid, {
      role: 'owner',
      franchiseId: franchiseRef.id,
      storeId: null,
    });
    
    logger.info(`Franquia ${franchiseRef.id} criada para usuário ${uid}`);
    
  } catch (error) {
    logger.error('Erro ao processar novo usuário:', error);
    throw error;
  }
});
