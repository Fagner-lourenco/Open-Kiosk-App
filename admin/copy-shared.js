/**
 * Script para copiar a pasta shared do diretório raiz para dentro do admin
 * Executa automaticamente antes do build via prebuild hook
 */

import { cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = resolve(__dirname, '../shared');
const targetDir = resolve(__dirname, 'shared');

try {
  if (!existsSync(sourceDir)) {
    console.error('❌ Erro: Diretório shared não encontrado em:', sourceDir);
    process.exit(1);
  }

  console.log('📦 Copiando shared/ para admin/shared/...');
  cpSync(sourceDir, targetDir, { 
    recursive: true, 
    force: true 
  });
  console.log('✅ shared/ copiado com sucesso!');
} catch (error) {
  console.error('❌ Erro ao copiar shared/:', error.message);
  process.exit(1);
}
