/**
 * ============================================================================
 * SuperAdmin - Set Super Admin Role
 * ============================================================================
 * 
 * Promove um usuário a super admin.
 * ATENÇÃO: Esta função só pode ser chamada por outro super admin
 * ou pelo primeiro setup via console/script.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db, auth, serverTimestamp } from '../lib';

interface SetSuperAdminData {
  email: string;
}

/**
 * Promove um usuário a super admin
 * Só pode ser chamada por outro super admin
 */
export const setSuperAdmin = onCall(
  async (request) => {
    const data = request.data as SetSuperAdminData;
    // Verificar autenticação
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    // Verificar se quem está chamando é super admin
    const callerToken = request.auth.token;
    const isSuperAdmin = callerToken.role === 'superadmin';

    // Verificar se existe algum super admin no sistema
    const superAdminsSnapshot = await db.collection('superadmins').limit(1).get();
    const hasAnySuperAdmin = !superAdminsSnapshot.empty;

    // 🔒 FIX Bug-2: Bootstrap seguro — se não existe nenhum superadmin,
    // apenas o próprio usuário pode se auto-promover (primeiro setup).
    // Após o primeiro superadmin existir, apenas superadmins podem promover.
    if (hasAnySuperAdmin) {
      if (!isSuperAdmin) {
        throw new HttpsError(
          'permission-denied',
          'Apenas super admins podem promover outros usuários'
        );
      }
    } else {
      // Bootstrap: permitir auto-promoção apenas (caller == target)
      if (data.email !== request.auth.token.email) {
        throw new HttpsError(
          'permission-denied',
          'No bootstrap mode, você só pode promover seu próprio email'
        );
      }
      logger.warn(`[BOOTSTRAP] Primeiro superadmin sendo criado por ${request.auth.token.email}`);
    }

    const { email } = data;

    if (!email) {
      throw new HttpsError(
        'invalid-argument',
        'Email é obrigatório'
      );
    }

    try {
      // Buscar usuário pelo email
      const userRecord = await auth.getUserByEmail(email);
      const uid = userRecord.uid;

      logger.info(`Promovendo ${email} (${uid}) a super admin`);

      // 🔧 v4.0.7: Usar transaction para garantir atomicidade
      await db.runTransaction(async (transaction) => {
        const userDoc = db.collection('users').doc(uid);
        const superadminDoc = db.collection('superadmins').doc(uid);
        const userSnapshot = await transaction.get(userDoc);
        
        // Verificar se já é superadmin para evitar duplicação
        const superadminSnapshot = await transaction.get(superadminDoc);
        if (superadminSnapshot.exists && superadminSnapshot.data()?.status === 'active') {
          throw new HttpsError(
            'already-exists',
            `${email} já é super admin`
          );
        }

        // Criar/atualizar documento na coleção superadmins
        transaction.set(superadminDoc, {
          email,
          displayName: userRecord.displayName || null,
          photoURL: userRecord.photoURL || null,
          createdAt: serverTimestamp(),
          createdBy: request.auth!.uid,
          status: 'active',
        });

        // Atualizar documento do usuário (se existir)
        if (userSnapshot.exists) {
          transaction.update(userDoc, {
            role: 'superadmin',
            franchiseId: null,
            storeId: null,
            updatedAt: serverTimestamp(),
          });
        } else {
          // Criar documento do usuário se não existir
          transaction.set(userDoc, {
            email,
            displayName: userRecord.displayName || null,
            photoURL: userRecord.photoURL || null,
            role: 'superadmin',
            franchiseId: null,
            storeId: null,
            createdAt: serverTimestamp(),
            status: 'active',
          });
        }
      });

      // Atualizar custom claims (fora da transaction - Auth não suporta transactions)
      await auth.setCustomUserClaims(uid, {
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
      });

      logger.info(`${email} promovido a super admin com sucesso`);

      return {
        success: true,
        message: `${email} foi promovido a super admin`,
        uid,
      };
    } catch (error: unknown) {
      logger.error('Erro ao promover super admin:', error);
      
      if (error instanceof Error && 'code' in error) {
        const authError = error as { code: string };
        if (authError.code === 'auth/user-not-found') {
          throw new HttpsError(
            'not-found',
            `Usuário com email ${email} não encontrado`
          );
        }
      }
      
      throw new HttpsError(
        'internal',
        'Erro ao promover super admin'
      );
    }
  }
);

/**
 * Remove role de super admin de um usuário
 */
export const removeSuperAdmin = onCall(
  async (request) => {
    const data = request.data as { uid: string };
    // Verificar autenticação
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    // Verificar se quem está chamando é super admin
    const callerToken = request.auth.token;
    if (callerToken.role !== 'superadmin') {
      throw new HttpsError(
        'permission-denied',
        'Apenas super admins podem remover outros super admins'
      );
    }

    const { uid } = data;

    if (!uid) {
      throw new HttpsError(
        'invalid-argument',
        'UID é obrigatório'
      );
    }

    // Não pode remover a si mesmo
    if (uid === request.auth.uid) {
      throw new HttpsError(
        'failed-precondition',
        'Você não pode remover seu próprio acesso de super admin'
      );
    }

    try {
      // 🔒 FIX Bug-3: Usar batch para atomicidade (evita backdoor por falha parcial)
      // 🔒 FIX Bug-7: Limpar franchiseId e storeId no users doc
      const batch = db.batch();

      // Remover da coleção superadmins
      batch.delete(db.collection('superadmins').doc(uid));

      // Atualizar documento do usuário — limpar role, franchiseId e storeId
      batch.update(db.collection('users').doc(uid), {
        role: 'viewer',
        franchiseId: null,
        storeId: null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      // Remover custom claims (Auth não suporta batch — executa após Firestore confirmar)
      await auth.setCustomUserClaims(uid, {
        role: 'viewer',
        franchiseId: null,
        storeId: null,
      });

      logger.info(`Super admin ${uid} removido com sucesso`);

      return {
        success: true,
        message: 'Super admin removido com sucesso',
      };
    } catch (error) {
      logger.error('Erro ao remover super admin:', error);
      throw new HttpsError(
        'internal',
        'Erro ao remover super admin'
      );
    }
  }
);

/**
 * Lista todos os super admins
 */
export const listSuperAdmins = onCall(
  async (request) => {
    // Verificar autenticação
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    // Verificar se quem está chamando é super admin
    const callerToken = request.auth.token;
    if (callerToken.role !== 'superadmin') {
      throw new HttpsError(
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
      logger.error('Erro ao listar super admins:', error);
      throw new HttpsError(
        'internal',
        'Erro ao listar super admins'
      );
    }
  }
);
