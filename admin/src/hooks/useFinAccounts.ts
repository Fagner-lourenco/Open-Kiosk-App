/**
 * ============================================================================
 * useFinAccounts — CRUD para Contas Financeiras (Caixa / Banco / Pix)
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finAccounts/{accountId}
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
import type { FinAccount, FinAccountType, FinAccountStatus } from '@/types/finance';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const finAccountKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['finAccounts', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateFinAccountInput {
  name: string;
  type: FinAccountType;
  currency?: string;
  openingBalance?: number;
  openingAt?: Date;
  status?: FinAccountStatus;
}

export interface UpdateFinAccountInput {
  accountId: string;
  name?: string;
  type?: FinAccountType;
  currency?: string;
  openingBalance?: number;
  openingAt?: Date;
  status?: FinAccountStatus;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function accountsRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'accounts'));
}

function accountDocRef(franchiseId: string, storeId: string, accountId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'accounts', accountId));
}

function normalizeAccount(id: string, data: Record<string, unknown>): FinAccount {
  return {
    id,
    name: (data.name as string) || '',
    type: (data.type as FinAccountType) || 'cash',
    currency: (data.currency as string) || 'BRL',
    openingBalance: (data.openingBalance as number) || 0,
    openingAt: data.openingAt as Timestamp | undefined,
    status: (data.status as FinAccountStatus) || 'active',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFinAccounts(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = finAccountKeys.all(franchiseId, storeId);

  // ── List ────────────────────────────────────────────────────────────────

  const {
    data: accounts = [],
    isLoading: loadingAccounts,
    error: accountsError,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = accountsRef(franchiseId, storeId);
      const q = query(ref, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeAccount(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Create ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (input: CreateFinAccountInput) => {
      const ref = doc(accountsRef(franchiseId, storeId));
      const data: Record<string, unknown> = {
        name: input.name,
        type: input.type,
        currency: input.currency || 'BRL',
        openingBalance: input.openingBalance ?? 0,
        status: input.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (input.openingAt) {
        data.openingAt = Timestamp.fromDate(input.openingAt);
      }
      await setDoc(ref, data);
      return ref.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta criada com sucesso');
    },
    onError: () => {
      toast.error('Erro ao criar conta');
    },
  });

  // ── Update ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateFinAccountInput) => {
      const { accountId, ...rest } = input;
      const ref = accountDocRef(franchiseId, storeId, accountId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.name !== undefined) data.name = rest.name;
      if (rest.type !== undefined) data.type = rest.type;
      if (rest.currency !== undefined) data.currency = rest.currency;
      if (rest.openingBalance !== undefined) data.openingBalance = rest.openingBalance;
      if (rest.status !== undefined) data.status = rest.status;
      if (rest.openingAt !== undefined) {
        data.openingAt = Timestamp.fromDate(rest.openingAt);
      }
      await updateDoc(ref, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta atualizada com sucesso');
    },
    onError: () => {
      toast.error('Erro ao atualizar conta');
    },
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const ref = accountDocRef(franchiseId, storeId, accountId);
      await deleteDoc(ref);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta excluída com sucesso');
    },
    onError: () => {
      toast.error('Erro ao excluir conta');
    },
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.status === 'active'),
    [accounts],
  );

  const totalBalance = useMemo(
    () => activeAccounts.reduce((sum, a) => sum + a.openingBalance, 0),
    [activeAccounts],
  );

  return {
    accounts,
    loadingAccounts,
    accountsError,
    refetchAccounts,
    activeAccounts,
    totalBalance,
    createAccount: createMutation.mutateAsync,
    isCreatingAccount: createMutation.isPending,
    updateAccount: updateMutation.mutateAsync,
    isUpdatingAccount: updateMutation.isPending,
    deleteAccount: deleteMutation.mutateAsync,
    isDeletingAccount: deleteMutation.isPending,
  };
}
