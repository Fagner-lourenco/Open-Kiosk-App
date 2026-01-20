/**
 * Script para promover usuário a Super Admin
 * 
 * Uso: cd functions && npx ts-node scripts/promote-superadmin.ts
 */

const admin = require('firebase-admin');

// Email do super admin
const SUPERADMIN_EMAIL = 'fagner.alexandro.lourenco@gmail.com';

// Inicializa com Application Default Credentials
admin.initializeApp({
  projectId: 'open-kiosk-22b2b',
});

const db = admin.firestore();

async function main() {
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

    // Atualizar documento do usuário
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

    console.log(`\n✅ ${SUPERADMIN_EMAIL} promovido a Super Admin!`);
    console.log('\n⚠️  IMPORTANTE: Faça logout e login novamente no Admin.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro:', error.message || error);
    process.exit(1);
  }
}

main();
