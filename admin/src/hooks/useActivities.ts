/**
 * ============================================================================
 * useActivities Hook — Activity CRUD para Deals (CRM)
 * ============================================================================
 *
 * Path: franchises/{fId}/stores/{sId}/deals/{dealId}/activities/{activityId}
 *
 * Suporta dois modos:
 *   1. Por deal: useActivities(fId, sId, dealId) — lista atividades de um deal
 *   2. Global: useActivities(fId, sId) — lista todas atividades via collectionGroup
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { toast } from 'sonner';
import type { Activity, ActivityType, ActivityStatus } from '@/types/commercial';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const activityKeys = {
  byDeal: (franchiseId: string, storeId: string, dealId: string) =>
    ['activities', franchiseId, storeId, dealId] as const,
  global: (franchiseId: string, storeId: string) =>
    ['activities', franchiseId, storeId, '__global__'] as const,
};

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateActivityInput {
  dealId: string;
  type: ActivityType;
  dueAt: Date;
  summary: string;
  notes?: string;
}

export interface UpdateActivityInput {
  dealId: string;
  activityId: string;
  status?: ActivityStatus;
  doneAt?: Date;
  summary?: string;
  notes?: string;
  dueAt?: Date;
}

// ============================================================================
// HELPERS
// ============================================================================

const VALID_TYPES: ActivityType[] = ['call', 'whatsapp', 'email', 'visit', 'task'];
const VALID_STATUSES: ActivityStatus[] = ['open', 'done', 'canceled'];

function normalizeActivity(id: string, data: Record<string, unknown>): Activity & { dealId?: string } {
  return {
    id,
    type: VALID_TYPES.includes(data.type as ActivityType) ? (data.type as ActivityType) : 'task',
    dueAt: data.dueAt as Timestamp,
    doneAt: data.doneAt as Timestamp | undefined,
    status: VALID_STATUSES.includes(data.status as ActivityStatus) ? (data.status as ActivityStatus) : 'open',
    summary: (data.summary as string) || '',
    notes: data.notes as string | undefined,
    createdBy: (data.createdBy as string) || '',
    createdAt: data.createdAt as Timestamp,
    // Extra field for global queries — extract dealId from path
    dealId: data._dealId as string | undefined,
  };
}

function activitiesRef(franchiseId: string, storeId: string, dealId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'deals', dealId, 'activities');
}

function activityDocRef(franchiseId: string, storeId: string, dealId: string, activityId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'deals', dealId, 'activities', activityId);
}

// ============================================================================
// HOOK
// ============================================================================

export function useActivities(franchiseId: string, storeId: string, dealId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { log: audit } = useAudit();

  const isGlobal = !dealId;
  const qKey = isGlobal
    ? activityKeys.global(franchiseId, storeId)
    : activityKeys.byDeal(franchiseId, storeId, dealId);

  // ── List ────────────────────────────────────────────────────────────────

  const {
    data: activities = [],
    isLoading: loadingActivities,
    error: activitiesError,
    refetch: refetchActivities,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      if (isGlobal) {
        // Global: iterate all deals for this store
        const dealsSnap = await getDocs(
          collection(db, 'franchises', franchiseId, 'stores', storeId, 'deals'),
        );
        const allActivities: (Activity & { dealId?: string })[] = [];
        for (const dealDoc of dealsSnap.docs) {
          const actSnap = await getDocs(
            query(activitiesRef(franchiseId, storeId, dealDoc.id), orderBy('dueAt', 'desc')),
          );
          actSnap.docs.forEach((d) => {
            const act = normalizeActivity(d.id, d.data());
            act.dealId = dealDoc.id;
            allActivities.push(act);
          });
        }
        // Sort descending by dueAt
        return allActivities.sort((a, b) => {
          const aTime = a.dueAt instanceof Timestamp ? a.dueAt.toMillis() : 0;
          const bTime = b.dueAt instanceof Timestamp ? b.dueAt.toMillis() : 0;
          return bTime - aTime;
        });
      } else {
        const ref = activitiesRef(franchiseId, storeId, dealId);
        const q = query(ref, orderBy('dueAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map((d) => {
          const act = normalizeActivity(d.id, d.data());
          act.dealId = dealId;
          return act;
        });
      }
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Create ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (input: CreateActivityInput) => {
      const ref = doc(activitiesRef(franchiseId, storeId, input.dealId));
      await setDoc(ref, {
        type: input.type,
        dueAt: Timestamp.fromDate(input.dueAt),
        status: 'open' as ActivityStatus,
        summary: input.summary,
        notes: input.notes || null,
        createdBy: user?.uid || '',
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      // Also invalidate deal-specific if global
      if (isGlobal) {
        queryClient.invalidateQueries({
          queryKey: activityKeys.byDeal(franchiseId, storeId, variables.dealId),
        });
      }
      toast.success('Atividade criada');
      audit(AuditActions.DEAL_UPDATE, { type: 'activity', id: _id, name: variables.summary }, { dealId: variables.dealId, storeId });
    },
    onError: () => toast.error('Erro ao criar atividade'),
  });

  // ── Update ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateActivityInput) => {
      const ref = activityDocRef(franchiseId, storeId, input.dealId, input.activityId);
      const fields: Record<string, unknown> = {};
      if (input.status !== undefined) fields.status = input.status;
      if (input.doneAt !== undefined) fields.doneAt = Timestamp.fromDate(input.doneAt);
      if (input.summary !== undefined) fields.summary = input.summary;
      if (input.notes !== undefined) fields.notes = input.notes;
      if (input.dueAt !== undefined) fields.dueAt = Timestamp.fromDate(input.dueAt);
      await updateDoc(ref, fields);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      if (isGlobal) {
        queryClient.invalidateQueries({
          queryKey: activityKeys.byDeal(franchiseId, storeId, variables.dealId),
        });
      }
      toast.success('Atividade atualizada');
    },
    onError: () => toast.error('Erro ao atualizar atividade'),
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async ({ dealId: dId, activityId }: { dealId: string; activityId: string }) => {
      await deleteDoc(activityDocRef(franchiseId, storeId, dId, activityId));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      if (isGlobal) {
        queryClient.invalidateQueries({
          queryKey: activityKeys.byDeal(franchiseId, storeId, variables.dealId),
        });
      }
      toast.success('Atividade excluída');
    },
    onError: () => toast.error('Erro ao excluir atividade'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const openActivities = useMemo(
    () => activities.filter((a) => a.status === 'open'),
    [activities],
  );

  const doneActivities = useMemo(
    () => activities.filter((a) => a.status === 'done'),
    [activities],
  );

  const overdueActivities = useMemo(() => {
    const now = Date.now();
    return activities.filter((a) => {
      if (a.status !== 'open') return false;
      const due = a.dueAt instanceof Timestamp ? a.dueAt.toMillis() : 0;
      return due > 0 && due < now;
    });
  }, [activities]);

  return {
    activities,
    loadingActivities,
    activitiesError,
    refetchActivities,
    openActivities,
    doneActivities,
    overdueActivities,
    createActivity: createMutation.mutateAsync,
    isCreatingActivity: createMutation.isPending,
    updateActivity: updateMutation.mutateAsync,
    isUpdatingActivity: updateMutation.isPending,
    deleteActivity: deleteMutation.mutateAsync,
    isDeletingActivity: deleteMutation.isPending,
  };
}
