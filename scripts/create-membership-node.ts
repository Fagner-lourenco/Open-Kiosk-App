/**
 * Script Node.js para criar membership de teste
 * Execute: npx ts-node scripts/create-membership-node.ts
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('firebase-admin');
import * as fs from 'fs';

// Configuração
const CONFIG = {
  franchiseId: 'teste_migracao',
  userId: '0TjY2WIWoqTtadgU6MbvYE0FRYH3',
  email: 'fagner.alexandro@hotmail.com',
  displayName: 'Fagner Alexandro',
  role: 'owner',
  storeAccess: ['*'],
};

async function main() {
  console.log('🚀 Iniciando criação de membership...');

  // Tenta encontrar service account
  const possiblePaths = [
    './serviceAccountKey.json',
    './firebase-admin-key.json',
    './admin-key.json',
  ];

  let serviceAccountPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serviceAccountPath = p;
      break;
    }
  }

  if (!serviceAccountPath) {
    console.log('⚠️ Service Account não encontrado.');
    console.log('');
    console.log('📋 ALTERNATIVA: Execute o script abaixo no console do navegador (após fazer login no Admin):');
    console.log('');
    console.log('------- COPIE E COLE NO CONSOLE -------');
    console.log(`
(async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = getFirestore();
  
  await setDoc(doc(db, 'franchises/${CONFIG.franchiseId}/members/${CONFIG.userId}'), {
    userId: '${CONFIG.userId}',
    email: '${CONFIG.email}',
    displayName: '${CONFIG.displayName}',
    role: '${CONFIG.role}',
    storeAccess: ${JSON.stringify(CONFIG.storeAccess)},
    invitedBy: '${CONFIG.userId}',
    invitedAt: serverTimestamp(),
    joinedAt: serverTimestamp(),
    isActive: true,
  });
  
  console.log('✅ Membership criado! Atualize o Kiosk.');
})();
`);
    console.log('------- FIM DO SCRIPT -------');
    return;
  }

  // Inicializa Firebase Admin
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();

  const memberRef = db.doc(`franchises/${CONFIG.franchiseId}/members/${CONFIG.userId}`);

  await memberRef.set({
    userId: CONFIG.userId,
    email: CONFIG.email,
    displayName: CONFIG.displayName,
    role: CONFIG.role,
    storeAccess: CONFIG.storeAccess,
    invitedBy: CONFIG.userId,
    invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    isActive: true,
  });

  console.log('✅ Membership criado com sucesso!');
  console.log(`   Path: ${memberRef.path}`);
}

main().catch(console.error);
