// Script para criar membership usando Firebase Client SDK
// Execute: node scripts/create-membership.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Configuração do Firebase (mesma do .env)
const firebaseConfig = {
  apiKey: "AIzaSyAz89M0V2eLoPKP5q4_vNS64TkXg-Lv7vU",
  authDomain: "open-kiosk-22b2b.firebaseapp.com",
  projectId: "open-kiosk-22b2b",
  storageBucket: "open-kiosk-22b2b.firebasestorage.app",
  messagingSenderId: "339891508498",
  appId: "1:339891508498:web:d66f2a5cb1dfdffe0e5b65"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Dados do membership
const franchiseId = 'teste_migracao';
const userId = '0TjY2WIWoqTtadgU6MbvYE0FRYH3';

console.log('🚀 Criando membership...');
console.log(`   Franquia: ${franchiseId}`);
console.log(`   Usuário: ${userId}`);

try {
  await setDoc(doc(db, `franchises/${franchiseId}/members/${userId}`), {
    userId,
    email: 'fagner.alexandro@hotmail.com',
    displayName: 'Fagner Alexandro',
    role: 'owner',
    storeAccess: ['*'],
    invitedBy: userId,
    invitedAt: serverTimestamp(),
    joinedAt: serverTimestamp(),
    isActive: true,
  });

  console.log('');
  console.log('✅ Membership criado com sucesso!');
  console.log(`   Path: franchises/${franchiseId}/members/${userId}`);
  console.log('');
  console.log('🔄 Agora teste o Kiosk em http://localhost:8080');
  
  process.exit(0);
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
