/**
 * ============================================================================
 * useCalendarItems Hook — Calendar CRUD + Queries
 * ============================================================================
 *
 * Hook para gerenciar itens da agenda comercial.
 * Path: franchises/{fId}/stores/{sId}/calendarItems/{itemId}
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
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import type {
  CalendarItem,
  CalendarItemType,
  CalendarItemStatus,
  CalendarRelatedType,
} from '@/types/commercial';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const calendarKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['calendarItems', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function calendarRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'calendarItems');
}

function calendarDocRef(franchiseId: string, storeId: string, itemId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'calendarItems', itemId);
}

/** Converte Firestore doc → CalendarItem */
function normalizeCalendarItem(id: string, data: Record<string, unknown>): CalendarItem {
  return {
    id,
    type: (data.type as CalendarItemType) || 'task',
    title: (data.title as string) || '',
    startAt: data.startAt as Timestamp,
    endAt: data.endAt as Timestamp | undefined,
    allDay: (data.allDay as boolean) || false,
    ownerUserId: (data.ownerUserId as string) || '',
    relatedType: data.relatedType as CalendarRelatedType | undefined,
    relatedId: data.relatedId as string | undefined,
    status: (data.status as CalendarItemStatus) || 'tentative',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface CreateCalendarInput {
  type: CalendarItemType;
  title: string;
  startAt: Date;
  endAt?: Date;
  allDay?: boolean;
  relatedType?: CalendarRelatedType;
  relatedId?: string;
  status?: CalendarItemStatus;
}

export interface UpdateCalendarInput {
  itemId: string;
  type?: CalendarItemType;
  title?: string;
  startAt?: Date;
  endAt?: Date | null;
  allDay?: boolean;
  relatedType?: CalendarRelatedType | null;
  relatedId?: string | null;
  status?: CalendarItemStatus;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCalendarItems(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Fetch all calendar items ────────────────────────────────────────────
  const {
    data: calendarItems = [],
    isLoading: loadingCalendar,
    error: calendarError,
    refetch: refetchCalendar,
  } = useQuery({
    queryKey: calendarKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<CalendarItem[]> => {
      const ref = calendarRef(franchiseId, storeId);
      const q = query(ref, orderBy('startAt', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeCalendarItem(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
    refetchOnWindowFocus: true,
  });

  // ── Create calendar item ────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateCalendarInput) => {
      const newRef = doc(calendarRef(franchiseId, storeId));
      const now = serverTimestamp();
      await setDoc(newRef, {
        type: input.type,
        title: input.title,
        startAt: Timestamp.fromDate(input.startAt),
        endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
        allDay: input.allDay || false,
        ownerUserId: user?.uid || '',
        relatedType: input.relatedType || null,
        relatedId: input.relatedId || null,
        status: input.status || 'tentative',
        createdAt: now,
        updatedAt: now,
      });
      return newRef.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all(franchiseId, storeId) });
      toast.success('Item da agenda criado');
    },
    onError: () => {
      toast.error('Erro ao criar item da agenda');
    },
  });

  // ── Update calendar item ────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateCalendarInput) => {
      const { itemId, ...fields } = input;
      const ref = calendarDocRef(franchiseId, storeId, itemId);

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
      queryClient.invalidateQueries({ queryKey: calendarKeys.all(franchiseId, storeId) });
      toast.success('Item da agenda atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar item da agenda');
    },
  });

  // ── Delete calendar item ────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const ref = calendarDocRef(franchiseId, storeId, itemId);
      await deleteDoc(ref);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.all(franchiseId, storeId) });
      toast.success('Item da agenda excluído');
    },
    onError: () => {
      toast.error('Erro ao excluir item da agenda');
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const upcomingItems = calendarItems.filter((item) => {
    if (!item.startAt) return false;
    const startDate = item.startAt instanceof Timestamp ? item.startAt.toDate() : new Date();
    return startDate >= new Date() && item.status !== 'canceled';
  });

  const todayItems = calendarItems.filter((item) => {
    if (!item.startAt) return false;
    const startDate = item.startAt instanceof Timestamp ? item.startAt.toDate() : new Date();
    const today = new Date();
    return (
      startDate.toDateString() === today.toDateString() &&
      item.status !== 'canceled'
    );
  });

  return {
    calendarItems,
    loadingCalendar,
    calendarError,
    refetchCalendar,
    upcomingItems,
    todayItems,

    createCalendarItem: createMutation.mutateAsync,
    isCreatingCalendarItem: createMutation.isPending,

    updateCalendarItem: updateMutation.mutateAsync,
    isUpdatingCalendarItem: updateMutation.isPending,

    deleteCalendarItem: deleteMutation.mutateAsync,
    isDeletingCalendarItem: deleteMutation.isPending,
  };
}
