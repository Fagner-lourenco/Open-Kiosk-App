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
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
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
  const VALID_DIRECTIONS: FinPaymentDirection[] = ['in', 'out'];
  const VALID_METHODS: PaymentMethod[] = ['pix', 'card', 'cash', 'transfer'];
  const VALID_TARGET_TYPES: FinPaymentTargetType[] = ['invoice', 'bill', 'ledger'];

  return {
    id,
    direction: VALID_DIRECTIONS.includes(data.direction as FinPaymentDirection) ? (data.direction as FinPaymentDirection) : 'out',
    date: data.date as Timestamp,
    amount: Number(data.amount) || 0,
    method: VALID_METHODS.includes(data.method as PaymentMethod) ? (data.method as PaymentMethod) : 'pix',
    accountId: (data.accountId as string) || '',
    targetType: VALID_TARGET_TYPES.includes(data.targetType as FinPaymentTargetType) ? (data.targetType as FinPaymentTargetType) : 'ledger',
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
  const { log: audit } = useAudit();

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
      if (!input.amount || input.amount <= 0) throw new Error('amount deve ser maior que zero');
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
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Pagamento registrado');
      audit(AuditActions.PAYMENT_CREATE, { type: 'payment', id: _id, name: _id }, { amount: variables.amount, method: variables.method, direction: variables.direction, storeId });
    },
    onError: () => toast.error('Erro ao registrar pagamento'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await deleteDoc(paymentDocRef(franchiseId, storeId, paymentId));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Pagamento excluído');
      audit(AuditActions.PAYMENT_DELETE, { type: 'payment', id: variables, name: variables }, { storeId });
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
