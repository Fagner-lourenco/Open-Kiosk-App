/**
 * ============================================================================
 * Script de Migração: Dados Legados → Estrutura de Franquias
 * ============================================================================
 * 
 * Este script migra dados de uma loja no formato legado:
 *   stores/{storeId}/...
 * 
 * Para o novo formato multi-franquia:
 *   franchises/{franchiseId}/stores/{storeId}/...
 * 
 * USO:
 *   npx ts-node scripts/migrate-to-franchise.ts
 * 
 * REQUERIMENTOS:
 *   - Node.js 18+
 *   - Variáveis de ambiente configuradas (ver .env.example)
 *   - firebase-admin instalado
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as admin from 'firebase-admin';
import * as readline from 'readline';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

interface MigrationConfig {
  /** ID da loja no formato legado */
  sourceStoreId: string;
  /** ID da franquia destino (criar nova se não existir) */
  targetFranchiseId: string;
  /** ID da loja no destino (geralmente igual ao source) */
  targetStoreId: string;
  /** Email do owner da franquia */
  ownerEmail: string;
  /** UID do owner (Firebase Auth) */
  ownerUid: string;
  /** Nome da franquia */
  franchiseName: string;
  /** Executar em modo dry-run (não altera dados) */
  dryRun: boolean;
}

// Coleções a migrar (subcollections de stores)
const COLLECTIONS_TO_MIGRATE = [
  'products',
  'sales',
  'dispensers',
  'categories',
];

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

