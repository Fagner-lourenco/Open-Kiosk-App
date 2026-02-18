/**
 * ============================================================================
 * useQuotes Hook — Quote CRUD + Quote Lines
 * ============================================================================
 *
 * Hook para gerenciar propostas/cotações de uma loja.
 * Path: franchises/{fId}/stores/{sId}/quotes/{quoteId}
 * Subcoleção: lines/{lineId}
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
import { useToast } from '@/hooks/useToast';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import type {
  Quote,
  QuoteStatus,
  QuoteLine,
  QuoteLineType,
} from '@/types/commercial';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const quoteKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['quotes', franchiseId, storeId] as const,
  lines: (franchiseId: string, storeId: string, quoteId: string) =>
    ['quotes', franchiseId, storeId, quoteId, 'lines'] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function quotesRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'quotes');
}

function quoteDocRef(franchiseId: string, storeId: string, quoteId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'quotes', quoteId);
}

function quoteLinesRef(franchiseId: string, storeId: string, quoteId: string) {
  return collection(
    db,
    'franchises',
    franchiseId,
    'stores',
    storeId,
    'quotes',
    quoteId,
    'lines'
  );
}

function quoteLineDocRef(
  franchiseId: string,
  storeId: string,
  quoteId: string,
  lineId: string
) {
  return doc(
    db,
    'franchises',
    franchiseId,
    'stores',
    storeId,
    'quotes',
    quoteId,
    'lines',
    lineId
  );
}

const VALID_QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

function normalizeQuote(id: string, data: Record<string, unknown>): Quote {
  const st = data.status as string;
  return {
    id,
    customerId: (data.customerId as string) || '',
    dealId: data.dealId as string | undefined,
    eventId: data.eventId as string | undefined,
    status: VALID_QUOTE_STATUSES.includes(st as QuoteStatus) ? (st as QuoteStatus) : 'draft',
    validUntil: data.validUntil as Timestamp | undefined,
    subtotal: Number(data.subtotal) || 0,
    discounts: Number(data.discounts) || 0,
    fees: Number(data.fees) || 0,
    total: Number(data.total) || 0,
    paymentTerms: data.paymentTerms as string | undefined,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

function normalizeQuoteLine(id: string, data: Record<string, unknown>): QuoteLine {
  return {
    id,
    type: (data.type as QuoteLineType) || 'service',
    description: (data.description as string) || '',
    qty: (data.qty as number) || 0,
    unitPrice: (data.unitPrice as number) || 0,
    total: (data.total as number) || 0,
    productId: data.productId as string | undefined,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface CreateQuoteInput {
  customerId: string;
  dealId?: string;
  eventId?: string;
  status?: QuoteStatus;
  validUntil?: Date;
  paymentTerms?: string;
}

export interface UpdateQuoteInput {
  quoteId: string;
  customerId?: string;
  dealId?: string | null;
  eventId?: string | null;
  status?: QuoteStatus;
  validUntil?: Date | null;
  subtotal?: number;
  discounts?: number;
  fees?: number;
  total?: number;
  paymentTerms?: string | null;
}

export interface CreateQuoteLineInput {
  quoteId: string;
  type: QuoteLineType;
  description: string;
  qty: number;
  unitPrice: number;
  productId?: string;
}

export interface UpdateQuoteLineInput {
  quoteId: string;
  lineId: string;
  type?: QuoteLineType;
  description?: string;
  qty?: number;
  unitPrice?: number;
  productId?: string | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useQuotes(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { log: audit } = useAudit();

  // ── Fetch all quotes ────────────────────────────────────────────────────
  const {
    data: quotes = [],
    isLoading: loadingQuotes,
    error: quotesError,
    refetch: refetchQuotes,
  } = useQuery({
    queryKey: quoteKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<Quote[]> => {
      const ref = quotesRef(franchiseId, storeId);
      const q = query(ref, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeQuote(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
    refetchOnWindowFocus: true,
  });

  // ── Create quote ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateQuoteInput) => {
      const newRef = doc(quotesRef(franchiseId, storeId));
      const now = serverTimestamp();
      await setDoc(newRef, {
        customerId: input.customerId,
        dealId: input.dealId || null,
        eventId: input.eventId || null,
        status: input.status || 'draft',
        validUntil: input.validUntil ? Timestamp.fromDate(input.validUntil) : null,
        subtotal: 0,
        discounts: 0,
        fees: 0,
        total: 0,
        paymentTerms: input.paymentTerms || null,
        createdAt: now,
        updatedAt: now,
      });
      return newRef.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(franchiseId, storeId) });
      toast.success('Proposta criada com sucesso');
      audit(AuditActions.QUOTE_CREATE, { type: 'quote', id: _id, name: _id }, { customerId: variables.customerId, storeId });
    },
    onError: () => {
      toast.error('Erro ao criar proposta');
    },
  });

  // ── Update quote ────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateQuoteInput) => {
      const { quoteId, ...fields } = input;
      const ref = quoteDocRef(franchiseId, storeId, quoteId);

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
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(franchiseId, storeId) });
      toast.success('Proposta atualizada');
      audit(AuditActions.QUOTE_UPDATE, { type: 'quote', id: variables.quoteId, name: variables.quoteId }, { storeId });
    },
    onError: () => {
      toast.error('Erro ao atualizar proposta');
    },
  });

  // ── Delete quote ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      // Cascade: delete lines subcollection first
      const linesSnap = await getDocs(quoteLinesRef(franchiseId, storeId, quoteId));
      for (const lineDoc of linesSnap.docs) {
        await deleteDoc(lineDoc.ref);
      }
      const ref = quoteDocRef(franchiseId, storeId, quoteId);
      await deleteDoc(ref);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all(franchiseId, storeId) });
      toast.success('Proposta excluída');
      audit(AuditActions.QUOTE_DELETE, { type: 'quote', id: variables, name: variables }, { storeId });
    },
    onError: () => {
      toast.error('Erro ao excluir proposta');
    },
  });

  // ── Quote Lines — fetch for one quote ───────────────────────────────────
  const fetchQuoteLines = async (quoteId: string): Promise<QuoteLine[]> => {
    const ref = quoteLinesRef(franchiseId, storeId, quoteId);
    const snap = await getDocs(query(ref));
    return snap.docs.map((d) => normalizeQuoteLine(d.id, d.data()));
  };

  // ── Quote Lines — create ────────────────────────────────────────────────
  const createLineMutation = useMutation({
    mutationFn: async (input: CreateQuoteLineInput) => {
      const ref = quoteLinesRef(franchiseId, storeId, input.quoteId);
      const newRef = doc(ref);
      await setDoc(newRef, {
        type: input.type,
        description: input.description,
        qty: input.qty,
        unitPrice: input.unitPrice,
        total: input.qty * input.unitPrice,
        productId: input.productId || null,
      });
      return newRef.id;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: quoteKeys.lines(franchiseId, storeId, variables.quoteId),
      });
      toast.success('Item adicionado à proposta');
    },
    onError: () => {
      toast.error('Erro ao adicionar item');
    },
  });

  // ── Quote Lines — update ────────────────────────────────────────────────
  const updateLineMutation = useMutation({
    mutationFn: async (input: UpdateQuoteLineInput) => {
      const { quoteId, lineId, ...fields } = input;
      const ref = quoteLineDocRef(franchiseId, storeId, quoteId, lineId);
      const cleanFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        cleanFields[key] = value === null ? null : value;
      }
      // Recalculate total when any operand is explicitly provided.
      const hasQty = typeof cleanFields.qty === 'number';
      const hasUnitPrice = typeof cleanFields.unitPrice === 'number';
      if (hasQty || hasUnitPrice) {
        if (!hasQty || !hasUnitPrice) {
          const { getDoc } = await import('firebase/firestore');
          const snap = await getDoc(ref);
          const cur = snap.data() || {};
          if (!hasQty) cleanFields.qty = cur.qty ?? 0;
          if (!hasUnitPrice) cleanFields.unitPrice = cur.unitPrice ?? 0;
        }
        const qty = cleanFields.qty as number;
        const unitPrice = cleanFields.unitPrice as number;
        cleanFields.total = qty * unitPrice;
      }
      await updateDoc(ref, cleanFields);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: quoteKeys.lines(franchiseId, storeId, variables.quoteId),
      });
      toast.success('Item atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar item');
    },
  });

  // ── Quote Lines — delete ────────────────────────────────────────────────
  const deleteLineMutation = useMutation({
    mutationFn: async ({ quoteId, lineId }: { quoteId: string; lineId: string }) => {
      const ref = quoteLineDocRef(franchiseId, storeId, quoteId, lineId);
      await deleteDoc(ref);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: quoteKeys.lines(franchiseId, storeId, variables.quoteId),
      });
      toast.success('Item removido da proposta');
    },
    onError: () => {
      toast.error('Erro ao remover item');
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const draftQuotes = quotes.filter((q) => q.status === 'draft');
  const sentQuotes = quotes.filter((q) => q.status === 'sent');
  const acceptedQuotes = quotes.filter((q) => q.status === 'accepted');

  const totalAcceptedValue = acceptedQuotes.reduce((sum, q) => sum + q.total, 0);

  return {
    quotes,
    loadingQuotes,
    quotesError,
    refetchQuotes,
    draftQuotes,
    sentQuotes,
    acceptedQuotes,
    totalAcceptedValue,

    createQuote: createMutation.mutateAsync,
    isCreatingQuote: createMutation.isPending,

    updateQuote: updateMutation.mutateAsync,
    isUpdatingQuote: updateMutation.isPending,

    deleteQuote: deleteMutation.mutateAsync,
    isDeletingQuote: deleteMutation.isPending,

    fetchQuoteLines,

    createQuoteLine: createLineMutation.mutateAsync,
    isCreatingLine: createLineMutation.isPending,

    updateQuoteLine: updateLineMutation.mutateAsync,
    isUpdatingLine: updateLineMutation.isPending,

    deleteQuoteLine: deleteLineMutation.mutateAsync,
    isDeletingLine: deleteLineMutation.isPending,
  };
}
