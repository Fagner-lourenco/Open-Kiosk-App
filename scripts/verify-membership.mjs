// Script para verificar o membership no Firestore
// Execute: node scripts/verify-membership.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

// Configuração do Firebase
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

const franchiseId = 'teste_migracao';
const userId = '0TjY2WIWoqTtadgU6MbvYE0FRYH3';

console.log('🔍 Verificando dados no Firestore...\n');

// 1. Verificar franquia
console.log('1️⃣ Verificando franquia...');
const franchiseRef = doc(db, 'franchises', franchiseId);
const franchiseSnap = await getDoc(franchiseRef);
if (franchiseSnap.exists()) {
  const data = franchiseSnap.data();
  console.log(`   ✅ Franquia encontrada: ${data.name || franchiseId}`);
  console.log(`   ownerId: ${data.ownerId}`);
  console.log(`   members array: ${data.members?.length || 0} membros`);
  if (data.members) {
    data.members.forEach((m, i) => {
      console.log(`      [${i}] ${m.email} - ${m.role}`);
    });
  }
} else {
  console.log('   ❌ Franquia NÃO encontrada');
}

// 2. Verificar membership na subcollection
console.log('\n2️⃣ Verificando membership na subcollection...');
const memberRef = doc(db, `franchises/${franchiseId}/members/${userId}`);
const memberSnap = await getDoc(memberRef);
if (memberSnap.exists()) {
  const data = memberSnap.data();
  console.log('   ✅ Membership encontrado!');
  console.log('   Dados:');
  console.log(`      userId: ${data.userId}`);
  console.log(`      email: ${data.email}`);
  console.log(`      role: ${data.role}`);
  console.log(`      isActive: ${data.isActive}`);
  console.log(`      storeAccess: ${JSON.stringify(data.storeAccess)}`);
} else {
  console.log('   ❌ Membership NÃO encontrado na subcollection');
  console.log(`   Path verificado: franchises/${franchiseId}/members/${userId}`);
}

// 3. Listar todos os members na subcollection
console.log('\n3️⃣ Listando todos os membros na subcollection...');
const membersRef = collection(db, `franchises/${franchiseId}/members`);
const membersSnap = await getDocs(membersRef);
console.log(`   Total de documentos: ${membersSnap.size}`);
membersSnap.forEach((doc) => {
  const data = doc.data();
  console.log(`   - ${doc.id}: ${data.email} (${data.role}) isActive=${data.isActive}`);
});

// 4. Verificar lojas
console.log('\n4️⃣ Verificando lojas da franquia...');
const storesRef = collection(db, `franchises/${franchiseId}/stores`);
const storesSnap = await getDocs(storesRef);
console.log(`   Total de lojas: ${storesSnap.size}`);
storesSnap.forEach((doc) => {
  const data = doc.data();
  console.log(`   - ${doc.id}: ${data.name || 'sem nome'}`);
});

console.log('\n✅ Verificação concluída!');
process.exit(0);
