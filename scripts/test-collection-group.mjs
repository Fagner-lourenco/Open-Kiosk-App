// Script para testar a query collectionGroup
// Execute: node scripts/test-collection-group.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, query, where, getDocs, collection } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAz89M0V2eLoPKP5q4_vNS64TkXg-Lv7vU",
  authDomain: "open-kiosk-22b2b.firebaseapp.com",
  projectId: "open-kiosk-22b2b",
  storageBucket: "open-kiosk-22b2b.firebasestorage.app",
  messagingSenderId: "339891508498",
  appId: "1:339891508498:web:d66f2a5cb1dfdffe0e5b65"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const userId = '0TjY2WIWoqTtadgU6MbvYE0FRYH3';

console.log('🔍 Testando collectionGroup query...\n');

// 1. Testar query de owner
console.log('1️⃣ Buscando franquias onde usuário é owner...');
try {
  const ownerQuery = query(
    collection(db, 'franchises'),
    where('ownerId', '==', userId)
  );
  const ownerSnap = await getDocs(ownerQuery);
  console.log(`   Encontradas: ${ownerSnap.size}`);
  ownerSnap.forEach(doc => {
    console.log(`   - ${doc.id}: ${doc.data().name}`);
  });
} catch (error) {
  console.error('   ❌ Erro:', error.message);
}

// 2. Testar collectionGroup
console.log('\n2️⃣ Buscando memberships via collectionGroup...');
try {
  const membersQuery = query(
    collectionGroup(db, 'members'),
    where('userId', '==', userId),
    where('isActive', '==', true)
  );
  const membersSnap = await getDocs(membersQuery);
  console.log(`   Encontradas: ${membersSnap.size}`);
  membersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`   - Path: ${doc.ref.path}`);
    console.log(`     role: ${data.role}, email: ${data.email}`);
  });
} catch (error) {
  console.error('   ❌ Erro na collectionGroup query:', error.message);
  console.log('   💡 Dica: Verifique se o índice está configurado no Firebase Console');
}

console.log('\n✅ Teste concluído!');
process.exit(0);
