/**
 * Script de Diagnóstico - Analisa usuário e permissões no Firebase
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize with default credentials
const app = initializeApp({
  projectId: 'open-kiosk-22b2b'
});

const db = getFirestore();
const auth = getAuth();

const EMAIL = 'fagner.alexandro@hotmail.com';

async function analyzeUser() {
  console.log('========================================');
  console.log('ANÁLISE COMPLETA DO USUÁRIO');
  console.log('========================================');
  console.log('Email:', EMAIL);
  console.log('');
  
  try {
    // 1. Get user from Auth
    const userRecord = await auth.getUserByEmail(EMAIL);
    console.log('=== FIREBASE AUTH ===');
    console.log('UID:', userRecord.uid);
    console.log('Email Verified:', userRecord.emailVerified);
    console.log('Custom Claims:', JSON.stringify(userRecord.customClaims, null, 2));
    console.log('');
    
    const userId = userRecord.uid;
    
    // 2. Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    console.log('=== USERS COLLECTION ===');
    if (userDoc.exists) {
      console.log('User Data:', JSON.stringify(userDoc.data(), null, 2));
    } else {
      console.log('⚠️ PROBLEMA: Documento de usuário NÃO existe!');
    }
    console.log('');
    
    // 3. List all franchises where user is owner
    console.log('=== FRANCHISES (onde é owner) ===');
    const ownerFranchises = await db.collection('franchises').where('ownerId', '==', userId).get();
    if (ownerFranchises.empty) {
      console.log('Nenhuma franquia onde é owner');
    } else {
      for (const doc of ownerFranchises.docs) {
        console.log('  Franchise ID:', doc.id);
        console.log('  Name:', doc.data().name);
        console.log('  Slug:', doc.data().slug);
        console.log('  Plan:', doc.data().plan);
        console.log('  BillingStatus:', doc.data().billingStatus);
        console.log('');
        
        // Check members subcollection
        const membersSnap = await db.collection('franchises').doc(doc.id).collection('members').get();
        console.log('  Members da franquia:');
        membersSnap.docs.forEach(m => {
          console.log('    -', m.id, '| Role:', m.data().role, '| isActive:', m.data().isActive);
        });
        console.log('');
        
        // Check stores subcollection
        const storesSnap = await db.collection('franchises').doc(doc.id).collection('stores').get();
        console.log('  Stores da franquia:');
        if (storesSnap.empty) {
          console.log('    ⚠️ Nenhuma loja!');
        } else {
          storesSnap.docs.forEach(s => {
            console.log('    -', s.id, '| Name:', s.data().name, '| isActive:', s.data().isActive);
          });
        }
      }
    }
    console.log('');
    
    // 4. Check memberships via collectionGroup
    console.log('=== MEMBERSHIPS VIA COLLECTION GROUP ===');
    console.log('Query: collectionGroup("members").where("userId", "==", uid)');
    const memberships = await db.collectionGroup('members').where('userId', '==', userId).get();
    if (memberships.empty) {
      console.log('⚠️ PROBLEMA: Nenhum membership encontrado com userId!');
      
      // Try without userId filter
      console.log('');
      console.log('Tentando buscar membership diretamente pelo doc ID...');
      const allFranchises = await db.collection('franchises').get();
      for (const franchise of allFranchises.docs) {
        const memberDoc = await db.collection('franchises').doc(franchise.id).collection('members').doc(userId).get();
        if (memberDoc.exists) {
          console.log('✓ Encontrado em:', franchise.id);
          console.log('  Data:', JSON.stringify(memberDoc.data(), null, 2));
        }
      }
    } else {
      memberships.docs.forEach(doc => {
        console.log('  Path:', doc.ref.path);
        console.log('  Data:', JSON.stringify(doc.data(), null, 2));
      });
    }
    console.log('');
    
    // 5. Check if membership document has correct structure
    console.log('=== VERIFICAÇÃO DE ESTRUTURA DO MEMBERSHIP ===');
    for (const franchise of ownerFranchises.docs) {
      const memberDoc = await db.collection('franchises').doc(franchise.id).collection('members').doc(userId).get();
      if (memberDoc.exists) {
        const data = memberDoc.data();
        console.log('Franchise:', franchise.id);
        console.log('  - userId field:', data.userId ? `✓ ${data.userId}` : '⚠️ MISSING!');
        console.log('  - role:', data.role || '⚠️ MISSING');
        console.log('  - isActive:', data.isActive !== undefined ? data.isActive : '⚠️ MISSING');
        console.log('  - storeAccess:', JSON.stringify(data.storeAccess) || '⚠️ MISSING');
      } else {
        console.log('⚠️ Membership doc não existe para', franchise.id);
      }
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
    console.error(error.stack);
  }
}

analyzeUser().then(() => process.exit(0));
