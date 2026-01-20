/**
 * Script para promover primeiro Super Admin
 * Execute com: node scripts/promote-superadmin.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const SUPERADMIN_EMAIL = 'fagner.alexandro.lourenco@gmail.com';

// Inicializa Firebase Admin (usa application default credentials)
if (getApps().length === 0) {
  initializeApp({
    projectId: 'open-kiosk-22b2b',
  });
}

const auth = getAuth();
const db = getFirestore();

async function promoteSuperAdmin() {
  console.log(`\n🚀 Promovendo ${SUPERADMIN_EMAIL} a Super Admin...\n`);

  try {
    // Buscar usuário pelo email
    const userRecord = await auth.getUserByEmail(SUPERADMIN_EMAIL);
    const uid = userRecord.uid;

    console.log(`✓ Usuário encontrado: ${userRecord.displayName || userRecord.email} (${uid})`);

    // Atualizar custom claims
    await auth.setCustomUserClaims(uid, {
      role: 'superadmin',
      franchiseId: null,
      storeId: null,
    });
    console.log('✓ Custom claims atualizados');

    // Criar documento na coleção superadmins
    await db.collection('superadmins').doc(uid).set({
      email: SUPERADMIN_EMAIL,
      displayName: userRecord.displayName || null,
      photoURL: userRecord.photoURL || null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'script-initial-setup',
      status: 'active',
    });
    console.log('✓ Documento superadmins criado');

    // Atualizar documento do usuário (se existir)
    const userDoc = db.collection('users').doc(uid);
    const userSnapshot = await userDoc.get();
    
    if (userSnapshot.exists) {
      await userDoc.update({
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log('✓ Documento users atualizado');
    } else {
      await userDoc.set({
        email: SUPERADMIN_EMAIL,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        role: 'superadmin',
        franchiseId: null,
        storeId: null,
        createdAt: FieldValue.serverTimestamp(),
        status: 'active',
      });
      console.log('✓ Documento users criado');
    }

    console.log(`\n✅ ${SUPERADMIN_EMAIL} foi promovido a Super Admin com sucesso!`);
    console.log('\n⚠️  IMPORTANTE: O usuário precisa fazer logout e login novamente');
    console.log('   para que as novas permissões entrem em vigor.\n');

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`\n❌ Erro: Usuário com email ${SUPERADMIN_EMAIL} não encontrado.`);
      console.error('   Certifique-se de que o usuário já se registrou no sistema.\n');
      process.exit(1);
    }
    
    console.error('\n❌ Erro ao promover super admin:', error);
    process.exit(1);
  }

  process.exit(0);
}

promoteSuperAdmin();
