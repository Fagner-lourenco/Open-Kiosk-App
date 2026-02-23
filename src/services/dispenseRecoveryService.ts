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
  /** Se o fluxo já havia começado (solenóide abriu) quando a falha ocorreu.
   * true + mlDispensed=0 = caso ambíguo: pode ter dispensado sem medir. Não fazer retry automático. */
  flowStarted?: boolean;
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
    flowStarted?: boolean;
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
      flowStarted: partialProgress?.flowStarted,
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
    // v4.1.5: Bridge checkpoint localStorage → IndexedDB para crash recovery.
    // Detecta se o app travou entre pagamento aprovado e persistFailedDispense,
    // garantindo que nenhum pagamento seja perdido silenciosamente.
    const CKPT_KEY = 'kiosk_checkout_progress';
    const rawCheckpoint = typeof localStorage !== 'undefined' ? localStorage.getItem(CKPT_KEY) : null;
    if (rawCheckpoint) {
      try {
        const checkpoint = JSON.parse(rawCheckpoint) as {
          orderNumber: string; ml: number; quantity: number;
          tapId: number; sizeLabel: string; timestamp: number;
        };
        const ageMs = Date.now() - checkpoint.timestamp;
        if (ageMs < 30 * 60 * 1000) {  // 🔧 FIX Bug #18: ampliado de 10min para 30min
          // Um device desligado por até 30min após um crash ainda deve reconciliar o pedido.
          const existingItems = await cacheGetAll<FailedDispense>(STORES.FAILED_DISPENSES);
          const alreadyInQueue = existingItems.some(e => e.orderNumber === checkpoint.orderNumber);
          if (!alreadyInQueue) {
            console.warn(`[DispenseRecovery] Crash recovery via checkpoint: ${checkpoint.orderNumber} (${Math.round(ageMs / 1000)}s atrás)`);
            systemLogService.error('dispense', `Crash recovery via checkpoint localStorage: ${checkpoint.orderNumber}`, { orderNumber: checkpoint.orderNumber, ageMs });
            await persistFailedDispense(checkpoint.orderNumber, 'crash_recovery', {
              mlDispensed: 0,
              targetMl: checkpoint.ml,
              cup: 1,
              totalCups: checkpoint.quantity,
              tapId: checkpoint.tapId,
              sizeLabel: checkpoint.sizeLabel,
            });
          }
        }
        localStorage.removeItem(CKPT_KEY);
      } catch (ckptErr) {
        console.warn('[DispenseRecovery] Falha ao processar checkpoint localStorage:', ckptErr);
        localStorage.removeItem(CKPT_KEY);
      }
    }

    const pending = await cacheGetAll<FailedDispense>(STORES.FAILED_DISPENSES);
    if (pending.length === 0) return;

    console.log(`[DispenseRecovery] Reconciling ${pending.length} failed dispense(s) on startup`);
    systemLogService.info('dispense', `Reconciliando ${pending.length} dispense(s) falhados no startup`);

    for (const entry of pending) {
      const MAX_RECONCILE_RETRIES = 5;
      try {
        // 🔧 FIX Bug #19: Expirar itens após MAX_RECONCILE_RETRIES tentativas.
        // Sem isso, itens com storeId inválido ou Firestore deórbita acumulam indefinidamente,
        // poluindo logs a cada startup do app.
        if ((entry.retryCount ?? 0) >= MAX_RECONCILE_RETRIES) {
          console.warn(`[DispenseRecovery] Desistindo de reconciliar ${entry.orderNumber} após ${MAX_RECONCILE_RETRIES} tentativas`);
          systemLogService.error('dispense', `Reconciliação abandonada após ${MAX_RECONCILE_RETRIES} tentativas: ${entry.orderNumber}`, { orderNumber: entry.orderNumber, retryCount: entry.retryCount });
          await cacheDelete(STORES.FAILED_DISPENSES, entry.id);
          continue;
        }

        // Validate storeId before attempting update
        if (!entry.storeId) {
          console.error(`[DispenseRecovery] Missing storeId for ${entry.orderNumber}, keeping in queue for manual intervention`);
          systemLogService.error('dispense', `Missing storeId para reconciliação: ${entry.orderNumber}`, { orderNumber: entry.orderNumber });
          // Incrementar retryCount mesmo na falta de storeId (evita loop infinito)
          await cacheSet(STORES.FAILED_DISPENSES, { ...entry, retryCount: (entry.retryCount ?? 0) + 1 });
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
        // Incrementar retryCount antes de manter na fila para próxima tentativa
        await cacheSet(STORES.FAILED_DISPENSES, { ...entry, retryCount: (entry.retryCount ?? 0) + 1 }).catch(() => {});
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
