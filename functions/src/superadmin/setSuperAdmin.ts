/**
 * ============================================================================
 * SuperAdmin - Set Super Admin Role
 * ============================================================================
 * 
 * Promove um usuário a super admin.
 * ATENÇÃO: Esta função só pode ser chamada por outro super admin
 * ou pelo primeiro setup via console/script.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Inicializa o app apenas se não estiver inicializado
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface SetSuperAdminData {
  email: string;
}

/**
 * Promove um usuário a super admin
 * Só pode ser chamada por outro super admin
 */
export const setSuperAdmin = functions.https.onCall(
  async (data: SetSuperAdminData, context) => {
    // Verificar autenticação
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    // Verificar se quem está chamando é super admin
    const callerToken = context.auth.token;
    const isSuperAdmin = callerToken.role === 'superadmin';
    
    // Verificar se existe algum super admin no sistema
    const superAdminsSnapshot = await db.collection('superadmins').limit(1).get();
    const hasAnySuperAdmin = !superAdminsSnapshot.empty;
    
    // Se já existe super admin, apenas super admin pode promover
    if (hasAnySuperAdmin && !isSuperAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Apenas super admins podem promover outros usuários'
      );
    }

    const { email } = data;

    if (!email) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Email é obrigatório'
      );
    }

    try {
      // Buscar usuário pelo email
      const userRecord = await admin.auth().getUserByEmail(email);
      const uid = userRecord.uid;

      functions.logger.info(`Promovendo ${email} (${uid}) a super admin`);

      // Atualizar custom claims
      await admin.auth().setCustomUserClaims(uid, {
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
      });

      // Criar/atualizar documento na coleção superadmins
      await db.collection('superadmins').doc(uid).set({
        email,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.uid,
        status: 'active',
      });

      // Atualizar documento do usuário (se existir)
      const userDoc = db.collection('users').doc(uid);
      const userSnapshot = await userDoc.get();
      
      if (userSnapshot.exists) {
        await userDoc.update({
          role: 'superadmin',
          franchiseId: null,
          storeId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Criar documento do usuário se não existir
        await userDoc.set({
          email,
          displayName: userRecord.displayName || null,
          photoURL: userRecord.photoURL || null,
          role: 'superadmin',
          franchiseId: null,
          storeId: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'active',
        });
      }

      functions.logger.info(`${email} promovido a super admin com sucesso`);

      return {
        success: true,
        message: `${email} foi promovido a super admin`,
        uid,
      };
    } catch (error: unknown) {
      functions.logger.error('Erro ao promover super admin:', error);
      
      if (error instanceof Error && 'code' in error) {
        const authError = error as { code: string };
        if (authError.code === 'auth/user-not-found') {
          throw new functions.https.HttpsError(
            'not-found',
            `Usuário com email ${email} não encontrado`
          );
        }
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao promover super admin'
      );
    }
  }
);

/**
 * Remove role de super admin de um usuário
 */
export const removeSuperAdmin = functions.https.onCall(
  async (data: { uid: string }, context) => {
    // Verificar autenticação
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    // Verificar se quem está chamando é super admin
    const callerToken = context.auth.token;
    if (callerToken.role !== 'superadmin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Apenas super admins podem remover outros super admins'
      );
    }

    const { uid } = data;

    if (!uid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'UID é obrigatório'
      );
    }

    // Não pode remover a si mesmo
    if (uid === context.auth.uid) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Você não pode remover seu próprio acesso de super admin'
      );
    }

    try {
      // Remover custom claims
      await admin.auth().setCustomUserClaims(uid, {
        role: null,
        franchiseId: null,
        storeId: null,
      });

      // Remover da coleção superadmins
      await db.collection('superadmins').doc(uid).delete();

      // Atualizar documento do usuário
      await db.collection('users').doc(uid).update({
        role: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Super admin ${uid} removido com sucesso`);

      return {
        success: true,
        message: 'Super admin removido com sucesso',
      };
    } catch (error) {
      functions.logger.error('Erro ao remover super admin:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao remover super admin'
      );
    }
  }
);

/**
 * Lista todos os super admins
 */
export const listSuperAdmins = functions.https.onCall(
  async (_data, context) => {
    // Verificar autenticação
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    // Verificar se quem está chamando é super admin
    const callerToken = context.auth.token;
    if (callerToken.role !== 'superadmin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Apenas super admins podem listar outros super admins'
      );
    }

    try {
      const snapshot = await db.collection('superadmins')
        .orderBy('createdAt', 'desc')
        .get();

      const superAdmins = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        superAdmins,
      };
    } catch (error) {
      functions.logger.error('Erro ao listar super admins:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Erro ao listar super admins'
      );
    }
  }
);
