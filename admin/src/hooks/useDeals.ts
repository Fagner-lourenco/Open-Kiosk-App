/**
 * ============================================================================
 * useDeals Hook — Deal (Pipeline) CRUD + Queries
 * ============================================================================
 *
 * Hook para gerenciar negociações (deals) do pipeline comercial.
 * Path: franchises/{fId}/stores/{sId}/deals/{dealId}
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
  deleteDoc,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { customerKeys } from '@/hooks/useCustomers';
import type {
  Deal,
  DealStage,
} from '@/types/commercial';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const dealKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['deals', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function dealsRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'deals');
}

function dealDocRef(franchiseId: string, storeId: string, dealId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'deals', dealId);
}

const VALID_DEAL_STAGES: DealStage[] = ['lead', 'qualify', 'proposal', 'negotiation', 'won', 'lost'];

/** Converte Firestore doc → Deal */
function normalizeDeal(id: string, data: Record<string, unknown>): Deal {
  const stg = data.stage as string;
  const rawProb = Number(data.probability) || 0;
  return {
    id,
    title: (data.title as string) || '',
    customerId: (data.customerId as string) || '',
    stage: VALID_DEAL_STAGES.includes(stg as DealStage) ? (stg as DealStage) : 'lead',
    valueEstimate: Number(data.valueEstimate) || 0,
    probability: Math.min(100, Math.max(0, rawProb)),
    expectedCloseAt: data.expectedCloseAt as Timestamp | undefined,
    eventStartAt: data.eventStartAt as Timestamp | undefined,
    eventEndAt: data.eventEndAt as Timestamp | undefined,
    nextActionAt: data.nextActionAt as Timestamp | undefined,
    ownerUserId: (data.ownerUserId as string) || '',
    lostReason: data.lostReason as string | undefined,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface CreateDealInput {
  title: string;
  customerId: string;
  stage?: DealStage;
  valueEstimate?: number;
  probability?: number;
  expectedCloseAt?: Date;
  eventStartAt?: Date;
  eventEndAt?: Date;
}

export interface UpdateDealInput {
  dealId: string;
  title?: string;
  customerId?: string;
  stage?: DealStage;
  valueEstimate?: number;
  probability?: number;
  expectedCloseAt?: Date | null;
  eventStartAt?: Date | null;
  eventEndAt?: Date | null;
  nextActionAt?: Date | null;
  lostReason?: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useDeals(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { log: audit } = useAudit();

  // ── Fetch all deals ─────────────────────────────────────────────────────
  const {
    data: deals = [],
    isLoading: loadingDeals,
    error: dealsError,
    refetch: refetchDeals,
  } = useQuery({
    queryKey: dealKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<Deal[]> => {
      const ref = dealsRef(franchiseId, storeId);
      const q = query(ref, orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeDeal(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
    refetchOnWindowFocus: true,
  });

  // ── Create deal ─────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateDealInput) => {
      // [FIX BUG-COM-05] Validações de campos obrigatórios
      if (!input.title?.trim()) throw new Error('Título é obrigatório');
      if (!input.customerId?.trim()) throw new Error('Cliente é obrigatório');
      if (input.valueEstimate != null && input.valueEstimate < 0) {
        throw new Error('Valor estimado não pode ser negativo');
      }

      const newRef = doc(dealsRef(franchiseId, storeId));
      const now = serverTimestamp();
      await setDoc(newRef, {
        title: input.title,
        customerId: input.customerId,
        stage: input.stage || 'lead',
        valueEstimate: input.valueEstimate || 0,
        probability: Math.max(0, Math.min(100, input.probability || 0)),
        expectedCloseAt: input.expectedCloseAt ? Timestamp.fromDate(input.expectedCloseAt) : null,
        eventStartAt: input.eventStartAt ? Timestamp.fromDate(input.eventStartAt) : null,
        eventEndAt: input.eventEndAt ? Timestamp.fromDate(input.eventEndAt) : null,
        nextActionAt: null,
        ownerUserId: user?.uid || '',
        lostReason: null,
        createdAt: now,
        updatedAt: now,
      });
      return newRef.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all(franchiseId, storeId) });
      toast.success('Negociação criada com sucesso');
      audit(AuditActions.DEAL_CREATE, { type: 'deal', id: _id, name: variables.title }, { customerId: variables.customerId, storeId });
    },
    onError: () => {
      toast.error('Erro ao criar negociação');
    },
  });

  // ── Update deal ─────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateDealInput) => {
      const { dealId, ...fields } = input;
      const ref = dealDocRef(franchiseId, storeId, dealId);

      // Convert Date fields to Timestamps
      const firestoreFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (value === null) {
          firestoreFields[key] = null;
        } else if (value instanceof Date) {
          firestoreFields[key] = Timestamp.fromDate(value);
        } else {
          firestoreFields[key] = value;
        }
      }

      await updateDoc(ref, {
        ...firestoreFields,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all(franchiseId, storeId) });
      toast.success('Negociação atualizada');
      audit(AuditActions.DEAL_UPDATE, { type: 'deal', id: variables.dealId, name: variables.title || variables.dealId }, { updatedFields: Object.keys(variables).filter(k => k !== 'dealId'), storeId });
    },
    onError: () => {
      toast.error('Erro ao atualizar negociação');
    },
  });

  // ── Move deal stage (quick action) ──────────────────────────────────────
  const moveStageMutation = useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: DealStage }) => {
      const ref = dealDocRef(franchiseId, storeId, dealId);
      await updateDoc(ref, {
        stage,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all(franchiseId, storeId) });
      audit(AuditActions.DEAL_STAGE_CHANGE, { type: 'deal', id: variables.dealId, name: variables.dealId }, { newStage: variables.stage, storeId });
    },
    onError: () => {
      toast.error('Erro ao mover negociação');
    },
  });

  // ── Delete deal ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const ref = dealDocRef(franchiseId, storeId, dealId);
      await deleteDoc(ref);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all(franchiseId, storeId) });
      // Also invalidate customers (deal counts may change)
      queryClient.invalidateQueries({ queryKey: customerKeys.all(franchiseId, storeId) });
      toast.success('Negociação excluída');
      audit(AuditActions.DEAL_DELETE, { type: 'deal', id: variables, name: variables }, { storeId });
    },
    onError: () => {
      toast.error('Erro ao excluir negociação');
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const dealsByStage = (stage: DealStage) => deals.filter((d) => d.stage === stage);

  const activeDeals = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');

  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + d.valueEstimate, 0);

  const weightedPipelineValue = activeDeals.reduce(
    (sum, d) => sum + d.valueEstimate * (d.probability / 100),
    0
  );

  return {
    deals,
    loadingDeals,
    dealsError,
    refetchDeals,
    activeDeals,
    dealsByStage,
    totalPipelineValue,
    weightedPipelineValue,

    createDeal: createMutation.mutateAsync,
    isCreatingDeal: createMutation.isPending,

    updateDeal: updateMutation.mutateAsync,
    isUpdatingDeal: updateMutation.isPending,

    moveDealStage: moveStageMutation.mutate,
    isMovingStage: moveStageMutation.isPending,

    deleteDeal: deleteMutation.mutateAsync,
    isDeletingDeal: deleteMutation.isPending,
  };
}
