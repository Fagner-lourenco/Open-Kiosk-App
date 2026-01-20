/**
 * ============================================================================
 * Script: Promover primeiro Super Admin
 * ============================================================================
 * 
 * Este script deve ser executado apenas uma vez para criar o primeiro 
 * super admin do sistema. Após isso, outros super admins podem ser 
 * promovidos via a Cloud Function setSuperAdmin.
 * 
 * Uso:
 * npx ts-node scripts/promote-superadmin.ts
 * 
 * Ou via Cloud Functions shell:
 * firebase functions:shell
 * > setSuperAdmin({ email: "fagner.alexandro.lourenco@gmail.com" })
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('firebase-admin');
import * as path from 'path';

// Email do primeiro super admin
const SUPERADMIN_EMAIL = 'fagner.alexandro.lourenco@gmail.com';

// Inicializar Firebase Admin com credenciais do projeto
const serviceAccountPath = path.resolve(__dirname, '../functions/service-account.json');

// Tentar carregar service account, senão usar application default credentials
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch {
  // Se não encontrar service account, usar ADC
  admin.initializeApp();
}

const db = admin.firestore();

async function promoteSuperAdmin() {
  console.log(`\n🚀 Promovendo ${SUPERADMIN_EMAIL} a Super Admin...\n`);

  try {
    // Buscar usuário pelo email
    const userRecord = await admin.auth().getUserByEmail(SUPERADMIN_EMAIL);
    const uid = userRecord.uid;

    console.log(`✓ Usuário encontrado: ${userRecord.displayName || userRecord.email} (${uid})`);

    // Atualizar custom claims
    await admin.auth().setCustomUserClaims(uid, {
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
      });
      console.log('✓ Documento users criado');
    }

    console.log(`\n✅ ${SUPERADMIN_EMAIL} foi promovido a Super Admin com sucesso!`);
    console.log('\n⚠️  IMPORTANTE: O usuário precisa fazer logout e login novamente');
    console.log('   para que as novas permissões entrem em vigor.\n');

  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const authError = error as { code: string };
      if (authError.code === 'auth/user-not-found') {
        console.error(`\n❌ Erro: Usuário com email ${SUPERADMIN_EMAIL} não encontrado.`);
        console.error('   Certifique-se de que o usuário já se registrou no sistema.\n');
        process.exit(1);
      }
    }
    
    console.error('\n❌ Erro ao promover super admin:', error);
    process.exit(1);
  }

  process.exit(0);
}

promoteSuperAdmin();
