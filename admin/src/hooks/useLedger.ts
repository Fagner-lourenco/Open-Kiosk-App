/**
 * ============================================================================
 * useLedger — CRUD para Lançamentos Financeiros (Ledger Entries)
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finLedger/{entryId}
 * Fonte da verdade financeira — todo movimento passa pelo ledger.
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
import type {
  LedgerEntry,
  LedgerDirection,
  LedgerStatus,
  PaymentMethod,
  LedgerSourceType,
} from '@/types/finance';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const ledgerKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['ledger', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateLedgerEntryInput {
  direction: LedgerDirection;
  status?: LedgerStatus;
  competenceDate: Date;
  cashDate?: Date;
  amount: number;
  accountId: string;
  categoryId: string;
  costCenterId?: string;
  partyId?: string;
  method: PaymentMethod;
  sourceType: LedgerSourceType;
  sourceId: string;
  description: string;
  attachments?: string[];
  createdBy: string;
}

export interface UpdateLedgerEntryInput {
  entryId: string;
  direction?: LedgerDirection;
  status?: LedgerStatus;
  competenceDate?: Date;
  cashDate?: Date;
  amount?: number;
  accountId?: string;
  categoryId?: string;
  costCenterId?: string;
  partyId?: string;
  method?: PaymentMethod;
  description?: string;
  attachments?: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ledgerRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'ledger'));
}

function ledgerDocRef(franchiseId: string, storeId: string, entryId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'ledger', entryId));
}

function normalizeEntry(id: string, data: Record<string, unknown>): LedgerEntry {
  return {
    id,
    direction: (data.direction as LedgerDirection) || 'out',
    status: (data.status as LedgerStatus) || 'pending',
    competenceDate: data.competenceDate as Timestamp,
    cashDate: data.cashDate as Timestamp | undefined,
    amount: (data.amount as number) || 0,
    accountId: (data.accountId as string) || '',
    categoryId: (data.categoryId as string) || '',
    costCenterId: data.costCenterId as string | undefined,
    partyId: data.partyId as string | undefined,
    method: (data.method as PaymentMethod) || 'pix',
    sourceType: (data.sourceType as LedgerSourceType) || 'manual',
    sourceId: (data.sourceId as string) || '',
    description: (data.description as string) || '',
    attachments: (data.attachments as string[]) || [],
    createdBy: (data.createdBy as string) || '',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useLedger(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = ledgerKeys.all(franchiseId, storeId);
  const { log: audit } = useAudit();

  const {
    data: entries = [],
    isLoading: loadingEntries,
    error: entriesError,
    refetch: refetchEntries,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = ledgerRef(franchiseId, storeId);
      const q = query(ref, orderBy('competenceDate', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeEntry(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateLedgerEntryInput) => {
      const ref = doc(ledgerRef(franchiseId, storeId));
      const data: Record<string, unknown> = {
        direction: input.direction,
        status: input.status || 'pending',
        competenceDate: Timestamp.fromDate(input.competenceDate),
        amount: input.amount,
        accountId: input.accountId,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId || null,
        partyId: input.partyId || null,
        method: input.method,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        description: input.description,
        attachments: input.attachments || [],
        createdBy: input.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (input.cashDate) {
        data.cashDate = Timestamp.fromDate(input.cashDate);
      }
      await setDoc(ref, data);
      return ref.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Lançamento criado');
      audit(AuditActions.LEDGER_CREATE, { type: 'ledger', id: _id, name: variables.description }, { direction: variables.direction, amount: variables.amount, storeId });
    },
    onError: () => toast.error('Erro ao criar lançamento'),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateLedgerEntryInput) => {
      const { entryId, ...rest } = input;
      const ref = ledgerDocRef(franchiseId, storeId, entryId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.direction !== undefined) data.direction = rest.direction;
      if (rest.status !== undefined) data.status = rest.status;
      if (rest.competenceDate !== undefined) {
        data.competenceDate = Timestamp.fromDate(rest.competenceDate);
      }
      if (rest.cashDate !== undefined) {
        data.cashDate = rest.cashDate ? Timestamp.fromDate(rest.cashDate) : null;
      }
      if (rest.amount !== undefined) data.amount = rest.amount;
      if (rest.accountId !== undefined) data.accountId = rest.accountId;
      if (rest.categoryId !== undefined) data.categoryId = rest.categoryId;
      if (rest.costCenterId !== undefined) data.costCenterId = rest.costCenterId || null;
      if (rest.partyId !== undefined) data.partyId = rest.partyId || null;
      if (rest.method !== undefined) data.method = rest.method;
      if (rest.description !== undefined) data.description = rest.description;
      if (rest.attachments !== undefined) data.attachments = rest.attachments;
      await updateDoc(ref, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Lançamento atualizado');
      audit(AuditActions.LEDGER_UPDATE, { type: 'ledger', id: variables.entryId, name: variables.description || variables.entryId }, { storeId });
    },
    onError: () => toast.error('Erro ao atualizar lançamento'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await deleteDoc(ledgerDocRef(franchiseId, storeId, entryId));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Lançamento excluído');
      audit(AuditActions.LEDGER_DELETE, { type: 'ledger', id: variables, name: variables }, { storeId });
    },
    onError: () => toast.error('Erro ao excluir lançamento'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const incomeEntries = useMemo(
    () => entries.filter((e) => e.direction === 'in'),
    [entries],
  );

  const expenseEntries = useMemo(
    () => entries.filter((e) => e.direction === 'out'),
    [entries],
  );

  const totalIncome = useMemo(
    () => incomeEntries.reduce((s, e) => s + e.amount, 0),
    [incomeEntries],
  );

  const totalExpenses = useMemo(
    () => expenseEntries.reduce((s, e) => s + e.amount, 0),
    [expenseEntries],
  );

  const balance = useMemo(() => totalIncome - totalExpenses, [totalIncome, totalExpenses]);

  const pendingEntries = useMemo(
    () => entries.filter((e) => e.status === 'pending'),
    [entries],
  );

  return {
    entries,
    loadingEntries,
    entriesError,
    refetchEntries,
    incomeEntries,
    expenseEntries,
    totalIncome,
    totalExpenses,
    balance,
    pendingEntries,
    createEntry: createMutation.mutateAsync,
    isCreatingEntry: createMutation.isPending,
    updateEntry: updateMutation.mutateAsync,
    isUpdatingEntry: updateMutation.isPending,
    deleteEntry: deleteMutation.mutateAsync,
    isDeletingEntry: deleteMutation.isPending,
  };
}
