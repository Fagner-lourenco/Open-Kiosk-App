/**
 * ============================================================================
 * useBills — CRUD para Contas a Pagar (AP)
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finBills/{billId}
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
import { financeSubPath, financeDocPath } from '@/lib/pathResolver';
import { toast } from 'sonner';
import type { Bill, BillStatus } from '@/types/finance';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const billKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['bills', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateBillInput {
  partyId: string;
  status?: BillStatus;
  issueDate: Date;
  dueDate: Date;
  total: number;
  categoryId: string;
  costCenterId?: string;
  attachments?: string[];
}

export interface UpdateBillInput {
  billId: string;
  partyId?: string;
  status?: BillStatus;
  issueDate?: Date;
  dueDate?: Date;
  total?: number;
  paidTotal?: number;
  remaining?: number;
  categoryId?: string;
  costCenterId?: string;
  attachments?: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function billsRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'bills'));
}

function billDocRef(franchiseId: string, storeId: string, billId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'bills', billId));
}

function normalizeBill(id: string, data: Record<string, unknown>): Bill {
  return {
    id,
    partyId: (data.partyId as string) || '',
    status: (data.status as BillStatus) || 'draft',
    issueDate: data.issueDate as Timestamp,
    dueDate: data.dueDate as Timestamp,
    total: (data.total as number) || 0,
    paidTotal: (data.paidTotal as number) || 0,
    remaining: (data.remaining as number) || 0,
    categoryId: (data.categoryId as string) || '',
    costCenterId: data.costCenterId as string | undefined,
    attachments: (data.attachments as string[]) || [],
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBills(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = billKeys.all(franchiseId, storeId);

  const {
    data: bills = [],
    isLoading: loadingBills,
    error: billsError,
    refetch: refetchBills,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = billsRef(franchiseId, storeId);
      const q = query(ref, orderBy('dueDate', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeBill(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateBillInput) => {
      const ref = doc(billsRef(franchiseId, storeId));
      await setDoc(ref, {
        partyId: input.partyId,
        status: input.status || 'draft',
        issueDate: Timestamp.fromDate(input.issueDate),
        dueDate: Timestamp.fromDate(input.dueDate),
        total: input.total,
        paidTotal: 0,
        remaining: input.total,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId || null,
        attachments: input.attachments || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta a pagar criada');
    },
    onError: () => toast.error('Erro ao criar conta a pagar'),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateBillInput) => {
      const { billId, ...rest } = input;
      const ref = billDocRef(franchiseId, storeId, billId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.partyId !== undefined) data.partyId = rest.partyId;
      if (rest.status !== undefined) data.status = rest.status;
      if (rest.issueDate !== undefined) data.issueDate = Timestamp.fromDate(rest.issueDate);
      if (rest.dueDate !== undefined) data.dueDate = Timestamp.fromDate(rest.dueDate);
      if (rest.total !== undefined) data.total = rest.total;
      if (rest.paidTotal !== undefined) data.paidTotal = rest.paidTotal;
      if (rest.remaining !== undefined) data.remaining = rest.remaining;
      if (rest.categoryId !== undefined) data.categoryId = rest.categoryId;
      if (rest.costCenterId !== undefined) data.costCenterId = rest.costCenterId || null;
      if (rest.attachments !== undefined) data.attachments = rest.attachments;
      await updateDoc(ref, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta a pagar atualizada');
    },
    onError: () => toast.error('Erro ao atualizar conta a pagar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (billId: string) => {
      await deleteDoc(billDocRef(franchiseId, storeId, billId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta a pagar excluída');
    },
    onError: () => toast.error('Erro ao excluir conta a pagar'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const overdueBills = useMemo(
    () => bills.filter((b) => b.status === 'overdue'),
    [bills],
  );

  const totalPayable = useMemo(
    () => bills
      .filter((b) => !['paid', 'canceled'].includes(b.status))
      .reduce((s, b) => s + b.remaining, 0),
    [bills],
  );

  const totalPaid = useMemo(
    () => bills.reduce((s, b) => s + b.paidTotal, 0),
    [bills],
  );

  return {
    bills,
    loadingBills,
    billsError,
    refetchBills,
    overdueBills,
    totalPayable,
    totalPaid,
    createBill: createMutation.mutateAsync,
    isCreatingBill: createMutation.isPending,
    updateBill: updateMutation.mutateAsync,
    isUpdatingBill: updateMutation.isPending,
    deleteBill: deleteMutation.mutateAsync,
    isDeletingBill: deleteMutation.isPending,
  };
}
