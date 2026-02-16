/**
 * ============================================================================
 * useFinPayments — CRUD para Pagamentos (Baixas de AR/AP → Ledger)
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finPayments/{paymentId}
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
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { financeSubPath, financeDocPath } from '@/lib/pathResolver';
import { toast } from 'sonner';
import type {
  FinPayment,
  FinPaymentDirection,
  FinPaymentTargetType,
  PaymentMethod,
} from '@/types/finance';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const finPaymentKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['finPayments', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateFinPaymentInput {
  direction: FinPaymentDirection;
  date: Date;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  targetType: FinPaymentTargetType;
  targetId: string;
  notes?: string;
  createdBy: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function paymentsRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'finPayments'));
}

function paymentDocRef(franchiseId: string, storeId: string, paymentId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'finPayments', paymentId));
}

function normalizePayment(id: string, data: Record<string, unknown>): FinPayment {
  return {
    id,
    direction: (data.direction as FinPaymentDirection) || 'out',
    date: data.date as Timestamp,
    amount: (data.amount as number) || 0,
    method: (data.method as PaymentMethod) || 'pix',
    accountId: (data.accountId as string) || '',
    targetType: (data.targetType as FinPaymentTargetType) || 'ledger',
    targetId: (data.targetId as string) || '',
    notes: data.notes as string | undefined,
    createdBy: (data.createdBy as string) || '',
    createdAt: data.createdAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFinPayments(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = finPaymentKeys.all(franchiseId, storeId);

  const {
    data: payments = [],
    isLoading: loadingPayments,
    error: paymentsError,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = paymentsRef(franchiseId, storeId);
      const q = query(ref, orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizePayment(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateFinPaymentInput) => {
      const ref = doc(paymentsRef(franchiseId, storeId));
      await setDoc(ref, {
        direction: input.direction,
        date: Timestamp.fromDate(input.date),
        amount: input.amount,
        method: input.method,
        accountId: input.accountId,
        targetType: input.targetType,
        targetId: input.targetId,
        notes: input.notes || null,
        createdBy: input.createdBy,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Pagamento registrado');
    },
    onError: () => toast.error('Erro ao registrar pagamento'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await deleteDoc(paymentDocRef(franchiseId, storeId, paymentId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Pagamento excluído');
    },
    onError: () => toast.error('Erro ao excluir pagamento'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const inPayments = useMemo(
    () => payments.filter((p) => p.direction === 'in'),
    [payments],
  );

  const outPayments = useMemo(
    () => payments.filter((p) => p.direction === 'out'),
    [payments],
  );

  const totalIn = useMemo(
    () => inPayments.reduce((s, p) => s + p.amount, 0),
    [inPayments],
  );

  const totalOut = useMemo(
    () => outPayments.reduce((s, p) => s + p.amount, 0),
    [outPayments],
  );

  return {
    payments,
    loadingPayments,
    paymentsError,
    refetchPayments,
    inPayments,
    outPayments,
    totalIn,
    totalOut,
    createPayment: createMutation.mutateAsync,
    isCreatingPayment: createMutation.isPending,
    deletePayment: deleteMutation.mutateAsync,
    isDeletingPayment: deleteMutation.isPending,
  };
}
