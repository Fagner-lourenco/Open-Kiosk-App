#!/usr/bin/env node

/**
 * ============================================================================
 * Audit Firestore Data Usage — Relatório Completo
 * ============================================================================
 * 
 * Queries Firestore production para descobrir:
 * - Quais collections existem
 * - Quantidade de dados por collection
 * - Subcollections aninhadas
 * - Documentos com nomes suspeitos (teste, temp, old, etc)
 * 
 * Uso: npm run audit:firestore
 * (executa com autenticação do .firebaserc)
 */

import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Inicializa com o projeto padrão do .firebaserc
const projectId = process.env.GCP_PROJECT || 'open-kiosk-22b2b';

console.log(`\n${'='.repeat(80)}`);
console.log(`🔍 AUDITORIA FIRESTORE — ${projectId}`);
console.log('='.repeat(80));
console.log(`Data: ${new Date().toISOString().split('T')[0]}\n`);

// Se já estiver inicializado, usa a instância existente
const db = admin.firestore();

const COLLECTION_METADATA = {
  franchises: 'Root collection de franquias (CRÍTICA)',
  users: 'Usuários do sistema (CRÍTICA)',
  invitations: 'Convites pendentes (CRÍTICA)',
  superadmins: 'Registro de super admins (CRÍTICA)',
  payments: 'Histórico de pagamentos (CRÍTICA)',
  sessions: 'Sessões de usuários (pode ser limpável)',
  'tv-config': 'Configurações de TV (CRÍTICA)',
  'test_*': 'Coleções de teste (PODE DELETAR)',
  'temp_*': 'Dados temporários (PODE DELETAR)',
  'old_*': 'Dados antigos (analisar antes)',
  '_*': 'Coleções internas (revisar)',
};

async function analyzeCollection(collPath) {
  try {
    const snap = await db.collection(collPath).limit(1000).get();
    
    if (snap.empty) {
      return { docCount: 0, isEmpty: true, samples: [] };
    }

    const samples = [];
    const suspiciousNames = [];
    
    snap.docs.slice(0, 10).forEach(doc => {
      samples.push({
        id: doc.id,
        keys: Object.keys(doc.data()).slice(0, 5),
        isSuspicious: /^(test_|temp_|old_|_)/.test(doc.id),
      });
      
      if (/^(test_|temp_|old_|_)/.test(doc.id)) {
        suspiciousNames.push(doc.id);
      }
    });

    return {
      docCount: snap.size,
      samples,
      suspiciousNames,
      hasHiddenDocs: snap.size > 10,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function listSubcollections(docRef) {
  try {
    const cols = await docRef.listCollections();
    const result = {};
    
    for (const col of cols) {
      const snap = await col.limit(1).get();
      result[col.id] = { docCount: snap.size };
    }
    
    return result;
  } catch {
    return {};
  }
}

async function audit() {
  const report = {
    timestamp: new Date().toISOString(),
    projectId,
    collections: {},
    orphanedDocs: [],
    suspiciousCollections: [],
    totalDocuments: 0,
  };

  // 1. Listar root collections
  console.log('📚 Escaneando Root Collections...\n');
  const rootCols = await db.listCollections();
  
  for (const col of rootCols) {
    const name = col.id;
    console.log(`  ⏳ ${name}...`);
    
    const analysis = await analyzeCollection(name);
    report.collections[name] = analysis;
    
    if (analysis.docCount > 0) {
      console.log(`     ✅ ${analysis.docCount} documentos`);
      
      if (analysis.suspiciousNames?.length > 0) {
        console.log(`     ⚠️  Nomes suspeitos: ${analysis.suspiciousNames.slice(0, 3).join(', ')}${analysis.suspiciousNames.length > 3 ? '...' : ''}`);
        report.suspiciousCollections.push({
          collection: name,
          count: analysis.suspiciousNames.length,
          examples: analysis.suspiciousNames.slice(0, 5),
        });
      }
    } else {
      console.log(`     ⚠️  VAZIO (candidato a limpeza)`);
    }
  }

  report.totalDocuments = Object.values(report.collections).reduce((sum, c) => sum + (c.docCount || 0), 0);

  // 2. Salvar relatório completo
  const reportPath = path.join(__dirname, '../FIRESTORE_AUDIT_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO');
  console.log('='.repeat(80) + '\n');

  console.log(`Total de documentos: ${report.totalDocuments}`);
  console.log(`Collections suspeitas: ${report.suspiciousCollections.length}\n`);

  if (report.suspiciousCollections.length > 0) {
    console.log('⚠️  COLLECTIONS SUSPEITAS:');
    for (const item of report.suspiciousCollections) {
      console.log(`   • ${item.collection}: ${item.count} docs com nomes teste/temp/old`);
      console.log(`     Exemplos: ${item.examples.slice(0, 3).join(', ')}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 PRÓXIMOS PASSOS');
  console.log('='.repeat(80) + '\n');

  console.log('1️⃣  Abra o relatório JSON:');
  console.log(`   cat ${reportPath}\n`);

  console.log('2️⃣  Para cada collection suspeita, procure no código:');
  console.log('   grep -r "collection(\'NOME\')" functions/src admin/src\n');

  console.log('3️⃣  Documente os achados em um arquivo CLEANUP_CHECKLIST.md:');
  console.log('   - [ ] Collection X (Y docs) — USADO em _____');
  console.log('   - [ ] Collection Z (0 docs) — NÃO USADO, PODE DELETAR\n');

  console.log('✅ Relatório salvo em:', reportPath, '\n');
}

// Executa
audit().catch(err => {
  console.error('\n❌ Erro na auditoria:', err.message);
  process.exit(1);
});
