// Script para simular exatamente o que o Kiosk faz
// Execute: node scripts/simulate-kiosk-flow.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';

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
const franchiseId = 'teste_migracao';

console.log('🔍 Simulando fluxo do Kiosk...\n');

// 1. getUserFranchises - busca franquias onde é owner
console.log('1️⃣ getUserFranchises (owner query)...');
const ownerQuery = query(
  collection(db, 'franchises'),
  where('ownerId', '==', userId)
);
const ownerSnap = await getDocs(ownerQuery);
console.log(`   Owner de ${ownerSnap.size} franquias`);

// 2. getUserFranchises - busca memberships
console.log('\n2️⃣ getUserFranchises (collectionGroup query)...');
try {
  const membersQuery = query(
    collectionGroup(db, 'members'),
    where('userId', '==', userId),
    where('isActive', '==', true)
  );
  const membersSnap = await getDocs(membersQuery);
  console.log(`   Member de ${membersSnap.size} franquias`);
} catch (e) {
  console.log(`   ❌ Erro: ${e.message}`);
}

// 3. Simula seleção de loja - chama getMembership
console.log('\n3️⃣ getMembership (loadFranchise)...');
// Path que o Kiosk usa: franchisesPath() + '/' + franchiseId + '/members'
// franchisesPath() = isFranchiseMode() ? globalCollectionPath('franchises') : 'franchises'
// globalCollectionPath('franchises') = 'franchises'
// Então: franchises/teste_migracao/members/userId

const memberPath = `franchises/${franchiseId}/members/${userId}`;
console.log(`   Path: ${memberPath}`);

const memberRef = doc(db, memberPath);
const memberSnap = await getDoc(memberRef);

if (memberSnap.exists()) {
  const data = memberSnap.data();
  console.log('   ✅ Membership encontrado!');
  console.log(`   isActive: ${data.isActive}`);
  console.log(`   role: ${data.role}`);
  
  // Simula a verificação do Kiosk
  if (!data.isActive) {
    console.log('   ⚠️ Kiosk rejeitaria: isActive é false');
  } else {
    console.log('   ✅ Kiosk deveria aceitar!');
  }
} else {
  console.log('   ❌ Membership NÃO encontrado');
  console.log('   ⚠️ Kiosk rejeitaria: membership é null');
}

// 4. Verificar getFranchise
console.log('\n4️⃣ getFranchise...');
const franchiseRef = doc(db, 'franchises', franchiseId);
const franchiseSnap = await getDoc(franchiseRef);
if (franchiseSnap.exists()) {
  console.log('   ✅ Franquia encontrada:', franchiseSnap.data().name);
} else {
  console.log('   ❌ Franquia NÃO encontrada');
}

console.log('\n✅ Simulação concluída!');
process.exit(0);
