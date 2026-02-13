/**
 * ============================================================================
 * useMaintenance Hook — Maintenance Scheduling & Tracking
 * ============================================================================
 *
 * Gerencia MaintenanceLogs para uma loja.
 * - Query com filtros de status/tipo
 * - Agendamento de nova manutencao
 * - Completar/cancelar manutencao
 * - Alertas de manutencao atrasada
 *
 * Path: franchises/{fId}/stores/{sId}/maintenanceLogs/{id}
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';

// ============================================================================
// TYPES
// ============================================================================

export type MaintenanceType = 'cleaning' | 'calibration' | 'repair' | 'inspection' | 'other';
export type MaintenanceStatus = 'scheduled' | 'overdue' | 'completed' | 'canceled';

export interface MaintenanceLog {
  id: string;
  type: MaintenanceType;
  tapId?: string;
  kegId?: string;
  status: MaintenanceStatus;
  scheduledAt?: Date;
  performedAt?: Date;
  durationMinutes?: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  franchiseId: string;
  storeId: string;
}

export interface CreateMaintenanceInput {
  type: MaintenanceType;
  tapId?: string;
  scheduledAt?: Date;
  notes?: string;
}

export interface CompleteMaintenanceInput {
  logId: string;
  durationMinutes?: number;
  notes?: string;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const maintenanceKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['maintenance-logs', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function maintenanceRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'maintenanceLogs');
}

function normalizeLog(id: string, data: Record<string, unknown>): MaintenanceLog {
  const toDate = (v: unknown): Date => {
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
  };
  const toDateOrUndef = (v: unknown): Date | undefined => {
    if (v == null) return undefined;
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return undefined;
  };

  // Auto-detect overdue
  let status = (data.status as MaintenanceStatus) || 'scheduled';
  if (status === 'scheduled' && data.scheduledAt) {
    const scheduled = toDate(data.scheduledAt);
    if (scheduled.getTime() < Date.now()) {
      status = 'overdue';
    }
  }

  return {
    id,
    type: (data.type as MaintenanceType) || 'other',
    tapId: data.tapId as string | undefined,
    kegId: data.kegId as string | undefined,
    status,
    scheduledAt: toDateOrUndef(data.scheduledAt),
    performedAt: toDateOrUndef(data.performedAt),
    durationMinutes: data.durationMinutes as number | undefined,
    notes: data.notes as string | undefined,
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || '',
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string) || '',
    franchiseId: (data.franchiseId as string) || '',
    storeId: (data.storeId as string) || '',
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useMaintenance(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Fetch maintenance logs (last 100) ───────────────────────────────────
  const {
    data: logs = [],
    isLoading: loadingLogs,
    isError: isErrorLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: maintenanceKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<MaintenanceLog[]> => {
      const ref = maintenanceRef(franchiseId, storeId);
      const q = query(ref, orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeLog(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Derived ─────────────────────────────────────────────────────────────
  const scheduledLogs = logs.filter((l) => l.status === 'scheduled');
  const overdueLogs = logs.filter((l) => l.status === 'overdue');
  const completedLogs = logs.filter((l) => l.status === 'completed');

  // ── Schedule new maintenance ────────────────────────────────────────────
  const scheduleMutation = useMutation({
    mutationFn: async (input: CreateMaintenanceInput) => {
      const ref = maintenanceRef(franchiseId, storeId);
      const newDocRef = doc(ref);
      const uid = user?.uid || '';

      await setDoc(newDocRef, {
        id: newDocRef.id,
        type: input.type,
        tapId: input.tapId || null,
        kegId: null,
        status: 'scheduled',
        scheduledAt: input.scheduledAt || null,
        performedAt: null,
        durationMinutes: null,
        notes: input.notes || null,
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        franchiseId,
        storeId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all(franchiseId, storeId) });
      toast.success('Manutenção agendada');
    },
    onError: () => {
      toast.error('Erro ao agendar manutencao');
    },
  });

  // ── Complete maintenance ────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: async (input: CompleteMaintenanceInput) => {
      const logRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'maintenanceLogs', input.logId);
      const uid = user?.uid || '';

      await updateDoc(logRef, {
        status: 'completed',
        performedAt: serverTimestamp(),
        performedBy: uid,
        durationMinutes: input.durationMinutes || null,
        notes: input.notes || null,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all(franchiseId, storeId) });
      toast.success('Manutenção concluida');
    },
    onError: () => {
      toast.error('Erro ao concluir manutencao');
    },
  });

  // ── Cancel maintenance ──────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: async (logId: string) => {
      const logRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'maintenanceLogs', logId);
      const uid = user?.uid || '';

      await updateDoc(logRef, {
        status: 'canceled',
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all(franchiseId, storeId) });
      toast.success('Manutenção cancelada');
    },
    onError: () => {
      toast.error('Erro ao cancelar manutencao');
    },
  });

  return {
    logs,
    loadingLogs,
    isErrorLogs,
    refetchLogs,
    scheduledLogs,
    overdueLogs,
    completedLogs,
    schedule: scheduleMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
    complete: completeMutation.mutateAsync,
    isCompleting: completeMutation.isPending,
    cancel: cancelMutation.mutateAsync,
    isCanceling: cancelMutation.isPending,
  };
}
