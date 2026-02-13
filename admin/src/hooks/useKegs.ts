/**
 * ============================================================================
 * useKegs Hook — Keg CRUD + Queries
 * ============================================================================
 *
 * Hook para gerenciar barris (kegs) de uma loja.
 * Path: franchises/{fId}/stores/{sId}/kegs/{kegId}
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
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import type { Keg, KegStatus } from '@shared/types/operations';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const kegKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['kegs', franchiseId, storeId] as const,
  products: (franchiseId: string, storeId: string) =>
    ['store-products', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function kegsRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'kegs');
}

function kegDocRef(franchiseId: string, storeId: string, kegId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'kegs', kegId);
}

/** Converte Firestore Timestamps para Date no runtime */
function normalizeKeg(id: string, data: Record<string, unknown>): Keg {
  const toDate = (v: unknown): Date => {
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
  };
  const toDateOrNull = (v: unknown): Date | null => {
    if (v == null) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return null;
  };

  return {
    kegId: id,
    productId: (data.productId as string) || '',
    supplierId: data.supplierId as string | undefined,
    volumeMl: (data.volumeMl as number) || 0,
    remainingMl: (data.remainingMl as number) || 0,
    status: (data.status as KegStatus) || 'in_stock',
    tapId: (data.tapId as string) ?? null,
    tappedAt: toDateOrNull(data.tappedAt),
    depletedAt: toDateOrNull(data.depletedAt),
    batchCode: data.batchCode as string | undefined,
    expiresAt: data.expiresAt ? toDate(data.expiresAt) : undefined,
    cost: data.cost as number | undefined,
    createdAt: toDate(data.createdAt),
    createdBy: (data.createdBy as string) || '',
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string) || '',
  };
}

// ============================================================================
// HOOK
// ============================================================================

interface SimpleProduct {
  id: string;
  title: string;
  isDrink?: boolean;
}

export interface CreateKegInput {
  productId: string;
  volumeMl: number;
  batchCode?: string;
  expiresAt?: Date;
  cost?: number;
  supplierId?: string;
}

export function useKegs(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Fetch all kegs ──────────────────────────────────────────────────────
  const {
    data: kegs = [],
    isLoading: loadingKegs,
    error: kegsError,
    refetch: refetchKegs,
  } = useQuery({
    queryKey: kegKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<Keg[]> => {
      const ref = kegsRef(franchiseId, storeId);
      const q = query(ref, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeKeg(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
    // D.1 fix: Poll every 10s to catch cross-tab changes (Operations <-> Kegs)
    // useTapAssignments already invalidates kegKeys on connect/disconnect,
    // but this handles external changes (e.g. Kiosk serving sessions depleting kegs)
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // ── Fetch products (for select dropdown) ────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: kegKeys.products(franchiseId, storeId),
    queryFn: async (): Promise<SimpleProduct[]> => {
      const ref = collection(
        db,
        'franchises',
        franchiseId,
        'stores',
        storeId,
        'products'
      );
      const snap = await getDocs(query(ref));
      return snap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) || d.id,
        isDrink: d.data().isDrink as boolean | undefined,
      }));
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Create keg ──────────────────────────────────────────────────────────
  const createKegMutation = useMutation({
    mutationFn: async (input: CreateKegInput) => {
      const newRef = doc(kegsRef(franchiseId, storeId));
      const now = serverTimestamp();
      await setDoc(newRef, {
        kegId: newRef.id,
        productId: input.productId,
        supplierId: input.supplierId || null,
        volumeMl: input.volumeMl,
        remainingMl: input.volumeMl,
        status: 'in_stock',
        tapId: null,
        tappedAt: null,
        depletedAt: null,
        batchCode: input.batchCode || null,
        expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
        cost: input.cost ?? null,
        createdAt: now,
        createdBy: user?.uid || '',
        updatedAt: now,
        updatedBy: user?.uid || '',
      });
      return newRef.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kegKeys.all(franchiseId, storeId) });
      toast.success('Barril cadastrado com sucesso');
    },
    onError: () => {
      toast.error('Erro ao cadastrar barril');
    },
  });

  // ── Update keg status ───────────────────────────────────────────────────
  const updateKegStatusMutation = useMutation({
    mutationFn: async ({
      kegId,
      status,
      extra,
    }: {
      kegId: string;
      status: KegStatus;
      extra?: Record<string, unknown>;
    }) => {
      const ref = kegDocRef(franchiseId, storeId, kegId);
      await updateDoc(ref, {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || '',
        ...extra,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kegKeys.all(franchiseId, storeId) });
      toast.success('Status do barril atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar status do barril');
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Only kegs that are currently tapped to a tap */
  const tappedKegs = kegs.filter((k) => k.status === 'tapped');

  /** Only kegs in stock (not tapped, not depleted/returned) */
  const inStockKegs = kegs.filter((k) => k.status === 'in_stock');

  /** Get product title by id */
  const getProductTitle = (productId: string): string => {
    const p = products.find((pr) => pr.id === productId);
    return p?.title || productId;
  };

  return {
    kegs,
    loadingKegs,
    kegsError,
    refetchKegs,
    products,
    tappedKegs,
    inStockKegs,
    getProductTitle,
    createKeg: createKegMutation.mutateAsync,
    isCreatingKeg: createKegMutation.isPending,
    updateKegStatus: updateKegStatusMutation.mutate,
    isUpdatingKegStatus: updateKegStatusMutation.isPending,
  };
}
