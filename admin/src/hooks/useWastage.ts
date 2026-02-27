/**
 * ============================================================================
 * useWastage Hook — WastageEvent CRUD + KPIs
 * ============================================================================
 *
 * Gerencia WastageEvents (perdas) para uma loja.
 * - Query com filtros de tipo/data
 * - Criação de novos eventos de perda
 * - KPIs calculados (total ml, custo estimado, % do total, eventos)
 *
 * Path: franchises/{fId}/stores/{sId}/wastageEvents/{id}
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  getDocs,
  doc,
  setDoc,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';

// ============================================================================
// TYPES
// ============================================================================

export type WastageType = 'foam' | 'purge' | 'spill' | 'other' | 'auto';

export interface WastageEvent {
  id: string;
  type: WastageType;
  tapId: string;
  kegId: string | null;
  mlLost: number;
  reason?: string;
  source: 'admin' | 'auto';
  createdAt: Date;
  createdBy: string;
  franchiseId: string;
  storeId: string;
}

export interface CreateWastageInput {
  type: WastageType;
  tapId: string;
  kegId: string | null;
  mlLost: number;
  reason?: string;
}

export interface WastageKPIs {
  totalMl: number;
  totalEvents: number;
  byType: Record<string, { ml: number; count: number }>;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const wastageKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['wastage-events', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function wastageRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'wastageEvents');
}

function normalizeWastage(id: string, data: Record<string, unknown>): WastageEvent {
  const toDate = (v: unknown): Date => {
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
  };
  return {
    id,
    type: (data.type as WastageType) || 'other',
    tapId: (data.tapId as string) || '0',
    kegId: (data.kegId as string) ?? null,
    mlLost: (data.mlLost as number) || 0,
    reason: data.reason as string | undefined,
    source: (data.source as 'admin' | 'auto') || 'admin',
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || '',
    franchiseId: (data.franchiseId as string) || '',
    storeId: (data.storeId as string) || '',
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useWastage(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { log: audit } = useAudit();

  // ── Fetch wastage events (last 100) ─────────────────────────────────────
  const {
    data: events = [],
    isLoading: loadingEvents,
    isError: isErrorEvents,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: wastageKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<WastageEvent[]> => {
      const ref = wastageRef(franchiseId, storeId);
      // [FIX PERF] Filtrar por data no Firestore em vez de trazer tudo
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const q = query(
        ref,
        where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo)),
        orderBy('createdAt', 'desc'),
        limit(200),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeWastage(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── KPIs (calculated from fetched events, last 30 days) ─────────────────
  const { recentEvents, kpis } = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recent = events.filter((e) => e.createdAt >= thirtyDaysAgo);

    const computed: WastageKPIs = {
      totalMl: recent.reduce((sum, e) => sum + e.mlLost, 0),
      totalEvents: recent.length,
      byType: recent.reduce((acc, e) => {
        if (!acc[e.type]) acc[e.type] = { ml: 0, count: 0 };
        acc[e.type].ml += e.mlLost;
        acc[e.type].count += 1;
        return acc;
      }, {} as Record<string, { ml: number; count: number }>),
    };

    return { recentEvents: recent, kpis: computed };
  }, [events]);

  // ── Create wastage event ────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateWastageInput) => {
      const ref = wastageRef(franchiseId, storeId);
      const newDocRef = doc(ref);
      await setDoc(newDocRef, {
        id: newDocRef.id,
        type: input.type,
        tapId: input.tapId,
        kegId: input.kegId || null,
        mlLost: input.mlLost,
        reason: input.reason || null,
        source: 'admin',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || '',
        franchiseId,
        storeId,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: wastageKeys.all(franchiseId, storeId) });
      toast.success('Perda registrada com sucesso');
      audit(AuditActions.WASTAGE_CREATE, { type: 'wastage', id: '', name: variables.type }, { tapId: variables.tapId, mlLost: variables.mlLost, reason: variables.reason, storeId });
    },
    onError: () => {
      toast.error('Erro ao registrar perda');
    },
  });

  // ── Fetch tapped kegs for tap lookup ────────────────────────────────────
  const { data: tappedKegs = [] } = useQuery({
    queryKey: ['wastage-tapped-kegs', franchiseId, storeId],
    queryFn: async () => {
      const kegsRef = collection(db, 'franchises', franchiseId, 'stores', storeId, 'kegs');
      const q = query(kegsRef, where('status', '==', 'tapped'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          kegId: d.id,
          tapId: (data.tapId as string) ?? null,
          productId: (data.productId as string) || '',
          batchCode: (data.batchCode as string) || '',
        };
      });
    },
    enabled: !!franchiseId && !!storeId,
  });

  /** Get kegId for a given tap (from tapped kegs) */
  const getKegForTap = (tapId: string) =>
    tappedKegs.find((k) => k.tapId === tapId) || null;

  return {
    events,
    loadingEvents,
    isErrorEvents,
    refetchEvents,
    kpis,
    recentEvents,
    tappedKegs,
    getKegForTap,
    createWastage: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
