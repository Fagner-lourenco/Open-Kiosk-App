/**
 * Script para copiar a pasta shared do diretório raiz para dentro do admin
 * Executa automaticamente antes do build via prebuild hook
 *
 * Usa cópia em diretório temporário + rename para evitar estado parcial
 * se o processo for interrompido durante a cópia.
 */

import { cpSync, existsSync, rmSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = resolve(__dirname, '../shared');
const targetDir = resolve(__dirname, 'shared');
const tmpDir = resolve(__dirname, `shared_tmp_${process.pid}`);
const oldDir = resolve(__dirname, `shared_old_${process.pid}`);

try {
  if (!existsSync(sourceDir)) {
    console.error('❌ Erro: Diretório shared não encontrado em:', sourceDir);
    process.exit(1);
  }

  // Limpar tmp residual de execução anterior interrompida
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  // 1. Copiar para diretório temporário
  console.log('📦 Copiando shared/ para admin/shared/...');
  cpSync(sourceDir, tmpDir, { 
    recursive: true, 
    force: true 
  });

  // 2. Swap: renomear antigo → old, tmp → shared
  if (existsSync(targetDir)) {
    renameSync(targetDir, oldDir);
  }
  renameSync(tmpDir, targetDir);

  // 3. Limpar antigo
  if (existsSync(oldDir)) {
    rmSync(oldDir, { recursive: true, force: true });
  }

  console.log('✅ shared/ copiado com sucesso!');
} catch (error) {
  // Tentar restaurar estado anterior em caso de falha
  if (!existsSync(targetDir) && existsSync(oldDir)) {
    try { renameSync(oldDir, targetDir); } catch { /* melhor esforço */ }
  }
  // Limpar temporários
  if (existsSync(tmpDir)) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* melhor esforço */ }
  }
  if (existsSync(oldDir)) {
    try { rmSync(oldDir, { recursive: true, force: true }); } catch { /* melhor esforço */ }
  }
  console.error('❌ Erro ao copiar shared/:', error.message);
  process.exit(1);
}
