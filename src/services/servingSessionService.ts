/**
 * ============================================================================
 * ServingSession Service — Persistência de Dispensação
 * ============================================================================
 *
 * Persiste cada dispensação do ESP32 como evento IMUTÁVEL no Firestore.
 * Path: franchises/{fId}/stores/{sId}/servingSessions/{eventId}
 *
 * Idempotência: eventId = `${orderId}_t${tapId}_c${cupIndex}`
 * Offline: usa enqueueSync (IndexedDB) quando Firestore não está alcançável.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { doc, setDoc, getDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { getFirebaseDb, getCurrentFranchiseId, getCurrentStoreId } from '@/services/firebase';
import { storeSubPath } from '@/lib/pathResolver';
import { enqueueSync } from '@/services/syncService';
import type { ESP32DispensingProgress } from '@/types/esp32ContextTypes';

// ============================================================================
// EVENT ID GENERATION (DETERMINISTIC / IDEMPOTENT)
// ============================================================================

/**
 * Gera eventId determinístico para idempotência.
 * Formato: `${orderId}_t${tapId}_c${cupIndex}`
 *
 * @example
 *   generateEventId('ORD-250207-abc', 0, 1) => 'ORD-250207-abc_t0_c1'
 */
export function generateEventId(
  orderId: string,
  tapId: string | number,
  cupIndex: number
): string {
  return `${orderId}_t${tapId}_c${cupIndex}`;
}

// ============================================================================
// SESSION PERSISTENCE
// ============================================================================

export interface PersistSessionParams {
  /** Last known progress snapshot BEFORE clearing state */
  progress: ESP32DispensingProgress;
  /** 'completed' | 'error' from ESP32 status response */
  stage: string;
  /** Error message from ESP32, if any */
  errorMessage?: string;
  /** Timestamp captured when the dispensing started */
  startedAt?: Date;
}

/**
 * Persiste uma ServingSession no Firestore (ou fila offline).
 *
 * Flow:
 *   1. Gera eventId determinístico
 *   2. Tenta lookup de kegId via taps/{tapId} doc
 *   3. Escreve via setDoc (idempotente — mesmo eventId = sobrescreve com mesmos dados)
 *   4. Se offline/falha: enfileira no IndexedDB via enqueueSync
 */
export async function persistSession(params: PersistSessionParams): Promise<void> {
  const { progress, stage, errorMessage, startedAt } = params;

  const franchiseId = getCurrentFranchiseId();
  const storeId = getCurrentStoreId();

  if (!franchiseId || !storeId) {
    console.warn('[ServingSession] Missing franchiseId or storeId — cannot persist');
    return;
  }

  const tapId = String(progress.tapId ?? 0);
  const cupIndex = Math.max(0, (progress.cup || 1) - 1); // cup is 1-based, cupIndex is 0-based; || trata 0 como falsy
  const eventId = generateEventId(progress.orderId, tapId, cupIndex);

  // Determine status
  let status: 'completed' | 'error' | 'canceled' = 'completed';
  if (stage === 'error') {
    status = 'error';
  }

  // Build session data
  const sessionData: Record<string, unknown> = {
    eventId,
    orderId: progress.orderId,
    tapId,
    kegId: null, // will attempt lookup below
    productId: null,
    cupIndex,
    targetMl: progress.targetMl || 0,
    actualMl: progress.ml || 0,
    startedAt: startedAt || new Date(),
    completedAt: new Date(),
    createdAt: { _type: 'serverTimestamp' }, // marker for syncService reconstruction
    status,
    errorCode: errorMessage || undefined,
    source: 'kiosk',
    franchiseId,
    storeId,
  };

  // Attempt kegId lookup from taps/{tapId}.currentKegId
  try {
    const db = getFirebaseDb();
    const tapDocPath = `${storeSubPath(franchiseId, storeId, 'taps')}/${tapId}`;
    const tapSnap = await getDoc(doc(db, tapDocPath));
    if (tapSnap.exists()) {
      const tapData = tapSnap.data();
      if (tapData.currentKegId) {
        sessionData.kegId = tapData.currentKegId;
      }
    }
  } catch (err) {
    console.warn('[ServingSession] Could not lookup kegId from tap doc:', err);
    // Non-critical — proceed without kegId
  }

  // ── ONLINE: try direct Firestore write via transaction (create-if-absent) ──
  if (navigator.onLine) {
    try {
      const db = getFirebaseDb();
      const sessionsPath = storeSubPath(franchiseId, storeId, 'servingSessions');
      const docRef = doc(db, sessionsPath, eventId);

      // Replace serverTimestamp marker with actual serverTimestamp for direct write
      const directData = { ...sessionData };
      directData.createdAt = serverTimestamp();

      // Transaction: create-if-absent atomico.
      // Se doc ja existe (retry / race) → sucesso silencioso (idempotencia).
      // Nao gera PERMISSION_DENIED (evita fallback desnecessario para fila offline).
      await runTransaction(db, async (txn) => {
        const snap = await txn.get(docRef);
        if (snap.exists()) {
          console.log(`[ServingSession] Doc ${eventId} already exists, idempotent skip`);
          return; // transaction succeeds, doc untouched
        }
        txn.set(docRef, directData);
      });
      console.log(`[ServingSession] Persisted ${eventId} to Firestore`);
      return;
    } catch (err) {
      console.warn('[ServingSession] Direct Firestore write failed, falling back to queue:', err);
    }
  }

  // ── OFFLINE (or write failed): enqueue for sync ─────────────────────────
  try {
    await enqueueSync('create', 'servingSessions', eventId, sessionData);
    console.log(`[ServingSession] Enqueued ${eventId} for offline sync`);
  } catch (err) {
    console.error('[ServingSession] Failed to enqueue for sync:', err);
  }
}
