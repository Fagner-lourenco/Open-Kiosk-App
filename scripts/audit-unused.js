#!/usr/bin/env node

/**
 * ============================================================================
 * Discover Unused Collections — Análise estática vs banco de dados
 * ============================================================================
 * 
 * Compara o que existe no Firestore com o que é referenciado no código.
 * Gera lista de coleções potencialmente órfãs.
 * 
 * Uso: npm run audit:unused
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const reportPath = path.join(__dirname, '../FIRESTORE_AUDIT_REPORT.json');

if (!fs.existsSync(reportPath)) {
  console.error('❌ FIRESTORE_AUDIT_REPORT.json não encontrado');
  console.error('   Execute antes: npm run audit:firestore\n');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const collections = Object.keys(report.collections || {});

console.log('\n' + '='.repeat(80));
console.log('🔎 ANÁLISE DE COLEÇÕES NÃO UTILIZADAS');
console.log('='.repeat(80) + '\n');

const codeBasePaths = [
  'functions/src',
  'admin/src',
  'src',
  'shared',
];

const analysis = {
  timestamp: new Date().toISOString(),
  collections: [],
};

console.log('📝 Procurando referências no código...\n');

for (const collName of collections) {
  const references = [];
  let matchCount = 0;

  // Patterns de busca
  const patterns = [
    `collection('${collName}')`,
    `collection(\\"${collName}\\")`,
    `'${collName}'`,
    `\`${collName}\``,
  ];

  for (const basePath of codeBasePaths) {
    if (!fs.existsSync(basePath)) continue;

    for (const pattern of patterns) {
      try {
        const cmd = `grep -r "${pattern}" ${basePath} 2>/dev/null | grep -v node_modules | grep -v ".json"`;
        const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
        if (result) {
          matchCount += (result.match(/\n/g) || []).length;
          const lines = result.split('\n').slice(0, 3); // primeiras 3 linhas
          references.push(...lines.filter(l => l.length > 0));
        }
      } catch {
        // grep sem matches é normal
      }
    }
  }

  const collStats = report.collections[collName];
  const isUsed = matchCount > 0;
  const isEmpty = collStats?.docCount === 0;
  const isSuspicious = /^(test_|temp_|old_|_)/.test(collName);

  analysis.collections.push({
    name: collName,
    docCount: collStats?.docCount || 0,
    isUsed,
    references: references.length > 0 ? references.slice(0, 2) : [],
    isEmpty,
    isSuspicious,
    riskLevel: isEmpty ? 'HIGH' : isSuspicious ? 'MEDIUM' : 'LOW',
  });

  const icon = isUsed ? '✅' : isEmpty ? '🗑️' : isSuspicious ? '⚠️' : '✓';
  console.log(`${icon} ${collName.padEnd(30)} | ${(collStats?.docCount || 0).toString().padStart(6)} docs | ${isUsed ? 'USED' : 'NOT FOUND'}`);
}

// Salvar análise
const analysisPath = path.join(__dirname, '../FIRESTORE_USAGE_ANALYSIS.json');
fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

// Gerar CLEANUP_CHECKLIST
const unsafeCollections = analysis.collections.filter(c => !c.isUsed);
const riskHighCollections = analysis.collections.filter(c => c.isEmpty);

const checklist = `# Firestore Cleanup Checklist

Gerado em: ${new Date().toISOString()}

## 🔴 ALTA PRIORIDADE — Collections vazias (pode deletar com segurança)

${riskHighCollections.map(c => `- [ ] **${c.name}** (${c.docCount} docs)\n  - Status: VAZIA\n  - Referências no código: ${c.isUsed ? 'SIM' : 'NÃO'}\n  - Ação: DELETE SE CONFIRMAR NÃO USAR\n`).join('\n')}

## 🟡 MÉDIA PRIORIDADE — Collections não referenciadas no código

${unsafeCollections.filter(c => !c.isEmpty).map(c => `- [ ] **${c.name}** (${c.docCount} docs)\n  - Status: ÓRFÃ (${c.riskLevel})\n  - Referências no código: ${c.isUsed ? 'SIM' : 'NÃO'}\n  - Ação: INVESTIGAR ANTES DE DELETAR\n`).join('\n')}

## 🟢 BAIXA PRIORIDADE — Collections em uso

${analysis.collections.filter(c => c.isUsed).map(c => `- [x] **${c.name}** (${c.docCount} docs)\n  - Status: UTILIZADO\n  - Ação: MANTER\n`).join('\n')}

## 📋 Instruções

1. Revise cada item acima
2. Para collections suspeitas, execute:
   \`\`\`bash
   grep -r "collection('NOME')" functions/src admin/src src shared
   \`\`\`
3. Se não encontrar referências → pode ser candidato a limpeza
4. **NUNCA DELETE SEM CONFIRMAR** — consulte a equipe
5. Para deletar via Firebase CLI:
   \`\`\`bash
   firebase firestore:delete --recursive --shallow COLLECTION_NAME
   \`\`\`

## 📊 Estatísticas

- Total de collections: ${analysis.collections.length}
- Collections utilizadas: ${analysis.collections.filter(c => c.isUsed).length}
- Collections órfãs: ${unsafeCollections.length}
- Collections vazias: ${riskHighCollections.length}
`;

const checklistPath = path.join(__dirname, '../FIRESTORE_CLEANUP_CHECKLIST.md');
fs.writeFileSync(checklistPath, checklist);

console.log('\n' + '='.repeat(80));
console.log('📊 RESUMO');
console.log('='.repeat(80));
console.log(`
Total de collections: ${analysis.collections.length}
✅ Utilizadas: ${analysis.collections.filter(c => c.isUsed).length}
🔴 Órfãs (não usadas): ${unsafeCollections.length}
🗑️  Vazias: ${riskHighCollections.length}
⚠️  Suspeitas (teste/temp): ${analysis.collections.filter(c => c.isSuspicious).length}
`);

console.log('='.repeat(80));
console.log('✅ Análises geradas:');
console.log(`   • ${analysisPath}`);
console.log(`   • ${checklistPath}`);
console.log('\n⚠️  IMPORTANTE: Revise FIRESTORE_CLEANUP_CHECKLIST.md antes de deletar nada!\n');
