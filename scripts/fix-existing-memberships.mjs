// Script para migrar/atualizar memberships existentes
// Execute: node scripts/fix-existing-memberships.mjs

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';

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

console.log('🚀 Iniciando migração de memberships...\n');

let stats = {
  franchisesProcessed: 0,
  membershipsCreated: 0,
  membershipsUpdated: 0,
  errors: []
};

// 1. Busca todas as franquias
const franchisesRef = collection(db, 'franchises');
const franchisesSnap = await getDocs(franchisesRef);

console.log(`📁 Encontradas ${franchisesSnap.size} franquias\n`);

for (const franchiseDoc of franchisesSnap.docs) {
  const franchiseId = franchiseDoc.id;
  const franchiseData = franchiseDoc.data();
  
  console.log(`\n🏢 Processando: ${franchiseData.name || franchiseId}`);
  stats.franchisesProcessed++;

  // 2. Verifica se tem ownerId e cria membership se não existir
  if (franchiseData.ownerId) {
    const ownerMemberRef = doc(db, `franchises/${franchiseId}/members/${franchiseData.ownerId}`);
    const membersRef = collection(db, `franchises/${franchiseId}/members`);
    const membersSnap = await getDocs(membersRef);
    
    // Verifica se o owner já tem membership
    const ownerMembership = membersSnap.docs.find(d => d.id === franchiseData.ownerId);
    
    if (!ownerMembership) {
      console.log(`   📝 Criando membership para owner: ${franchiseData.ownerId}`);
      try {
        await setDoc(ownerMemberRef, {
          userId: franchiseData.ownerId,
          email: franchiseData.ownerEmail || '',
          displayName: 'Owner',
          role: 'owner',
          storeAccess: ['*'],
          invitedBy: franchiseData.ownerId,
          invitedAt: serverTimestamp(),
          joinedAt: serverTimestamp(),
          isActive: true,
        });
        stats.membershipsCreated++;
      } catch (error) {
        stats.errors.push(`Erro ao criar membership owner em ${franchiseId}: ${error.message}`);
      }
    } else {
      // Atualiza campos faltantes
      const data = ownerMembership.data();
      const updates = {};
      
      if (!data.userId) updates.userId = franchiseData.ownerId;
      if (!data.storeAccess) updates.storeAccess = ['*'];
      if (data.isActive === undefined) updates.isActive = true;
      if (!data.invitedBy) updates.invitedBy = franchiseData.ownerId;
      if (!data.invitedAt) updates.invitedAt = serverTimestamp();
      if (!data.joinedAt) updates.joinedAt = serverTimestamp();
      
      if (Object.keys(updates).length > 0) {
        console.log(`   🔧 Atualizando membership owner com campos faltantes`);
        try {
          await updateDoc(ownerMemberRef, updates);
          stats.membershipsUpdated++;
        } catch (error) {
          stats.errors.push(`Erro ao atualizar membership em ${franchiseId}: ${error.message}`);
        }
      }
    }
  }

  // 3. Migra membros do array para subcollection (se existirem)
  const membersArray = franchiseData.members || [];
  if (membersArray.length > 0) {
    console.log(`   📋 Migrando ${membersArray.length} membros do array`);
    
    for (const member of membersArray) {
      if (!member.id) continue;
      
      const memberRef = doc(db, `franchises/${franchiseId}/members/${member.id}`);
      
      try {
        // Verifica se já existe
        const existingMembersSnap = await getDocs(collection(db, `franchises/${franchiseId}/members`));
        const existingMember = existingMembersSnap.docs.find(d => d.id === member.id);
        
        if (!existingMember) {
          await setDoc(memberRef, {
            userId: member.id,
            email: member.email || '',
            displayName: member.displayName || '',
            role: member.role || 'viewer',
            storeAccess: member.storeAccess || ['*'],
            invitedBy: franchiseData.ownerId || 'system',
            invitedAt: member.addedAt ? new Date(member.addedAt) : serverTimestamp(),
            joinedAt: member.addedAt ? new Date(member.addedAt) : serverTimestamp(),
            isActive: true,
          });
          stats.membershipsCreated++;
          console.log(`      ✅ Migrado: ${member.email || member.id}`);
        }
      } catch (error) {
        stats.errors.push(`Erro ao migrar membro ${member.id} em ${franchiseId}: ${error.message}`);
      }
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 RESULTADO DA MIGRAÇÃO');
console.log('='.repeat(60));
console.log(`🏢 Franquias processadas: ${stats.franchisesProcessed}`);
console.log(`✅ Memberships criados: ${stats.membershipsCreated}`);
console.log(`🔧 Memberships atualizados: ${stats.membershipsUpdated}`);
console.log(`❌ Erros: ${stats.errors.length}`);

if (stats.errors.length > 0) {
  console.log('\n⚠️ Erros encontrados:');
  stats.errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
}

console.log('\n✨ Migração concluída!');
process.exit(0);
