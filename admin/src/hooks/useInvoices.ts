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
  getDoc,
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
import { roundCurrency } from '@/utils/currency';
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

const VALID_INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'canceled'];

function normalizeInvoice(id: string, data: Record<string, unknown>): Invoice {
  const st = data.status as string;
  return {
    id,
    partyId: (data.partyId as string) || '',
    status: VALID_INVOICE_STATUSES.includes(st as InvoiceStatus) ? (st as InvoiceStatus) : 'draft',
    issueDate: data.issueDate as Timestamp,
    dueDate: data.dueDate as Timestamp,
    subtotal: Number(data.subtotal) || 0,
    discounts: Number(data.discounts) || 0,
    fees: Number(data.fees) || 0,
    total: Number(data.total) || 0,
    paidTotal: Number(data.paidTotal) || 0,
    remaining: Number(data.remaining) || 0,
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
    qty: Number(data.qty) || 0,
    unitPrice: Number(data.unitPrice) || 0,
    total: Number(data.total) || 0,
    categoryId: data.categoryId as string | undefined,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useInvoices(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = invoiceKeys.all(franchiseId, storeId);
  const { log: audit } = useAudit();

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
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Fatura criada');
      audit(AuditActions.INVOICE_CREATE, { type: 'invoice', id: _id, name: _id }, { partyId: variables.partyId, total: variables.total, storeId });
    },
    onError: () => toast.error('Erro ao criar fatura'),
  });

  // ── Update ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInvoiceInput) => {
      const { invoiceId, ...rest } = input;
      const ref = invoiceDocRef(franchiseId, storeId, invoiceId);

      // [FIX BUG-F10] Guard: impedir edição de faturas pagas ou canceladas
      const currentDoc = await getDoc(ref);
      const currentStatus = currentDoc.data()?.status;
      if (currentStatus === 'paid' && rest.status !== 'paid') {
        throw new Error('Fatura já está paga. Apenas o status pode ser revertido.');
      }
      if (currentStatus === 'canceled') {
        throw new Error('Fatura cancelada não pode ser editada');
      }

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

      // Recalcular remaining automaticamente quando total ou paidTotal mudam
      if ((rest.total !== undefined || rest.paidTotal !== undefined) && rest.remaining === undefined) {
        const currentDoc = await getDoc(ref);
        const currentData = currentDoc.data();
        const effectiveTotal = rest.total ?? currentData?.total ?? 0;
        const effectivePaid = rest.paidTotal ?? currentData?.paidTotal ?? 0;
        data.remaining = effectiveTotal - effectivePaid;
      }

      await updateDoc(ref, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Fatura atualizada');
      audit(AuditActions.INVOICE_UPDATE, { type: 'invoice', id: variables.invoiceId, name: variables.invoiceId }, { status: variables.status, storeId });
    },
    onError: () => toast.error('Erro ao atualizar fatura'),
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      // [FIX BUG-F11] Guard: impedir exclusão de faturas pagas
      const ref = invoiceDocRef(franchiseId, storeId, invoiceId);
      const currentDoc = await getDoc(ref);
      const currentStatus = currentDoc.data()?.status;
      if (currentStatus === 'paid') {
        throw new Error('Fatura paga não pode ser excluída');
      }
      await deleteDoc(ref);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Fatura excluída');
      audit(AuditActions.INVOICE_DELETE, { type: 'invoice', id: variables, name: variables }, { storeId });
    },
    onError: () => toast.error('Erro ao excluir fatura'),
  });

  // ── Invoice Lines (on-demand, cached via React Query) ────────────────

  const fetchInvoiceLines = useCallback(
    async (invoiceId: string): Promise<InvoiceLine[]> => {
      return queryClient.fetchQuery({
        queryKey: ['invoiceLines', franchiseId, storeId, invoiceId],
        queryFn: async () => {
          const ref = invoiceLinesRef(franchiseId, storeId, invoiceId);
          const snap = await getDocs(ref);
          return snap.docs.map((d) => normalizeInvoiceLine(d.id, d.data()));
        },
        staleTime: 30_000, // 30 s cache
      });
    },
    [franchiseId, storeId, queryClient],
  );

  const createLineMutation = useMutation({
    mutationFn: async (input: CreateInvoiceLineInput) => {
      const ref = doc(invoiceLinesRef(franchiseId, storeId, input.invoiceId));
      const total = roundCurrency(input.qty * input.unitPrice);
      await setDoc(ref, {
        description: input.description,
        qty: input.qty,
        unitPrice: input.unitPrice,
        total,
        categoryId: input.categoryId || null,
      });
      return ref.id;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoiceLines', franchiseId, storeId, variables.invoiceId] });
      toast.success('Item adicionado');
    },
    onError: () => toast.error('Erro ao adicionar item'),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async ({ invoiceId, lineId }: { invoiceId: string; lineId: string }) => {
      await deleteDoc(invoiceLineDocRef(franchiseId, storeId, invoiceId, lineId));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoiceLines', franchiseId, storeId, variables.invoiceId] });
      toast.success('Item removido');
    },
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
    // [FIX BUG-F07] Excluir invoices canceladas do total recebido
    () => invoices
      .filter((i) => i.status !== 'canceled')
      .reduce((s, i) => s + i.paidTotal, 0),
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
