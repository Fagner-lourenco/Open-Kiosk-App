#!/usr/bin/env node

/**
 * ============================================================================
 * Simple Firestore Audit — Análise estática de code references
 * ============================================================================
 * 
 * Sem dependências extras. Procura no código quais collections são usadas.
 * Combina com:
 * - FIRESTORE_AUDIT_REPORT.json (se existir, de auditoria anterior)
 * - Query manual via Firebase Console
 * 
 * Uso: node scripts/simple-audit.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Collections CONHECIDAS do Firestore (visíveis em Firebase Console)
const KNOWN_COLLECTIONS = {
  // Root collections
  franchises: { type: 'root', docs: 2, critical: true, desc: 'Empresas/franquias' },
  users: { type: 'root', docs: 5, critical: true, desc: 'Usuários do sistema' },
  invitations: { type: 'root', docs: 0, critical: true, desc: 'Convites pendentes' },
  superadmins: { type: 'root', docs: 1, critical: true, desc: 'Super administradores' },
  payments: { type: 'root', docs: 0, critical: true, desc: 'Histórico de pagamentos' },
  sessions: { type: 'root', docs: 0, critical: false, desc: 'Sessões de usuários' },
  'tv-config': { type: 'root', docs: 3, critical: true, desc: 'Config de TVs de atração' },
  
  // Subcollections (dentro de franchises > stores)
  stores: { type: 'subcol', parent: 'franchises', docs: null, critical: true, desc: 'Lojas por franchise' },
  payments: { type: 'subcol', parent: 'franchises.stores', docs: null, critical: true, desc: 'Pagamentos por loja' },
  taps: { type: 'subcol', parent: 'franchises.stores', docs: null, critical: true, desc: 'Torneiras por loja' },
  members: { type: 'subcol', parent: 'franchises', docs: null, critical: false, desc: 'Membros de franchise' },
};

console.log('\n' + '='.repeat(80));
console.log('🔍 FIRESTORE COLLECTIONS AUDIT');
console.log('='.repeat(80) + '\n');

console.log('📚 Collections Conhecidas:\n');
for (const [name, info] of Object.entries(KNOWN_COLLECTIONS)) {
  const icon = info.critical ? '🔴' : '🟡';
  console.log(`${icon} ${name.padEnd(30)} | ${info.desc}`);
}

// Procurar referências no código
const searchPaths = [
  'functions/src',
  'admin/src',
  'src',
  'shared',
];

console.log('\n' + '='.repeat(80));
console.log('🔎 PROCURANDO REFERÊNCIAS NO CÓDIGO');
console.log('='.repeat(80) + '\n');

const usageAnalysis = {};

for (const [collName, info] of Object.entries(KNOWN_COLLECTIONS)) {
  const references = new Set();

  // Padrões típicos de uso
  const patterns = [
    `collection\('${collName}'\)`,
    `collection\("${collName}"\)`,
    `\.collection\('${collName}'`,
    `\.collection\("${collName}"`,
  ];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    for (const pattern of patterns) {
      try {
        const cmd = process.platform === 'win32'
          ? `findstr /R "${pattern.replace(/\(/g, '\\(').replace(/\)/g, '\\)')}" ${searchPath}\\*.* 2>nul`
          : `grep -r "${pattern}" ${searchPath} 2>/dev/null`;
        
        const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
        if (result) {
          result.split('\n').forEach(line => {
            if (line.length > 0) references.add(line.split(':')[0] || line);
          });
        }
      } catch {
        // Sem matches é ok
      }
    }
  }

  usageAnalysis[collName] = {
    ...info,
    used: references.size > 0,
    fileCount: references.size,
    files: Array.from(references).slice(0, 3),
  };
}

// Gerar relatório
console.log('📊 ANÁLISE DE USO:\n');

const used = [];
const unused = [];
const critical = [];

for (const [name, analysis] of Object.entries(usageAnalysis)) {
  const icon = analysis.used ? '✅' : '⚠️';
  const critStr = analysis.critical ? '[CRÍTICO]' : '';
  
  console.log(`${icon} ${name.padEnd(30)} | ${analysis.fileCount} referências | ${critStr}`);
  
  if (analysis.critical) {
    critical.push(name);
  }
  if (analysis.used) {
    used.push(name);
  } else {
    unused.push({ name, ...analysis });
  }
}

console.log('\n' + '='.repeat(80));
console.log('📋 RESUMO');
console.log('='.repeat(80) + `\n
Total Collections: ${Object.keys(usageAnalysis).length}
✅ Com referências: ${used.length}
⚠️  Sem referências: ${unused.length}
🔴 Críticas (não deletar): ${critical.length}
`);

if (unused.length > 0) {
  console.log('\n⚠️  COLLECTIONS SEM REFERÊNCIAS NO CÓDIGO:\n');
  for (const item of unused) {
    const riskStr = item.docs === 0 ? '(VAZIA - SEGURO)' : `(${item.docs} docs - INVESTIGAR)`;
    console.log(`  • ${item.name.padEnd(30)} ${riskStr}`);
  }
}

// Salvar análise
const analysisPath = path.join(__dirname, '../FIRESTORE_USAGE_REPORT.json');
fs.writeFileSync(analysisPath, JSON.stringify(usageAnalysis, null, 2));

// Gerar checklist
const checklist = `# Firestore Cleanup Checklist — ${new Date().toISOString().split('T')[0]}

## 🔴 CRÍTICAS — NUNCA DELETAR

${critical.map(name => `- [x] **${name}** — Essencial para funcionamento`).join('\n')}

## 🗑️ CANDIDATOS A LIMPEZA

### Vazio e sem referência (100% seguro)
${unused.filter(c => c.docs === 0).map(c => `- [ ] ${c.name} (0 docs)\n  Descrição: ${c.desc}\n  Ação: Pode deletar com confiança\n`).join('\n')}

### Com dados mas sem referência (INVESTIGAR ANTES)
${unused.filter(c => c.docs > 0).map(c => `- [ ] ${c.name} (${c.docs} docs)\n  Descrição: ${c.desc}\n  Ação: Verificar se é histórico que precisa manter\n`).join('\n')}

## ✅ EM USO — MANTER

${used.map(name => {
  const info = usageAnalysis[name];
  return `- [x] ${name.padEnd(30)} — ${info.desc}`;
}).join('\n')}

## 📝 Próximos Passos

1. Revise os "Candidatos a Limpeza" acima
2. Para cada um, execute:
   \`\`\`bash
   # No VS Code ou terminal:
   grep -r "collection('NOME')" functions admin src shared
   \`\`\`
3. Se retornar vazio → confirmado que não é usado
4. Se for VAZIO (0 docs) e SEM USO → deletar com Firebase CLI:
   \`\`\`bash
   firebase firestore:delete --recursive --shallow COLLECTION_NAME
   \`\`\`

## 📊 Estatísticas

- Total: ${Object.keys(usageAnalysis).length} collections
- Críticas: ${critical.length} (não tocar)
- Em uso: ${used.length}
- Candidates to cleanup: ${unused.length}

---

**Gerado em**: ${new Date().toISOString()}
**Projeto**: Open Kiosk
**Banco**: open-kiosk-22b2b
`;

const checklistPath = path.join(__dirname, '../FIRESTORE_CLEANUP_CHECKLIST.md');
fs.writeFileSync(checklistPath, checklist);

console.log('\n' + '='.repeat(80));
console.log('✅ Relatórios gerados');
console.log('='.repeat(80));
console.log(`\n📄 ${analysisPath}`);
console.log(`📋 ${checklistPath}`);
console.log('\n💡 Próximo passo: Revise FIRESTORE_CLEANUP_CHECKLIST.md\n');
