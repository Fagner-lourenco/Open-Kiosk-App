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
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
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

const FIN_ACCOUNT_TYPES: FinAccountType[] = ['cash', 'bank', 'pix', 'card_clearing'];
const FIN_ACCOUNT_STATUSES: FinAccountStatus[] = ['active', 'inactive'];

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeAccount(id: string, data: Record<string, unknown>): FinAccount {
  const type = data.type as FinAccountType;
  const status = data.status as FinAccountStatus;

  return {
    id,
    name: (data.name as string) || '',
    type: FIN_ACCOUNT_TYPES.includes(type) ? type : 'cash',
    currency: (data.currency as string) || 'BRL',
    openingBalance: toNumber(data.openingBalance, 0),
    openingAt: data.openingAt instanceof Timestamp ? data.openingAt : undefined,
    status: FIN_ACCOUNT_STATUSES.includes(status) ? status : 'active',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFinAccounts(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = finAccountKeys.all(franchiseId, storeId);
  const { log: audit } = useAudit();

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
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta criada com sucesso');
      audit(AuditActions.FIN_ACCOUNT_CREATE, { type: 'fin_account', id: _id, name: variables.name }, { accountType: variables.type, storeId });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta atualizada com sucesso');
      audit(AuditActions.FIN_ACCOUNT_UPDATE, { type: 'fin_account', id: variables.accountId, name: variables.name || variables.accountId }, { storeId });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Conta excluída com sucesso');
      audit(AuditActions.FIN_ACCOUNT_DELETE, { type: 'fin_account', id: variables, name: variables }, { storeId });
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
