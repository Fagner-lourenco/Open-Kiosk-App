#!/usr/bin/env node

/**
 * ============================================================================
 * Firestore Audit v2 — Procura referências específicas do código
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Collections CONHECIDAS (do Firebase Console)
const COLLECTIONS = [
  'franchises',
  'users',
  'invitations',
  'superadmins',
  'payments',
  'sessions',
  'tv-config',
  'stores',
  'taps',
  'members',
  'products',
  'kegs',
  'events',
];

function grepCollection(collName) {
  const patterns = [
    // Firestore SDK patterns
    `collection(['"]${collName}['"])`,
    `collection(\`${collName}\`)`,
    // doc() patterns
    `doc(['"]${collName}['"]`,
    // String references
    `'${collName}'`,
    `"${collName}"`,
  ];

  const searchPaths = [
    'functions/src',
    'admin/src',
    'src',
    'shared',
  ];

  let totalRefs = 0;
  const files = new Set();

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      // Windows grep often problematic, use Node.js for searching
      const filesInPath = getAllFiles(searchPath);
      
      for (const file of filesInPath) {
        // Skip node_modules and dist
        if (file.includes('node_modules') || file.includes('dist') || file.includes('.next')) {
          continue;
        }

        try {
          const content = fs.readFileSync(file, 'utf8');
          
          // Check if ANY pattern matches
          const matches = patterns.filter(p => {
            // Simple string match for now
            const simplePattern = p.replace(/['"`]/g, '').replace(/\(/g, '').replace(/\)/g, '');
            return content.includes(simplePattern);
          });

          if (matches.length > 0) {
            files.add(file);
            totalRefs++;
          }
        } catch {
          // Skip encoding errors
        }
      }
    } catch {
      // Skip if path doesn't exist
    }
  }

  return {
    name: collName,
    found: totalRefs > 0,
    fileCount: files.size,
    files: Array.from(files).slice(0, 5),
  };
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    try {
      if (fs.statSync(filePath).isDirectory()) {
        if (!file.includes('node_modules') && !file.includes('dist') && !file.startsWith('.')) {
          arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
        }
      } else {
        if (file.match(/\.(tsx?|jsx?)$/)) {
          arrayOfFiles.push(filePath);
        }
      }
    } catch {
      // Skip unreadable files
    }
  });

  return arrayOfFiles;
}

console.log('\n' + '='.repeat(80));
console.log('🔍 FIRESTORE COLLECTIONS AUDIT v2');
console.log('='.repeat(80) + '\n');

console.log('Procurando referências de collections no código...\n');

const results = {};
let used = 0;
let unused = 0;

for (const collName of COLLECTIONS) {
  process.stdout.write(`  Verificando ${collName.padEnd(20)} ... `);
  const result = grepCollection(collName);
  results[collName] = result;

  if (result.found) {
    console.log(`✅ ENCONTRADO em ${result.fileCount} arquivo(s)`);
    used++;
  } else {
    console.log('⚠️  NÃO ENCONTRADO');
    unused++;
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 RESUMO');
console.log('='.repeat(80) + `
✅ Collections em uso: ${used}
⚠️  Collections não referenciadas: ${unused}

`);

console.log('\n📋 COLLECTIONS SEM REFERÊNCIAS NO CÓDIGO:\n');
for (const [name, result] of Object.entries(results)) {
  if (!result.found) {
    console.log(`  ⚠️  ${name}`);
    if (result.files.length > 0) {
      result.files.forEach(f => {
        console.log(`     └─ ${f}`);
      });
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('✅ COLLECTIONS EM USO:\n');
for (const [name, result] of Object.entries(results)) {
  if (result.found) {
    console.log(`  ✅ ${name} (${result.fileCount} arquivo(s))`);
    if (result.files.length > 0) {
      result.files.slice(0, 2).forEach(f => {
        console.log(`     └─ ${f}`);
      });
    }
  }
}

// Salvar relatório
const reportPath = path.join(__dirname, '../FIRESTORE_USAGE_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

console.log('\n' + '='.repeat(80));
console.log(`✅ Relatório salvo em: FIRESTORE_USAGE_REPORT.json\n`);
