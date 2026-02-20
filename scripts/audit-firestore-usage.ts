/**
 * ============================================================================
 * Audit Firestore Usage — Descobrir dados não utilizados
 * ============================================================================
 * 
 * Lê TODOS os dados do Firestore production e gera relatório de:
 * 1. Collections e documentos que existem
 * 2. Quantidade de dados por collection
 * 3. Subcollections aninhadas
 * 4. Documentos órfãos ou suspeitos
 * 
 * Uso: npx ts-node scripts/audit-firestore-usage.ts
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ firebase-service-account.json não encontrado');
  console.error('   Copie de ~/.firebase/open-kiosk-22b2b-xxxxx.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

interface CollectionStats {
  name: string;
  docCount: number;
  sampleDocs: Array<{ id: string; data: any; subcollections: string[] }>;
  estimatedSize: string;
}

async function getCollectionStats(collRef: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>): Promise<CollectionStats> {
  const snapshot = await collRef.limit(100).get();
  const sampleDocs = [];

  for (const doc of snapshot.docs.slice(0, 5)) {
    const subcols = await doc.ref.listCollections();
    sampleDocs.push({
      id: doc.id,
      data: doc.data(),
      subcollections: subcols.map(c => c.id),
    });
  }

  // Estimate size (rough)
  const estSize = snapshot.docs.length > 100 ? `>${snapshot.docs.length * 100}` : `~${snapshot.docs.length}`;

  return {
    name: collRef.path,
    docCount: snapshot.size,
    sampleDocs,
    estimatedSize: estSize,
  };
}

async function auditFirestore() {
  console.log('🔍 Auditando Firestore...\n');

  const report: Record<string, CollectionStats> = {};

  // Root collections
  const rootCollections = await db.listCollections();
  console.log(`📚 Root Collections: ${rootCollections.length}\n`);

  for (const colRef of rootCollections) {
    console.log(`⏳ Scanning ${colRef.id}...`);
    try {
      const stats = await getCollectionStats(colRef);
      report[colRef.id] = stats;
      console.log(`   ✅ ${stats.docCount} documentos\n`);
    } catch (err) {
      console.log(`   ❌ Erro: ${(err as Error).message}\n`);
    }
  }

  // Generate report
  const reportPath = path.join(__dirname, '../FIRESTORE_AUDIT_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO RESUMIDO');
  console.log('='.repeat(80) + '\n');

  let totalDocs = 0;
  for (const [name, stats] of Object.entries(report)) {
    console.log(`${name.padEnd(30)} | ${stats.docCount.toString().padStart(6)} docs | Samples:`);
    for (const sample of stats.sampleDocs) {
      const subs = sample.subcollections.length > 0 ? ` [subcols: ${sample.subcollections.join(', ')}]` : '';
      const keyFields = Object.keys(sample.data).slice(0, 3).join(', ');
      console.log(`  • ${sample.id.substring(0, 20).padEnd(20)} {${keyFields}...}${subs}`);
    }
    totalDocs += stats.docCount;
    console.log();
  }

  console.log(`\n📈 TOTAL: ${totalDocs} documentos\n`);
  console.log(`✅ Relatório salvo em: ${reportPath}`);
  console.log('\n⚠️  PRÓXIMO PASSO:');
  console.log('   1. Revise FIRESTORE_AUDIT_REPORT.json');
  console.log('   2. Identifique collections suspeitas (ex: teste_*, old_*, temp_*)');
  console.log('   3. Procure no código por referências (grep em functions/src e admin/src)');
  console.log('   4. Documente achados em FIRESTORE_USAGE_ANALYSIS.md\n');
}

auditFirestore().catch(err => {
  console.error('❌ Erro na auditoria:', err);
  process.exit(1);
});
