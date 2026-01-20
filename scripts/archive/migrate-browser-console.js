/**
 * ============================================================================
 * Script de Migração para Console do Navegador
 * ============================================================================
 * 
 * Cole este script no console do navegador (F12 > Console) enquanto
 * o app operacional estiver rodando em http://localhost:8080
 * 
 * Este script migra dados de:
 *   stores/{storeId}/...
 * Para:
 *   franchises/{franchiseId}/stores/{storeId}/...
 */

(async function migrateLegacyToFranchise() {
  // =====================================================================
  // CONFIGURAÇÃO - ALTERE AQUI
  // =====================================================================
  
  const CONFIG = {
    // Loja origem (formato legado)
    sourceStoreId: 'loja001',
    
    // Franquia destino
    targetFranchiseId: 'teste_migracao',
    franchiseName: 'Teste Migração',
    
    // Owner da franquia
    ownerEmail: 'fagner.alexandro@hotmail.com',
    // UID do usuário no Firebase Auth
    ownerUid: '0TjY2WIWoqTtadgU6MbvYE0FRYH3',
    
    // Modo teste (não altera dados)
    dryRun: false, // EXECUTE DE VERDADE
  };

  // =====================================================================
  // CÓDIGO DE MIGRAÇÃO
  // =====================================================================
  
  console.log('\n🚀 MIGRAÇÃO: Dados Legados → Estrutura de Franquias\n');
  console.log('='.repeat(60));
  
  if (CONFIG.dryRun) {
    console.log('⚠️  MODO DRY-RUN: Nenhum dado será alterado');
    console.log('   Para executar de verdade, altere dryRun para false\n');
  }

  // Usa o Firebase já inicializado pelo app (exposto globalmente via window)
  // O app usa @firebase/firestore que expõe via módulos internos
  const firebase = await import('/node_modules/.vite/deps/firebase_firestore.js?v=be2a9280');
  const { collection, doc, getDocs, setDoc, getDoc, query, serverTimestamp } = firebase;
  
  // Obtém a instância do Firestore que já está em uso pelo app
  const db = firebase.getFirestore();

  // Tenta obter UID do owner
  let ownerUid = CONFIG.ownerUid;
  
  // UID já definido no CONFIG, não precisa buscar do auth
  
  if (!ownerUid) {
    console.error('❌ UID do owner não encontrado!');
    console.log('   Defina ownerUid manualmente no CONFIG');
    console.log('\n   Para obter o UID, vá em Firebase Console > Authentication > Users');
    return;
  }

  console.log('\n📋 Configuração:');
  console.log(`   Store Origem: ${CONFIG.sourceStoreId}`);
  console.log(`   Franquia Destino: ${CONFIG.targetFranchiseId}`);
  console.log(`   Owner: ${CONFIG.ownerEmail} (${ownerUid})`);
  console.log(`   Franquia Nome: ${CONFIG.franchiseName}`);

  // Coleções para migrar
  const collectionsToMigrate = ['products', 'sales', 'dispensers', 'categories'];
  let totalMigrated = 0;

  try {
    // 1. Verifica se a franquia já existe
    const franchiseRef = doc(db, 'franchises', CONFIG.targetFranchiseId);
    const franchiseDoc = await getDoc(franchiseRef);

    if (!franchiseDoc.exists()) {
      console.log(`\n📁 Criando franquia: ${CONFIG.targetFranchiseId}`);
      
      if (!CONFIG.dryRun) {
        await setDoc(franchiseRef, {
          name: CONFIG.franchiseName,
          ownerId: ownerUid,
          ownerEmail: CONFIG.ownerEmail,
          plan: 'starter',
          billingStatus: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Adiciona owner como membro
        const memberRef = doc(db, 'franchises', CONFIG.targetFranchiseId, 'members', ownerUid);
        await setDoc(memberRef, {
          email: CONFIG.ownerEmail,
          role: 'owner',
          storeAccess: ['*'],
          addedAt: serverTimestamp(),
        });
        
        console.log('   ✅ Franquia criada com sucesso');
      } else {
        console.log('   [DRY-RUN] Franquia seria criada');
      }
    } else {
      console.log(`\nℹ️  Franquia já existe: ${CONFIG.targetFranchiseId}`);
    }

    // 2. Migra documento principal da loja
    console.log('\n⚙️  Migrando documento da loja...');
    const sourceStoreDoc = await getDoc(doc(db, 'stores', CONFIG.sourceStoreId));
    
    if (sourceStoreDoc.exists()) {
      const targetStorePath = `franchises/${CONFIG.targetFranchiseId}/stores/${CONFIG.sourceStoreId}`;
      
      if (!CONFIG.dryRun) {
        await setDoc(doc(db, targetStorePath), {
          ...sourceStoreDoc.data(),
          franchiseId: CONFIG.targetFranchiseId,
          _migratedAt: serverTimestamp(),
          _sourceStore: CONFIG.sourceStoreId,
        });
      }
      console.log(`   ✅ Documento da loja migrado para ${targetStorePath}`);
    }

    // 3. Migra settings/config
    const sourceSettingsDoc = await getDoc(doc(db, 'stores', CONFIG.sourceStoreId, 'settings', 'config'));
    
    if (sourceSettingsDoc.exists()) {
      const targetSettingsPath = `franchises/${CONFIG.targetFranchiseId}/stores/${CONFIG.sourceStoreId}/settings/config`;
      
      if (!CONFIG.dryRun) {
        await setDoc(doc(db, targetSettingsPath), {
          ...sourceSettingsDoc.data(),
          _migratedAt: serverTimestamp(),
        });
      }
      console.log(`   ✅ Settings migradas`);
    }

    // 4. Migra cada coleção
    for (const collectionName of collectionsToMigrate) {
      const sourcePath = `stores/${CONFIG.sourceStoreId}/${collectionName}`;
      const targetPath = `franchises/${CONFIG.targetFranchiseId}/stores/${CONFIG.sourceStoreId}/${collectionName}`;

      console.log(`\n📦 Migrando: ${collectionName}`);
      console.log(`   Origem: ${sourcePath}`);
      console.log(`   Destino: ${targetPath}`);

      const sourceRef = collection(db, sourcePath);
      const snapshot = await getDocs(query(sourceRef));

      if (snapshot.empty) {
        console.log(`   ⚪ Coleção vazia, pulando...`);
        continue;
      }

      console.log(`   📊 ${snapshot.size} documentos encontrados`);

      let migratedCount = 0;
      for (const docSnap of snapshot.docs) {
        const targetRef = doc(db, targetPath, docSnap.id);
        
        if (!CONFIG.dryRun) {
          await setDoc(targetRef, {
            ...docSnap.data(),
            _migratedAt: serverTimestamp(),
            _sourceStore: CONFIG.sourceStoreId,
          });
        }
        
        migratedCount++;
      }

      console.log(`   ✅ ${migratedCount} documentos ${CONFIG.dryRun ? 'seriam migrados' : 'migrados'}`);
      totalMigrated += migratedCount;
    }

    // Resumo
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRAÇÃO CONCLUÍDA');
    console.log('='.repeat(60));
    console.log(`\n📊 Total de documentos ${CONFIG.dryRun ? 'a migrar' : 'migrados'}: ${totalMigrated}`);
    
    if (CONFIG.dryRun) {
      console.log('\n💡 Para executar a migração de verdade:');
      console.log('   1. Altere dryRun para false no CONFIG');
      console.log('   2. Execute o script novamente');
    } else {
      console.log('\n📍 Próximos passos:');
      console.log('   1. Verifique os dados no Firebase Console');
      console.log('   2. Faça login no app com: ' + CONFIG.ownerEmail);
      console.log('   3. Selecione a franquia/loja migrada');
    }

  } catch (error) {
    console.error('\n❌ ERRO NA MIGRAÇÃO:', error);
    throw error;
  }
})();
