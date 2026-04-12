/**
 * ============================================================================
 * useTapAssignments Hook — Connect/Disconnect Keg ↔ Tap
 * ============================================================================
 *
 * Gerencia TapAssignments e lazy-inits dos docs Tap operacional.
 * Inclui a operação atômica de conectar/desconectar usando writeBatch.
 *
 * Paths:
 *   - franchises/{fId}/stores/{sId}/taps/{tapId}
 *   - franchises/{fId}/stores/{sId}/tapAssignments/{assignmentId}
 *   - franchises/{fId}/stores/{sId}/kegs/{kegId}
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  writeBatch,
  runTransaction,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { kegKeys } from './useKegs';
import type { TapOperationalState, TapAssignment } from '@shared/types/operations';
import { MAX_TAPS_PER_KEG } from '@shared/types/operations';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const tapKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['taps', franchiseId, storeId] as const,
  assignments: (franchiseId: string, storeId: string) =>
    ['tap-assignments', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function tapsRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'taps');
}

function tapDocRef(franchiseId: string, storeId: string, tapId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'taps', tapId);
}

function assignmentsRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'tapAssignments');
}

function kegDocRef(franchiseId: string, storeId: string, kegId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'kegs', kegId);
}

function normalizeTap(id: string, data: Record<string, unknown>): TapOperationalState {
  const toDate = (v: unknown): Date => {
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
  };
  return {
    tapId: id,
    status: (data.status as TapOperationalState['status']) || 'idle',
    currentKegId: (data.currentKegId as string) ?? null,
    todayMlDispensed: (data.todayMlDispensed as number) || 0,
    todaySessions: (data.todaySessions as number) || 0,
    todayWastageMl: (data.todayWastageMl as number) || 0,
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || 'system',
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string) || 'system',
  };
}

function normalizeAssignment(id: string, data: Record<string, unknown>): TapAssignment {
  const toDate = (v: unknown): Date => {
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
  };
  const toDateOrNull = (v: unknown): Date | null => {
    if (v == null) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return null;
  };
  return {
    assignmentId: id,
    tapId: (data.tapId as string) || '',
    kegId: (data.kegId as string) || '',
    status: (data.status as TapAssignment['status']) || 'active',
    attachedAt: toDate(data.attachedAt),
    attachedBy: (data.attachedBy as string) || '',
    removedAt: toDateOrNull(data.removedAt),
    removedBy: (data.removedBy as string) ?? null,
    removalReason: data.removalReason as string | undefined,
    totalMlDispensed: (data.totalMlDispensed as number) || 0,
    totalSessions: (data.totalSessions as number) || 0,
    totalWastageMl: (data.totalWastageMl as number) || 0,
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || '',
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string) || '',
  };
}

// ============================================================================
// HOOK
// ============================================================================

/** How many taps the store has (read from store doc taps[] config or default 4) */
const MAX_TAPS = 4;

