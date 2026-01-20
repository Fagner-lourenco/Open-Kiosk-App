/**
 * ============================================================================
 * Script de Migração: Legacy → Franchise Mode
 * ============================================================================
 * 
 * Este script migra dados do formato legado (stores/{storeId}/...) para o
 * novo formato multi-tenant (franchises/{franchiseId}/stores/{storeId}/...).
 * 
 * Também renomeia coleção 'sales' para 'orders' para compatibilidade com Admin.
 * 
 * USO:
 *   npx ts-node scripts/migrate-to-franchise-mode.ts --franchiseId=<ID> --storeId=<ID> [--dryRun]
 * 
 * OPÇÕES:
 *   --franchiseId  ID da franquia destino (obrigatório)
 *   --storeId      ID da loja a migrar (obrigatório)
 *   --dryRun       Modo teste: apenas mostra o que seria feito, não altera dados
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as path from 'path';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

// Coleções a migrar
const COLLECTIONS_TO_MIGRATE = ['products', 'settings', 'dispensers', 'inventory_logs'];

// Mapeamento de nomes de coleções (legado → novo)
const COLLECTION_RENAMES: Record<string, string> = {
  'sales': 'orders',  // Admin usa 'orders'
};

// ============================================================================
// TIPOS
// ============================================================================

interface MigrationStats {
  collection: string;
  documentsRead: number;
  documentsWritten: number;
  errors: string[];
}

interface MigrationResult {
  success: boolean;
  stats: MigrationStats[];
  totalDocuments: number;
  totalErrors: number;
  dryRun: boolean;
}

// ============================================================================
// FUNÇÕES DE MIGRAÇÃO
// ============================================================================

async function migrateCollection(
  db: FirebaseFirestore.Firestore,
  sourcePath: string,
  destPath: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    collection: sourcePath,
    documentsRead: 0,
    documentsWritten: 0,
    errors: [],
  };

  try {
    console.log(`\n📂 Migrando: ${sourcePath} → ${destPath}`);
    
    const sourceRef = db.collection(sourcePath);
    const snapshot = await sourceRef.get();
    
    stats.documentsRead = snapshot.size;
    console.log(`   Encontrados: ${snapshot.size} documentos`);

    if (snapshot.empty) {
      console.log('   ⚠️ Coleção vazia, pulando...');
      return stats;
    }

    for (const docSnap of snapshot.docs) {
      const docId = docSnap.id;
      const data = docSnap.data();
      
      if (dryRun) {
        console.log(`   [DRY-RUN] Copiaria: ${docId}`);
        stats.documentsWritten++;
      } else {
        try {
          const destRef = db.collection(destPath).doc(docId);
          await destRef.set({
            ...data,
            _migratedAt: FieldValue.serverTimestamp(),
            _migratedFrom: sourcePath,
          });
          stats.documentsWritten++;
          console.log(`   ✓ Migrado: ${docId}`);
        } catch (err) {
          const errorMsg = `Erro ao migrar ${docId}: ${err}`;
          stats.errors.push(errorMsg);
          console.error(`   ✗ ${errorMsg}`);
        }
      }
    }

    console.log(`   📊 Resultado: ${stats.documentsWritten}/${stats.documentsRead} documentos migrados`);
    
  } catch (err) {
    const errorMsg = `Erro ao ler coleção ${sourcePath}: ${err}`;
    stats.errors.push(errorMsg);
    console.error(`   ✗ ${errorMsg}`);
  }

  return stats;
}

async function runMigration(
  franchiseId: string,
  storeId: string,
  dryRun: boolean
): Promise<MigrationResult> {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MIGRAÇÃO: Legacy → Franchise Mode');
  console.log('='.repeat(60));
  console.log(`\nFranquia:  ${franchiseId}`);
  console.log(`Loja:      ${storeId}`);
  console.log(`Modo:      ${dryRun ? '🔍 DRY-RUN (sem alterações)' : '⚡ EXECUÇÃO REAL'}`);
  console.log('\n' + '-'.repeat(60));

  // Inicializar Firebase Admin
  const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
  
  try {
    // Tentar carregar service account
    const serviceAccount = require(serviceAccountPath) as ServiceAccount;
    
    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (err) {
    console.error('❌ Erro ao carregar serviceAccountKey.json');
    console.error('   Certifique-se de que o arquivo existe em:', serviceAccountPath);
    console.error('   Baixe do Firebase Console > Project Settings > Service Accounts');
    process.exit(1);
  }

  const db = getFirestore();
  const allStats: MigrationStats[] = [];

  // Migrar coleções padrão
  for (const collName of COLLECTIONS_TO_MIGRATE) {
    const sourcePath = `stores/${storeId}/${collName}`;
    const destPath = `franchises/${franchiseId}/stores/${storeId}/${collName}`;
    
    const stats = await migrateCollection(db, sourcePath, destPath, dryRun);
    allStats.push(stats);
  }

  // Migrar coleções com rename (sales → orders)
  for (const [sourceCollName, destCollName] of Object.entries(COLLECTION_RENAMES)) {
    const sourcePath = `stores/${storeId}/${sourceCollName}`;
    const destPath = `franchises/${franchiseId}/stores/${storeId}/${destCollName}`;
    
    const stats = await migrateCollection(db, sourcePath, destPath, dryRun);
    allStats.push(stats);
  }

  // Também verificar coleções na raiz (formato muito antigo)
  console.log('\n' + '-'.repeat(60));
  console.log('📂 Verificando coleções raiz (formato antigo)...');
  
  for (const collName of ['products', 'sales']) {
    const sourcePath = collName;
    const destCollName = COLLECTION_RENAMES[collName] || collName;
    const destPath = `franchises/${franchiseId}/stores/${storeId}/${destCollName}`;
    
    const stats = await migrateCollection(db, sourcePath, destPath, dryRun);
    allStats.push(stats);
  }

  // Resumo final
  const totalDocs = allStats.reduce((sum, s) => sum + s.documentsWritten, 0);
  const totalErrors = allStats.reduce((sum, s) => sum + s.errors.length, 0);

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA MIGRAÇÃO');
  console.log('='.repeat(60));
  console.log(`\nTotal de documentos migrados: ${totalDocs}`);
  console.log(`Total de erros: ${totalErrors}`);
  
  if (dryRun) {
    console.log('\n⚠️ MODO DRY-RUN: Nenhuma alteração foi feita.');
    console.log('   Execute novamente sem --dryRun para aplicar as mudanças.');
  } else if (totalErrors === 0) {
    console.log('\n✅ Migração concluída com sucesso!');
  } else {
    console.log('\n⚠️ Migração concluída com erros. Verifique os logs acima.');
  }

  return {
    success: totalErrors === 0,
    stats: allStats,
    totalDocuments: totalDocs,
    totalErrors,
    dryRun,
  };
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

function parseArgs(): { franchiseId: string; storeId: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let franchiseId = '';
  let storeId = '';
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--franchiseId=')) {
      franchiseId = arg.split('=')[1];
    } else if (arg.startsWith('--storeId=')) {
      storeId = arg.split('=')[1];
    } else if (arg === '--dryRun') {
      dryRun = true;
    }
  }

  if (!franchiseId || !storeId) {
    console.error('❌ Uso: npx ts-node scripts/migrate-to-franchise-mode.ts --franchiseId=<ID> --storeId=<ID> [--dryRun]');
    console.error('\nExemplo:');
    console.error('  npx ts-node scripts/migrate-to-franchise-mode.ts --franchiseId=abc123 --storeId=loja001 --dryRun');
    process.exit(1);
  }

  return { franchiseId, storeId, dryRun };
}

// Executar se chamado diretamente
if (require.main === module) {
  const { franchiseId, storeId, dryRun } = parseArgs();
  
  runMigration(franchiseId, storeId, dryRun)
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('❌ Erro fatal:', err);
      process.exit(1);
    });
}

export { runMigration, MigrationResult };
