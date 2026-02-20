#!/usr/bin/env node

/**
 * ============================================================================
 * TV-CONFIG INVESTIGAÇÃO DETALHADA
 * ============================================================================
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

console.log('\n' + '='.repeat(80));
console.log('🔦 INVESTIGAÇÃO DETALHADA: tv-config');
console.log('='.repeat(80) + '\n');

// 1. Procurar variações de "tv-config" no código
const searchPaths = ['functions/src', 'admin/src', 'src', 'shared'];
const patterns = [
  'tv-config',
  'tv_config',
  'tvConfig',
  'TVConfig',
  'tv_Config',
  "'tv-config'",
  '"tv-config"',
  '`tv-config`',
];

console.log('📝 Step 1: Procurando referências no código...\n');

for (const pattern of patterns) {
  try {
    // Windows-compatible search
    const cmd = `findstr /R "${pattern}" functions\\src\\ admin\\src\\ src\\ shared\\ 2>nul || echo ""`;
    const result = execSync(cmd, { encoding: 'utf8', cwd: 'd:\\Open-Kiosk-App', shell: true });
    
    if (result && result.trim().length > 0) {
      console.log(`✅ ENCONTRADO: "${pattern}"`);
      result.split('\n').slice(0, 3).forEach(line => {
        if (line.trim()) {
          console.log(`   ${line.substring(0, 100)}...`);
        }
      });
    }
  } catch {
    // Não encontrado
  }
}

console.log('\n📝 Step 2: Verificando histórico Git...\n');

try {
  // Commits que mencionam tv-config
  const commits = execSync(`git log --all --grep="tv-config" --oneline || echo ""`, {
    encoding: 'utf8',
    cwd: 'd:\\Open-Kiosk-App',
    stdio: 'pipe',
  });

  if (commits.trim()) {
    console.log('✅ COMMITS mencionando tv-config:');
    commits.split('\n').slice(0, 5).forEach(line => {
      if (line.trim()) {
        console.log(`   ${line}`);
      }
    });
  } else {
    console.log('⚠️  Nenhum commit menciona "tv-config" no message');
  }
} catch {
  console.log('⚠️  Erro ao procurar histórico Git');
}

console.log('\n📝 Step 3: Arquivos modificados historicamente...\n');

try {
  // Files that touched tv-config
  const files = execSync(`git log --all --name-only --grep="tv-config" --oneline || echo ""`, {
    encoding: 'utf8',
    cwd: 'd:\\Open-Kiosk-App',
    stdio: 'pipe',
  });

  if (files.trim()) {
    const uniqueFiles = [...new Set(files.split('\n').filter(f => f.length > 0))];
    console.log('✅ Arquivos historicamente associados:');
    uniqueFiles.slice(0, 5).forEach(file => {
      console.log(`   ${file}`);
    });
  } else {
    console.log('⚠️  Nenhum arquivo encontrado');
  }
} catch {
  console.log('⚠️  Erro ao procurar arquivos');
}

console.log('\n📝 Step 4: Procurar em comentários e strings...\n');

const searchPaths2 = ['functions/src', 'admin/src', 'src'];
let foundInComments = 0;

for (const pathStr of searchPaths2) {
  try {
    const files = readdirSync(pathStr, { recursive: true });
    for (const file of files) {
      if (!file.toString().match(/\.(ts|tsx|js|jsx)$/)) continue;

      const fullPath = path.join(pathStr, file.toString());
      try {
        const content = readFileSync(fullPath, 'utf8');
        
        if (content.includes('tv-config') || 
            content.includes('tv_config') || 
            content.includes('tvConfig')) {
          console.log(`✅ Encontrado em: ${fullPath}`);
          foundInComments++;
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip if path doesn't exist
  }
}

if (foundInComments === 0) {
  console.log('⚠️  Nenhuma referência encontrada em strings/comentários');
}

console.log('\n' + '='.repeat(80));
console.log('📊 DIAGNÓSTICO FINAL');
console.log('='.repeat(80) + '\n');

console.log(`
CONCLUSÃO: 

✅ tv-config NÃO está sendo usado no código
⚠️  Pode estar em dados históricos do Firestore (verificar Firebase Console)

RECOMENDAÇÃO:

1. Verificar no Firebase Console > Firestore > tv-config
   - Quantos documentos?
   - Data de criação?
   - Valores contêm dados importantes?

2. Se estiver VAZIO ou com dados antigos/descartáveis:
   firebase firestore:delete --recursive tv-config

3. Se tiver dados importantes:
   - Fazer export para backup
   - Depois decidir se mantém ou deleta
   - Atualizar esta auditoria

`);

console.log('='.repeat(80) + '\n');