export function useTapAssignments(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { log: audit } = useAudit();

  // ── Fetch tap operational states (lazy-init if missing) ─────────────────
  const {
    data: taps = [],
    isLoading: loadingTaps,
  } = useQuery({
    queryKey: tapKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<TapOperationalState[]> => {
      const ref = tapsRef(franchiseId, storeId);
      const snap = await getDocs(query(ref, orderBy('tapId')));

      const existing = snap.docs.map((d) => normalizeTap(d.id, d.data()));

      // Discover how many taps the store actually has from store doc
      let tapCount = MAX_TAPS;
      try {
        const storeDoc = await getDoc(
          doc(db, 'franchises', franchiseId, 'stores', storeId)
        );
        if (storeDoc.exists()) {
          const storeData = storeDoc.data();
          const storeTaps = storeData.taps as unknown[];
          if (Array.isArray(storeTaps) && storeTaps.length > 0) {
            tapCount = storeTaps.length;
          }
        }
      } catch {
        // fallback to MAX_TAPS
      }

      // Lazy-init missing tap docs
      const existingIds = new Set(existing.map((t) => t.tapId));
      const batch = writeBatch(db);
      let needsWrite = false;

      for (let i = 0; i < tapCount; i++) {
        const id = String(i);
        if (!existingIds.has(id)) {
          const tapRef = tapDocRef(franchiseId, storeId, id);
          batch.set(tapRef, {
            tapId: id,
            status: 'idle',
            currentKegId: null,
            todayMlDispensed: 0,
            todaySessions: 0,
            todayWastageMl: 0,
            createdAt: serverTimestamp(),
            createdBy: 'system',
            updatedAt: serverTimestamp(),
            updatedBy: 'system',
          }, { merge: true }); // [FIX BUG-OP-9] merge evita sobrescrever doc existente em race condition
          needsWrite = true;
        }
      }

      if (needsWrite) {
        await batch.commit();
        // Re-fetch after init
        const snap2 = await getDocs(query(ref, orderBy('tapId')));
        return snap2.docs.map((d) => normalizeTap(d.id, d.data()));
      }

      return existing;
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Fetch active assignments ────────────────────────────────────────────
  const {
    data: assignments = [],
    isLoading: loadingAssignments,
  } = useQuery({
    queryKey: tapKeys.assignments(franchiseId, storeId),
    queryFn: async (): Promise<TapAssignment[]> => {
      const ref = assignmentsRef(franchiseId, storeId);
      const q = query(ref, where('status', '==', 'active'), orderBy('attachedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeAssignment(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Connect keg to tap (atomic transaction) ─────────────────────────────
  const connectMutation = useMutation({
    mutationFn: async ({
      tapId,
      kegId,
    }: {
      tapId: string;
      kegId: string;
      productId?: string;
    }) => {
      const now = serverTimestamp();
      const uid = user?.uid || '';

      await runTransaction(db, async (txn) => {
        // 1. Read tap doc inside transaction for OCC protection against concurrent connects
        const tapRef = tapDocRef(franchiseId, storeId, tapId);
        const tapSnap = await txn.get(tapRef);
        const currentKegId = tapSnap.exists() ? (tapSnap.data()?.currentKegId as string | null) : null;

        // [FIX BUG-OP-5] Verificar status do barril antes de conectar
        const kegRef = kegDocRef(franchiseId, storeId, kegId);
        const kegSnap = await txn.get(kegRef);
        if (!kegSnap.exists()) throw new Error('Barril não encontrado');
        const kegData = kegSnap.data()!;
        const kegStatus = kegData.status;
        if (kegStatus === 'depleted') throw new Error('Barril esgotado não pode ser conectado');

        // Multi-tap support: allow connecting to up to MAX_TAPS_PER_KEG taps
        // Compat layer: read tapIds (new) or tapId (legacy) field
        const existingTapIds: string[] = Array.isArray(kegData.tapIds)
          ? kegData.tapIds
          : (kegData.tapId ? [kegData.tapId as string] : []);
        if (kegStatus === 'tapped' && existingTapIds.length >= MAX_TAPS_PER_KEG) {
          throw new Error(`Barril já conectado ao máximo de ${MAX_TAPS_PER_KEG} torneiras`);
        }
        // Prevent connecting same keg to same tap twice
        if (existingTapIds.includes(tapId)) {
          throw new Error('Barril já está conectado a esta torneira');
        }

        // 2. If tap has an existing keg, find and remove the active assignment
        let existingAssignment: ReturnType<typeof normalizeAssignment> | null = null;
        if (currentKegId) {
          // [FIX Bug-4] Move query outside transaction scope to find assignment doc ID,
          // then re-read inside txn for OCC safety. Client SDK doesn't support
          // transactional queries, so this is the recommended pattern.
          // The txn.get() below ensures consistency — if the doc changed since
          // the getDocs lookup, the transaction will retry.
          const assSnap = await getDocs(query(
            assignmentsRef(franchiseId, storeId),
            where('tapId', '==', tapId),
            where('status', '==', 'active')
          ));
          for (const assDoc of assSnap.docs) {
            // Re-read inside transaction for OCC
            const assDocRef = doc(assignmentsRef(franchiseId, storeId), assDoc.id);
            const assTxnSnap = await txn.get(assDocRef);
            if (assTxnSnap.exists() && assTxnSnap.data()?.status === 'active') {
              existingAssignment = normalizeAssignment(assTxnSnap.id, assTxnSnap.data() as Record<string, unknown>);
              break; // use the first valid active assignment
            }
          }
        }
        if (existingAssignment) {
          const oldAssRef = doc(
            assignmentsRef(franchiseId, storeId),
            existingAssignment.assignmentId
          );
          txn.update(oldAssRef, {
            status: 'removed',
            removedAt: now,
            removedBy: uid,
            removalReason: 'swap',
            updatedAt: now,
            updatedBy: uid,
          });

          // Mark old keg: remove this tap from tapIds, only change status if no taps left
          const oldKegRef = kegDocRef(franchiseId, storeId, existingAssignment.kegId);
          const oldKegSnap = await txn.get(oldKegRef);
          const oldKegData = oldKegSnap.data();
          const oldKegTapIds: string[] = Array.isArray(oldKegData?.tapIds)
            ? oldKegData!.tapIds
            : (oldKegData?.tapId ? [oldKegData.tapId as string] : []);
          const remainingTapIds = oldKegTapIds.filter((id: string) => id !== tapId);
          txn.update(oldKegRef, {
            tapIds: remainingTapIds,
            ...(remainingTapIds.length === 0
              ? { status: 'depleted', depletedAt: now }
              : {}),
            updatedAt: now,
            updatedBy: uid,
          });
        }

        // 2. Create new TapAssignment
        const newAssRef = doc(assignmentsRef(franchiseId, storeId));
        txn.set(newAssRef, {
          assignmentId: newAssRef.id,
          tapId,
          kegId,
          status: 'active',
          attachedAt: now,
          attachedBy: uid,
          removedAt: null,
          removedBy: null,
          removalReason: null,
          totalMlDispensed: 0,
          totalSessions: 0,
          totalWastageMl: 0,
          createdAt: now,
          createdBy: uid,
          updatedAt: now,
          updatedBy: uid,
        });

        // 3. Update Keg status to tapped (kegRef already read above for OP-5 check)
        txn.update(kegRef, {
          status: 'tapped',
          tapIds: arrayUnion(tapId),
          tappedAt: now,
          updatedAt: now,
          updatedBy: uid,
        });

        // 4. Update Tap operational state (tapRef already read above via txn.get)
        txn.update(tapRef, {
          currentKegId: kegId,
          status: 'active',
          updatedAt: now,
          updatedBy: uid,
        });
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tapKeys.all(franchiseId, storeId) });
      queryClient.invalidateQueries({ queryKey: tapKeys.assignments(franchiseId, storeId) });
      queryClient.invalidateQueries({ queryKey: kegKeys.all(franchiseId, storeId) });
      toast.success('Barril conectado com sucesso');
      audit(AuditActions.TAP_CONNECT, { type: 'tap', id: variables.tapId, name: `Tap ${variables.tapId}` }, { kegId: variables.kegId, storeId });
    },
    onError: () => {
      toast.error('Erro ao conectar barril');
    },
  });

  // ── Disconnect keg from tap ─────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async ({
      tapId,
      reason,
    }: {
      tapId: string;
      reason?: string;
    }) => {
      // 🔒 FIX Bug-15: Use runTransaction instead of writeBatch.
      // The previous pattern read the active assignment OUTSIDE the batch,
      // allowing two concurrent disconnects to both see the same active
      // assignment and double-update. runTransaction provides OCC protection.
      await runTransaction(db, async (txn) => {
        const freshSnap = await getDocs(query(
          assignmentsRef(franchiseId, storeId),
          where('tapId', '==', tapId),
          where('status', '==', 'active')
        ));
        if (freshSnap.empty) throw new Error('Nenhum barril conectado a esta torneira');
        const activeAssignment = normalizeAssignment(freshSnap.docs[0].id, freshSnap.docs[0].data());

        // Read all docs inside transaction for OCC
        const assRef = doc(
          assignmentsRef(franchiseId, storeId),
          activeAssignment.assignmentId
        );
        const kegRef = kegDocRef(franchiseId, storeId, activeAssignment.kegId);
        const tapRef = tapDocRef(franchiseId, storeId, tapId);
        await txn.get(assRef);
        const kegSnap = await txn.get(kegRef);
        await txn.get(tapRef);

        const now = serverTimestamp();
        const uid = user?.uid || '';

        // 1. Update assignment
        txn.update(assRef, {
          status: 'removed',
          removedAt: now,
          removedBy: uid,
          removalReason: reason || 'manual',
          updatedAt: now,
          updatedBy: uid,
        });

        // 2. Update keg — remove this specific tap from tapIds
        // Only change keg status if no other taps remain connected
        const kegData = kegSnap.data();
        const currentTapIds: string[] = Array.isArray(kegData?.tapIds)
          ? kegData!.tapIds
          : (kegData?.tapId ? [kegData.tapId as string] : []);
        const remainingTapIds = currentTapIds.filter((id: string) => id !== tapId);
        const noTapsLeft = remainingTapIds.length === 0;

        txn.update(kegRef, {
          tapIds: arrayRemove(tapId),
          ...(noTapsLeft
            ? {
                status: reason === 'depleted' ? 'depleted' : 'in_stock',
                ...(reason === 'depleted' ? { depletedAt: now } : {}),
              }
            : {}),
          updatedAt: now,
          updatedBy: uid,
        });

        // 3. Update tap
        txn.update(tapRef, {
          currentKegId: null,
          status: 'idle',
          updatedAt: now,
          updatedBy: uid,
        });
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tapKeys.all(franchiseId, storeId) });
      queryClient.invalidateQueries({ queryKey: tapKeys.assignments(franchiseId, storeId) });
      queryClient.invalidateQueries({ queryKey: kegKeys.all(franchiseId, storeId) });
      toast.success('Barril desconectado');
      audit(AuditActions.TAP_DISCONNECT, { type: 'tap', id: variables.tapId, name: `Tap ${variables.tapId}` }, { reason: variables.reason, storeId });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao desconectar barril');
    },
  });

  // ── Derived helpers ─────────────────────────────────────────────────────

  /** Get the active assignment for a specific tap */
  const getActiveAssignment = (tapId: string): TapAssignment | undefined =>
    assignments.find((a) => a.tapId === tapId && a.status === 'active');

  /** Find which taps a keg is assigned to (may be multiple) */
  const getKegTapIds = (kegId: string): string[] =>
    assignments.filter((a) => a.kegId === kegId && a.status === 'active').map((a) => a.tapId);

  return {
    taps,
    loadingTaps,
    assignments,
    loadingAssignments,
    getActiveAssignment,
    getKegTapIds,
    connect: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    disconnect: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
  };
}
