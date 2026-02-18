/**
 * ============================================================================
 * Dispense Recovery Service
 * ============================================================================
 *
 * Persiste falhas de dispense localmente (IndexedDB) e reconcilia no startup.
 * Garante que pedidos pagos mas não dispensados sejam rastreados e compensados.
 *
 * Fluxo:
 *   1. Quando dispense falha (sendCommand false, exception, timeout, BLE disconnect):
 *      -> persistFailedDispense() salva no IndexedDB
 *   2. No startup do app:
 *      -> reconcileOnStartup() sincroniza com Firestore
 *   3. Admin dashboard mostra pedidos failed_dispense para compensação manual
 */

import { cacheSet, cacheGetAll, cacheDelete, STORES } from '@/services/cacheService';
import { salesService } from '@/services/salesService';
import { getCurrentStoreId } from '@/services/firebase';
import { systemLogService } from '@/services/systemLogService';

// ============================================================================
// TYPES
// ============================================================================

export interface FailedDispense {
  id: string;         // orderNumber (usado como key no IndexedDB)
  orderNumber: string;
  reason: string;     // 'command_failed' | 'exception' | 'timeout' | 'ble_disconnect' | 'esp32_reboot_during_dispense'
  timestamp: number;
  retryCount: number;
  storeId: string;
  // Partial dispense progress — used for resume from where it stopped
  mlDispensed?: number;   // ml already dispensed before failure
  targetMl?: number;      // original target ml per unit
  cup?: number;           // which cup was being filled (1-based)
  totalCups?: number;     // total cups in the order
  tapId?: number;         // which tap was dispensing
  sizeLabel?: string;     // size label for the drink
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Persiste um dispense falhado no IndexedDB para reconciliação posterior.
 * Inclui progresso parcial para permitir resume de onde parou.
 */
export async function persistFailedDispense(
  orderNumber: string,
  reason: string,
  partialProgress?: {
    mlDispensed?: number;
    targetMl?: number;
    cup?: number;
    totalCups?: number;
    tapId?: number;
    sizeLabel?: string;
  }
): Promise<void> {
  try {
    const entry: FailedDispense = {
      id: orderNumber,
      orderNumber,
      reason,
      timestamp: Date.now(),
      retryCount: 0,
      storeId: getCurrentStoreId() || '',
      // Partial progress for resume
      mlDispensed: partialProgress?.mlDispensed,
      targetMl: partialProgress?.targetMl,
      cup: partialProgress?.cup,
      totalCups: partialProgress?.totalCups,
      tapId: partialProgress?.tapId,
      sizeLabel: partialProgress?.sizeLabel,
    };
    await cacheSet(STORES.FAILED_DISPENSES, entry);
    console.log(`[DispenseRecovery] Persisted failed dispense: ${orderNumber} (reason: ${reason}, ml: ${partialProgress?.mlDispensed ?? 0}/${partialProgress?.targetMl ?? '?'})`);
    systemLogService.error('dispense', `Failed dispense persistido: ${orderNumber}`, { orderNumber, reason, ...partialProgress });
  } catch (err) {
    console.error(`[DispenseRecovery] Failed to persist failed dispense ${orderNumber}:`, err);
    systemLogService.error('dispense', `Falha ao persistir failed dispense: ${orderNumber}`, { orderNumber, reason, error: err instanceof Error ? err.message : String(err) });
  }
}

// ============================================================================
// RECONCILIATION
// ============================================================================

// Idempotency guard: prevent concurrent reconciliation runs
let isReconciling = false;

/**
 * Reconcilia dispenses falhados pendentes no startup.
 * Le a fila local e garante que o Firestore reflete o status de falha.
 */
export async function reconcileOnStartup(): Promise<void> {
  if (isReconciling) {
    console.log('[DispenseRecovery] Reconciliation already in progress, skipping');
    return;
  }
  isReconciling = true;

  try {
    const pending = await cacheGetAll<FailedDispense>(STORES.FAILED_DISPENSES);
    if (pending.length === 0) return;

    console.log(`[DispenseRecovery] Reconciling ${pending.length} failed dispense(s) on startup`);
    systemLogService.info('dispense', `Reconciliando ${pending.length} dispense(s) falhados no startup`);

    for (const entry of pending) {
      try {
        // Validate storeId before attempting update
        if (!entry.storeId) {
          console.error(`[DispenseRecovery] Missing storeId for ${entry.orderNumber}, keeping in queue for manual intervention`);
          systemLogService.error('dispense', `Missing storeId para reconciliação: ${entry.orderNumber}`, { orderNumber: entry.orderNumber });
          continue;
        }

        await salesService.updateOrderDispenseStatus(
          entry.orderNumber,
          'failed_dispense',
          entry.storeId
        );
        // Remover da fila local após sync bem-sucedido
        await cacheDelete(STORES.FAILED_DISPENSES, entry.id);
        console.log(`[DispenseRecovery] Reconciled: ${entry.orderNumber}`);
      } catch (err) {
        console.error(`[DispenseRecovery] Failed to reconcile ${entry.orderNumber}:`, err);
        systemLogService.error('dispense', `Falha ao reconciliar dispense: ${entry.orderNumber}`, { orderNumber: entry.orderNumber, error: err instanceof Error ? err.message : String(err) });
        // Mantém na fila para próxima tentativa
      }
    }
  } catch (err) {
    console.error('[DispenseRecovery] reconcileOnStartup error:', err);
    systemLogService.error('dispense', `Erro geral reconciliação startup: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    isReconciling = false;
  }
}

/**
 * Remove um dispense da fila de falhas (quando compensado manualmente).
 */
export async function clearFailedDispense(orderNumber: string): Promise<void> {
  try {
    await cacheDelete(STORES.FAILED_DISPENSES, orderNumber);
    console.log(`[DispenseRecovery] Cleared: ${orderNumber}`);
  } catch (err) {
    console.error(`[DispenseRecovery] Failed to clear ${orderNumber}:`, err);
  }
}

/**
 * Retorna todos os dispenses falhados pendentes (para UI de diagnóstico).
 */
export async function getPendingFailedDispenses(): Promise<FailedDispense[]> {
  try {
    return await cacheGetAll<FailedDispense>(STORES.FAILED_DISPENSES);
  } catch (err) {
    console.error('[DispenseRecovery] Failed to get pending:', err);
    return [];
  }
}
