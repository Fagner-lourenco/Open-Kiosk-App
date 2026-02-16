/**
 * ============================================================================
 * useCommercialEvents Hook — Commercial Event CRUD + Queries
 * ============================================================================
 *
 * Hook para gerenciar eventos comerciais de uma loja.
 * Path: franchises/{fId}/stores/{sId}/commercialEvents/{eventId}
 * Subcoleção: budgetLines/{lineId}
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
import type {
  CommercialEvent,
  CommercialEventStatus,
  LocationType,
  PricingModel,
  CustomerAddress,
  BudgetLine,
  BudgetLineType,
  PaidBy,
} from '@/types/commercial';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const commercialEventKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['commercialEvents', franchiseId, storeId] as const,
  budgetLines: (franchiseId: string, storeId: string, eventId: string) =>
    ['commercialEvents', franchiseId, storeId, eventId, 'budgetLines'] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function eventsRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'commercialEvents');
}

function eventDocRef(franchiseId: string, storeId: string, eventId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'commercialEvents', eventId);
}

function budgetLinesRef(franchiseId: string, storeId: string, eventId: string) {
  return collection(
    db,
    'franchises',
    franchiseId,
    'stores',
    storeId,
    'commercialEvents',
    eventId,
    'budgetLines'
  );
}

function budgetLineDocRef(
  franchiseId: string,
  storeId: string,
  eventId: string,
  lineId: string
) {
  return doc(
    db,
    'franchises',
    franchiseId,
    'stores',
    storeId,
    'commercialEvents',
    eventId,
    'budgetLines',
    lineId
  );
}

function normalizeEvent(id: string, data: Record<string, unknown>): CommercialEvent {
  return {
    id,
    customerId: (data.customerId as string) || '',
    dealId: data.dealId as string | undefined,
    quoteId: data.quoteId as string | undefined,
    title: (data.title as string) || '',
    description: data.description as string | undefined,
    status: (data.status as CommercialEventStatus) || 'draft',
    locationType: (data.locationType as LocationType) || 'external',
    address: data.address as CustomerAddress | undefined,
    startAt: data.startAt as Timestamp,
    endAt: data.endAt as Timestamp | undefined,
    attendeesEstimate: data.attendeesEstimate as number | undefined,
    pricingModel: data.pricingModel as PricingModel | undefined,
    notesInternal: data.notesInternal as string | undefined,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

function normalizeBudgetLine(id: string, data: Record<string, unknown>): BudgetLine {
  return {
    id,
    type: (data.type as BudgetLineType) || 'beverage',
    categoryId: data.categoryId as string | undefined,
    qty: (data.qty as number) || 0,
    unitCost: (data.unitCost as number) || 0,
    totalCost: (data.totalCost as number) || 0,
    supplierId: data.supplierId as string | undefined,
    paidBy: (data.paidBy as PaidBy) || 'store',
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface CreateEventInput {
  customerId: string;
  dealId?: string;
  quoteId?: string;
  title: string;
  description?: string;
  status?: CommercialEventStatus;
  locationType?: LocationType;
  address?: CustomerAddress;
  startAt: Date;
  endAt?: Date;
  attendeesEstimate?: number;
  pricingModel?: PricingModel;
  notesInternal?: string;
}

export interface UpdateEventInput {
  eventId: string;
  customerId?: string;
  dealId?: string | null;
  quoteId?: string | null;
  title?: string;
  description?: string | null;
  status?: CommercialEventStatus;
  locationType?: LocationType;
  address?: CustomerAddress | null;
  startAt?: Date;
  endAt?: Date | null;
  attendeesEstimate?: number | null;
  pricingModel?: PricingModel | null;
  notesInternal?: string | null;
}

export interface CreateBudgetLineInput {
  eventId: string;
  type: BudgetLineType;
  categoryId?: string;
  qty: number;
  unitCost: number;
  supplierId?: string;
  paidBy?: PaidBy;
}

export interface UpdateBudgetLineInput {
  eventId: string;
  lineId: string;
  type?: BudgetLineType;
  categoryId?: string | null;
  qty?: number;
  unitCost?: number;
  supplierId?: string | null;
  paidBy?: PaidBy;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommercialEvents(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Fetch all events ────────────────────────────────────────────────────
  const {
    data: events = [],
    isLoading: loadingEvents,
    error: eventsError,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: commercialEventKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<CommercialEvent[]> => {
      const ref = eventsRef(franchiseId, storeId);
      const q = query(ref, orderBy('startAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeEvent(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
    refetchOnWindowFocus: true,
  });

  // ── Create event ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const newRef = doc(eventsRef(franchiseId, storeId));
      const now = serverTimestamp();
      await setDoc(newRef, {
        customerId: input.customerId,
        dealId: input.dealId || null,
        quoteId: input.quoteId || null,
        title: input.title,
        description: input.description || null,
        status: input.status || 'draft',
        locationType: input.locationType || 'external',
        address: input.address || null,
        startAt: Timestamp.fromDate(input.startAt),
        endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
        attendeesEstimate: input.attendeesEstimate || null,
        pricingModel: input.pricingModel || null,
        notesInternal: input.notesInternal || null,
        createdAt: now,
        updatedAt: now,
      });
      return newRef.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialEventKeys.all(franchiseId, storeId) });
      toast.success('Evento criado com sucesso');
    },
    onError: () => {
      toast.error('Erro ao criar evento');
    },
  });

  // ── Update event ────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateEventInput) => {
      const { eventId, ...fields } = input;
      const ref = eventDocRef(franchiseId, storeId, eventId);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialEventKeys.all(franchiseId, storeId) });
      toast.success('Evento atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar evento');
    },
  });

  // ── Delete event ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const ref = eventDocRef(franchiseId, storeId, eventId);
      await deleteDoc(ref);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialEventKeys.all(franchiseId, storeId) });
      toast.success('Evento excluído');
    },
    onError: () => {
      toast.error('Erro ao excluir evento');
    },
  });

  // ── Budget Lines — fetch for one event ──────────────────────────────────
  const fetchBudgetLines = async (eventId: string): Promise<BudgetLine[]> => {
    const ref = budgetLinesRef(franchiseId, storeId, eventId);
    const snap = await getDocs(query(ref));
    return snap.docs.map((d) => normalizeBudgetLine(d.id, d.data()));
  };

  // ── Budget Lines — create ───────────────────────────────────────────────
  const createBudgetLineMutation = useMutation({
    mutationFn: async (input: CreateBudgetLineInput) => {
      const ref = budgetLinesRef(franchiseId, storeId, input.eventId);
      const newRef = doc(ref);
      await setDoc(newRef, {
        type: input.type,
        categoryId: input.categoryId || null,
        qty: input.qty,
        unitCost: input.unitCost,
        totalCost: input.qty * input.unitCost,
        supplierId: input.supplierId || null,
        paidBy: input.paidBy || 'store',
      });
      return newRef.id;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: commercialEventKeys.budgetLines(franchiseId, storeId, variables.eventId),
      });
      toast.success('Linha de orçamento adicionada');
    },
    onError: () => {
      toast.error('Erro ao adicionar linha de orçamento');
    },
  });

  // ── Budget Lines — update ───────────────────────────────────────────────
  const updateBudgetLineMutation = useMutation({
    mutationFn: async (input: UpdateBudgetLineInput) => {
      const { eventId, lineId, ...fields } = input;
      const ref = budgetLineDocRef(franchiseId, storeId, eventId, lineId);
      const cleanFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        cleanFields[key] = value === null ? null : value;
      }
      // Recalculate totalCost if qty or unitCost changed
      if (cleanFields.qty !== undefined || cleanFields.unitCost !== undefined) {
        const qty = (cleanFields.qty as number) ?? input.qty ?? 0;
        const unitCost = (cleanFields.unitCost as number) ?? input.unitCost ?? 0;
        cleanFields.totalCost = qty * unitCost;
      }
      await updateDoc(ref, cleanFields);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: commercialEventKeys.budgetLines(franchiseId, storeId, variables.eventId),
      });
      toast.success('Linha de orçamento atualizada');
    },
    onError: () => {
      toast.error('Erro ao atualizar linha de orçamento');
    },
  });

  // ── Budget Lines — delete ───────────────────────────────────────────────
  const deleteBudgetLineMutation = useMutation({
    mutationFn: async ({ eventId, lineId }: { eventId: string; lineId: string }) => {
      const ref = budgetLineDocRef(franchiseId, storeId, eventId, lineId);
      await deleteDoc(ref);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: commercialEventKeys.budgetLines(franchiseId, storeId, variables.eventId),
      });
      toast.success('Linha de orçamento excluída');
    },
    onError: () => {
      toast.error('Erro ao excluir linha de orçamento');
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const activeEvents = events.filter(
    (e) => e.status !== 'done' && e.status !== 'canceled'
  );

  const upcomingEvents = events.filter((e) => {
    if (!e.startAt) return false;
    const start = e.startAt instanceof Timestamp ? e.startAt.toDate() : new Date();
    return start >= new Date() && e.status !== 'canceled' && e.status !== 'done';
  });

  return {
    events,
    loadingEvents,
    eventsError,
    refetchEvents,
    activeEvents,
    upcomingEvents,

    createEvent: createMutation.mutateAsync,
    isCreatingEvent: createMutation.isPending,

    updateEvent: updateMutation.mutateAsync,
    isUpdatingEvent: updateMutation.isPending,

    deleteEvent: deleteMutation.mutateAsync,
    isDeletingEvent: deleteMutation.isPending,

    fetchBudgetLines,

    createBudgetLine: createBudgetLineMutation.mutateAsync,
    isCreatingBudgetLine: createBudgetLineMutation.isPending,

    updateBudgetLine: updateBudgetLineMutation.mutateAsync,
    isUpdatingBudgetLine: updateBudgetLineMutation.isPending,

    deleteBudgetLine: deleteBudgetLineMutation.mutateAsync,
    isDeletingBudgetLine: deleteBudgetLineMutation.isPending,
  };
}
