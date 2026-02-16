/**
 * ============================================================================
 * useInvoices — CRUD para Contas a Receber (AR) + InvoiceLines
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finInvoices/{invoiceId}
 * Subcoleção:     .../finInvoices/{invoiceId}/lines/{lineId}
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useMemo, useCallback } from 'react';
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
import type { Invoice, InvoiceStatus, InvoiceSourceType, InvoiceLine } from '@/types/finance';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const invoiceKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['invoices', franchiseId, storeId] as const,
  lines: (franchiseId: string, storeId: string, invoiceId: string) =>
    ['invoices', franchiseId, storeId, invoiceId, 'lines'] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  partyId: string;
  status?: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  subtotal?: number;
  discounts?: number;
  fees?: number;
  total?: number;
  sourceType?: InvoiceSourceType;
  sourceId?: string;
}

export interface UpdateInvoiceInput {
  invoiceId: string;
  partyId?: string;
  status?: InvoiceStatus;
  issueDate?: Date;
  dueDate?: Date;
  subtotal?: number;
  discounts?: number;
  fees?: number;
  total?: number;
  paidTotal?: number;
  remaining?: number;
}

export interface CreateInvoiceLineInput {
  invoiceId: string;
  description: string;
  qty: number;
  unitPrice: number;
  categoryId?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function invoicesRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'invoices'));
}

function invoiceDocRef(franchiseId: string, storeId: string, invoiceId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'invoices', invoiceId));
}

function invoiceLinesRef(franchiseId: string, storeId: string, invoiceId: string) {
  return collection(
    db,
    `${financeSubPath(franchiseId, storeId, 'invoices')}/${invoiceId}/lines`,
  );
}

function invoiceLineDocRef(
  franchiseId: string,
  storeId: string,
  invoiceId: string,
  lineId: string,
) {
  return doc(
    db,
    `${financeSubPath(franchiseId, storeId, 'invoices')}/${invoiceId}/lines/${lineId}`,
  );
}

function normalizeInvoice(id: string, data: Record<string, unknown>): Invoice {
  return {
    id,
    partyId: (data.partyId as string) || '',
    status: (data.status as InvoiceStatus) || 'draft',
    issueDate: data.issueDate as Timestamp,
    dueDate: data.dueDate as Timestamp,
    subtotal: (data.subtotal as number) || 0,
    discounts: (data.discounts as number) || 0,
    fees: (data.fees as number) || 0,
    total: (data.total as number) || 0,
    paidTotal: (data.paidTotal as number) || 0,
    remaining: (data.remaining as number) || 0,
    sourceType: (data.sourceType as InvoiceSourceType) || 'manual',
    sourceId: data.sourceId as string | undefined,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

function normalizeInvoiceLine(id: string, data: Record<string, unknown>): InvoiceLine {
  return {
    id,
    description: (data.description as string) || '',
    qty: (data.qty as number) || 0,
    unitPrice: (data.unitPrice as number) || 0,
    total: (data.total as number) || 0,
    categoryId: data.categoryId as string | undefined,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useInvoices(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = invoiceKeys.all(franchiseId, storeId);

  // ── List ────────────────────────────────────────────────────────────────

  const {
    data: invoices = [],
    isLoading: loadingInvoices,
    error: invoicesError,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = invoicesRef(franchiseId, storeId);
      const q = query(ref, orderBy('dueDate', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeInvoice(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Create ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const ref = doc(invoicesRef(franchiseId, storeId));
      const total = input.total ?? ((input.subtotal || 0) - (input.discounts || 0) + (input.fees || 0));
      await setDoc(ref, {
        partyId: input.partyId,
        status: input.status || 'draft',
        issueDate: Timestamp.fromDate(input.issueDate),
        dueDate: Timestamp.fromDate(input.dueDate),
        subtotal: input.subtotal || 0,
        discounts: input.discounts || 0,
        fees: input.fees || 0,
        total,
        paidTotal: 0,
        remaining: total,
        sourceType: input.sourceType || 'manual',
        sourceId: input.sourceId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Fatura criada');
    },
    onError: () => toast.error('Erro ao criar fatura'),
  });

  // ── Update ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInvoiceInput) => {
      const { invoiceId, ...rest } = input;
      const ref = invoiceDocRef(franchiseId, storeId, invoiceId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.partyId !== undefined) data.partyId = rest.partyId;
      if (rest.status !== undefined) data.status = rest.status;
      if (rest.issueDate !== undefined) data.issueDate = Timestamp.fromDate(rest.issueDate);
      if (rest.dueDate !== undefined) data.dueDate = Timestamp.fromDate(rest.dueDate);
      if (rest.subtotal !== undefined) data.subtotal = rest.subtotal;
      if (rest.discounts !== undefined) data.discounts = rest.discounts;
      if (rest.fees !== undefined) data.fees = rest.fees;
      if (rest.total !== undefined) data.total = rest.total;
      if (rest.paidTotal !== undefined) data.paidTotal = rest.paidTotal;
      if (rest.remaining !== undefined) data.remaining = rest.remaining;
      await updateDoc(ref, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Fatura atualizada');
    },
    onError: () => toast.error('Erro ao atualizar fatura'),
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await deleteDoc(invoiceDocRef(franchiseId, storeId, invoiceId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Fatura excluída');
    },
    onError: () => toast.error('Erro ao excluir fatura'),
  });

  // ── Invoice Lines (on-demand) ───────────────────────────────────────────

  const fetchInvoiceLines = useCallback(
    async (invoiceId: string): Promise<InvoiceLine[]> => {
      const ref = invoiceLinesRef(franchiseId, storeId, invoiceId);
      const snap = await getDocs(ref);
      return snap.docs.map((d) => normalizeInvoiceLine(d.id, d.data()));
    },
    [franchiseId, storeId],
  );

  const createLineMutation = useMutation({
    mutationFn: async (input: CreateInvoiceLineInput) => {
      const ref = doc(invoiceLinesRef(franchiseId, storeId, input.invoiceId));
      const total = input.qty * input.unitPrice;
      await setDoc(ref, {
        description: input.description,
        qty: input.qty,
        unitPrice: input.unitPrice,
        total,
        categoryId: input.categoryId || null,
      });
      return ref.id;
    },
    onSuccess: () => toast.success('Item adicionado'),
    onError: () => toast.error('Erro ao adicionar item'),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async ({ invoiceId, lineId }: { invoiceId: string; lineId: string }) => {
      await deleteDoc(invoiceLineDocRef(franchiseId, storeId, invoiceId, lineId));
    },
    onSuccess: () => toast.success('Item removido'),
    onError: () => toast.error('Erro ao remover item'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const overdueInvoices = useMemo(
    () => invoices.filter((i) => i.status === 'overdue'),
    [invoices],
  );

  const totalReceivable = useMemo(
    () => invoices
      .filter((i) => !['paid', 'canceled'].includes(i.status))
      .reduce((s, i) => s + i.remaining, 0),
    [invoices],
  );

  const totalReceived = useMemo(
    () => invoices.reduce((s, i) => s + i.paidTotal, 0),
    [invoices],
  );

  return {
    invoices,
    loadingInvoices,
    invoicesError,
    refetchInvoices,
    overdueInvoices,
    totalReceivable,
    totalReceived,
    createInvoice: createMutation.mutateAsync,
    isCreatingInvoice: createMutation.isPending,
    updateInvoice: updateMutation.mutateAsync,
    isUpdatingInvoice: updateMutation.isPending,
    deleteInvoice: deleteMutation.mutateAsync,
    isDeletingInvoice: deleteMutation.isPending,
    fetchInvoiceLines,
    createInvoiceLine: createLineMutation.mutateAsync,
    isCreatingLine: createLineMutation.isPending,
    deleteInvoiceLine: deleteLineMutation.mutateAsync,
    isDeletingLine: deleteLineMutation.isPending,
  };
}
