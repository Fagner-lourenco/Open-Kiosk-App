/**
 * ============================================================================
 * useCostCenters — CRUD para Centros de Custo
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finCostCenters/{centerId}
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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { financeSubPath, financeDocPath } from '@/lib/pathResolver';
import { toast } from 'sonner';
import type { CostCenter, CostCenterStatus } from '@/types/finance';
import type { Timestamp } from 'firebase/firestore';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const costCenterKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['costCenters', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateCostCenterInput {
  name: string;
  status?: CostCenterStatus;
}

export interface UpdateCostCenterInput {
  centerId: string;
  name?: string;
  status?: CostCenterStatus;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function centersRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'costCenters'));
}

function centerDocRef(franchiseId: string, storeId: string, centerId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'costCenters', centerId));
}

function normalizeCenter(id: string, data: Record<string, unknown>): CostCenter {
  return {
    id,
    name: (data.name as string) || '',
    status: (data.status as CostCenterStatus) || 'active',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCostCenters(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = costCenterKeys.all(franchiseId, storeId);

  const {
    data: costCenters = [],
    isLoading: loadingCostCenters,
    error: costCentersError,
    refetch: refetchCostCenters,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = centersRef(franchiseId, storeId);
      const q = query(ref, orderBy('name', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeCenter(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateCostCenterInput) => {
      const ref = doc(centersRef(franchiseId, storeId));
      await setDoc(ref, {
        name: input.name,
        status: input.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Centro de custo criado');
    },
    onError: () => toast.error('Erro ao criar centro de custo'),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateCostCenterInput) => {
      const { centerId, ...rest } = input;
      const ref = centerDocRef(franchiseId, storeId, centerId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.name !== undefined) data.name = rest.name;
      if (rest.status !== undefined) data.status = rest.status;
      await updateDoc(ref, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Centro de custo atualizado');
    },
    onError: () => toast.error('Erro ao atualizar centro de custo'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (centerId: string) => {
      await deleteDoc(centerDocRef(franchiseId, storeId, centerId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Centro de custo excluído');
    },
    onError: () => toast.error('Erro ao excluir centro de custo'),
  });

  const activeCostCenters = useMemo(
    () => costCenters.filter((c) => c.status === 'active'),
    [costCenters],
  );

  return {
    costCenters,
    loadingCostCenters,
    costCentersError,
    refetchCostCenters,
    activeCostCenters,
    createCostCenter: createMutation.mutateAsync,
    isCreatingCostCenter: createMutation.isPending,
    updateCostCenter: updateMutation.mutateAsync,
    isUpdatingCostCenter: updateMutation.isPending,
    deleteCostCenter: deleteMutation.mutateAsync,
    isDeletingCostCenter: deleteMutation.isPending,
  };
}