// Inicializa Firebase Admin
// Requer GOOGLE_APPLICATION_CREDENTIALS ou serviceAccountKey.json
const initializeFirebase = () => {
  if (admin.apps.length === 0) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } catch {
      // Fallback: tenta usar serviceAccountKey.json local
      const serviceAccount = require('../serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }
  return admin.firestore();
};

// ============================================================================
// FUNÇÕES DE MIGRAÇÃO
// ============================================================================

/**
 * Cria a estrutura da franquia se não existir
 */
async function ensureFranchiseExists(
  db: admin.firestore.Firestore,
  config: MigrationConfig
): Promise<void> {
  const franchiseRef = db.collection('franchises').doc(config.targetFranchiseId);
  const franchiseDoc = await franchiseRef.get();

  if (!franchiseDoc.exists) {
    console.log(`📁 Criando franquia: ${config.targetFranchiseId}`);
    
    if (!config.dryRun) {
      await franchiseRef.set({
        name: config.franchiseName,
        ownerId: config.ownerUid,
        ownerEmail: config.ownerEmail,
        plan: 'starter',
        billingStatus: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Adiciona owner como membro
      await franchiseRef.collection('members').doc(config.ownerUid).set({
        email: config.ownerEmail,
        role: 'owner',
        storeAccess: ['*'],
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    console.log(`✅ Franquia criada com sucesso`);
  } else {
    console.log(`ℹ️  Franquia já existe: ${config.targetFranchiseId}`);
  }
}

/**
 * Migra uma coleção de stores/{storeId}/X para franchises/{franchiseId}/stores/{storeId}/X
 */
async function migrateCollection(
  db: admin.firestore.Firestore,
  config: MigrationConfig,
  collectionName: string
): Promise<number> {
  const sourcePath = `stores/${config.sourceStoreId}/${collectionName}`;
  const targetPath = `franchises/${config.targetFranchiseId}/stores/${config.targetStoreId}/${collectionName}`;

  console.log(`\n📦 Migrando: ${collectionName}`);
  console.log(`   Origem: ${sourcePath}`);
  console.log(`   Destino: ${targetPath}`);

  const sourceRef = db.collection(sourcePath);
  const snapshot = await sourceRef.get();

  if (snapshot.empty) {
    console.log(`   ⚪ Coleção vazia, pulando...`);
    return 0;
  }

  console.log(`   📊 ${snapshot.size} documentos encontrados`);

  let migratedCount = 0;
  const batch = db.batch();
  const batchLimit = 500; // Firestore batch limit

  for (const doc of snapshot.docs) {
    const targetRef = db.collection(targetPath).doc(doc.id);
    
    if (!config.dryRun) {
      batch.set(targetRef, {
        ...doc.data(),
        _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        _sourceStore: config.sourceStoreId,
      });
    }
    
    migratedCount++;

    // Commit batch a cada 500 docs
    if (migratedCount % batchLimit === 0) {
      if (!config.dryRun) {
        await batch.commit();
      }
      console.log(`   ⏳ Progresso: ${migratedCount}/${snapshot.size}`);
    }
  }

  // Commit final
  if (!config.dryRun && migratedCount % batchLimit !== 0) {
    await batch.commit();
  }

  console.log(`   ✅ ${migratedCount} documentos migrados`);
  return migratedCount;
}

/**
 * Migra o documento de settings da loja
 */
async function migrateStoreSettings(
  db: admin.firestore.Firestore,
  config: MigrationConfig
): Promise<void> {
  const sourcePath = `stores/${config.sourceStoreId}`;
  const targetPath = `franchises/${config.targetFranchiseId}/stores/${config.targetStoreId}`;

  console.log(`\n⚙️  Migrando settings da loja`);

  // Migra documento principal da loja
  const sourceDoc = await db.doc(sourcePath).get();
  
  if (sourceDoc.exists) {
    const data = sourceDoc.data() || {};
    
    if (!config.dryRun) {
      await db.doc(targetPath).set({
        ...data,
        franchiseId: config.targetFranchiseId,
        _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        _sourceStore: config.sourceStoreId,
      });
    }
    
    console.log(`   ✅ Documento da loja migrado`);
  }

  // Migra subcoleção settings/config
  const settingsDoc = await db.doc(`${sourcePath}/settings/config`).get();
  
  if (settingsDoc.exists) {
    if (!config.dryRun) {
      await db.doc(`${targetPath}/settings/config`).set({
        ...settingsDoc.data(),
        _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    console.log(`   ✅ Settings da loja migradas`);
  }
}

/**
 * Executa a migração completa
 */
async function runMigration(config: MigrationConfig): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MIGRAÇÃO: Dados Legados → Estrutura de Franquias');
  console.log('='.repeat(60));
  
  if (config.dryRun) {
    console.log('\n⚠️  MODO DRY-RUN: Nenhum dado será alterado\n');
  }

  console.log('\n📋 Configuração:');
  console.log(`   Store Origem: ${config.sourceStoreId}`);
  console.log(`   Franquia Destino: ${config.targetFranchiseId}`);
  console.log(`   Store Destino: ${config.targetStoreId}`);
  console.log(`   Owner: ${config.ownerEmail}`);
  console.log(`   Franquia Nome: ${config.franchiseName}`);

  const db = initializeFirebase();
  let totalMigrated = 0;

  try {
    // 1. Cria/verifica franquia
    await ensureFranchiseExists(db, config);

    // 2. Migra settings da loja
    await migrateStoreSettings(db, config);

    // 3. Migra cada coleção
    for (const collection of COLLECTIONS_TO_MIGRATE) {
      const count = await migrateCollection(db, config, collection);
      totalMigrated += count;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRAÇÃO CONCLUÍDA');
    console.log('='.repeat(60));
    console.log(`\n📊 Total de documentos migrados: ${totalMigrated}`);
    
    if (config.dryRun) {
      console.log('\n💡 Execute novamente sem --dry-run para aplicar as mudanças');
    } else {
      console.log('\n📍 Próximos passos:');
      console.log('   1. Verifique os dados no Firebase Console');
      console.log('   2. Ative o modo franquia: VITE_FRANCHISE_MODE=true');
      console.log('   3. Faça login com o owner e selecione a loja');
    }

  } catch (error) {
    console.error('\n❌ ERRO NA MIGRAÇÃO:', error);
    throw error;
  }
}

// ============================================================================
// INTERFACE CLI
// ============================================================================

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n🔧 Assistente de Migração - Open Kiosk\n');

  // Coleta configurações interativamente
  const sourceStoreId = await prompt('ID da loja origem (legado): ');
  const franchiseName = await prompt('Nome da franquia: ');
  const ownerEmail = await prompt('Email do owner: ');
  const ownerUid = await prompt('UID do owner (Firebase Auth): ');
  const dryRunInput = await prompt('Executar em modo teste? (s/n): ');

  const config: MigrationConfig = {
    sourceStoreId,
    targetFranchiseId: `franchise_${sourceStoreId}`,
    targetStoreId: sourceStoreId,
    franchiseName,
    ownerEmail,
    ownerUid,
    dryRun: dryRunInput.toLowerCase() === 's',
  };

  console.log('\n⚠️  Confirme os dados acima.');
  const confirm = await prompt('Iniciar migração? (s/n): ');

  if (confirm.toLowerCase() !== 's') {
    console.log('\n❌ Migração cancelada pelo usuário');
    process.exit(0);
  }

  await runMigration(config);
}

// Executa se chamado diretamente
if (require.main === module) {
  main().catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

export { runMigration, MigrationConfig };
