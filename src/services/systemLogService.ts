/**
 * ============================================================================
 * System Log Service
 * ============================================================================
 * 
 * Persiste logs de sistema do kiosk no Firestore para monitoramento remoto
 * via Admin. Usa batching para não impactar performance.
 * 
 * Coleção: franchises/{fid}/stores/{sid}/systemLogs/{logId}
 * Retenção: últimos 5 dias (cleanup automático via TTL ou scheduled function)
 * 
 * Uso:
 *   import { systemLogService } from '@/services/systemLogService';
 *   systemLogService.info('esp32', 'Conexão estabelecida via USB');
 *   systemLogService.error('payment', 'Timeout no polling', { orderId: '...' });
 */

import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId } from './firebase';
import type { SystemLogLevel, SystemLogSource } from '../../shared/types';

interface LogEntry {
  level: SystemLogLevel;
  source: SystemLogSource;
  message: string;
  details?: Record<string, unknown>;
}

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 30_000; // 30 segundos
const RETENTION_DAYS = 5;

class SystemLogService {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private deviceId: string | null = null;

  /**
   * Iniciar o serviço (chamado uma vez no boot do app)
   */
  start(deviceId?: string): void {
    this.deviceId = deviceId || null;
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  /**
   * Parar o serviço e fazer flush final
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  // ─── Convenience Methods ───

  info(source: SystemLogSource, message: string, details?: Record<string, unknown>): void {
    this.log('info', source, message, details);
  }

  warn(source: SystemLogSource, message: string, details?: Record<string, unknown>): void {
    this.log('warn', source, message, details);
  }

  error(source: SystemLogSource, message: string, details?: Record<string, unknown>): void {
    this.log('error', source, message, details);
  }

  debug(source: SystemLogSource, message: string, details?: Record<string, unknown>): void {
    this.log('debug', source, message, details);
  }

  // ─── Core ───

  private log(level: SystemLogLevel, source: SystemLogSource, message: string, details?: Record<string, unknown>): void {
    this.buffer.push({ level, source, message, details });
    
    // Flush imediato se buffer cheio ou se é erro (não pode esperar)
    if (this.buffer.length >= BATCH_SIZE || level === 'error') {
      this.flush();
    }
  }

  /**
   * Envia todos os logs buffered para o Firestore
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const storeId = getCurrentStoreId();
    const franchiseId = getCurrentFranchiseId();
    if (!storeId || !franchiseId) return; // Não logado ainda

    // Pegar e limpar buffer atomicamente
    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const db = getFirebaseDb();
      const colRef = collection(db, `franchises/${franchiseId}/stores/${storeId}/systemLogs`);

      // Write em paralelo (cada doc é independente)
      const promises = entries.map(entry =>
        addDoc(colRef, {
          level: entry.level,
          source: entry.source,
          message: entry.message,
          details: entry.details || null,
          deviceId: this.deviceId,
          storeId,
          franchiseId,
          timestamp: serverTimestamp(),
        }).catch(err => {
          // Falha individual não deve derrubar os outros
          console.warn('[SystemLog] Failed to write log:', err);
        })
      );

      await Promise.all(promises);
    } catch (error) {
      // Não re-adicionar ao buffer para evitar loop infinito
      console.warn('[SystemLog] Flush failed:', error);
    }
  }

  /**
   * Limpar logs mais antigos que RETENTION_DAYS.
   * Chamado manualmente ou via scheduled function.
   */
  async cleanup(): Promise<number> {
    const storeId = getCurrentStoreId();
    const franchiseId = getCurrentFranchiseId();
    if (!storeId || !franchiseId) return 0;

    try {
      const db = getFirebaseDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

      const colRef = collection(db, `franchises/${franchiseId}/stores/${storeId}/systemLogs`);
      const q = query(colRef, where('timestamp', '<', Timestamp.fromDate(cutoff)));
      const snap = await getDocs(q);

      if (snap.empty) return 0;

      // Firestore limita a 500 operações por batch — dividir em chunks
      const BATCH_LIMIT = 500;
      let count = 0;
      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
        count += chunk.length;
      }

      console.log(`[SystemLog] Cleaned up ${count} old logs`);
      return count;
    } catch (error) {
      console.warn('[SystemLog] Cleanup failed:', error);
      return 0;
    }
  }
}

export const systemLogService = new SystemLogService();
