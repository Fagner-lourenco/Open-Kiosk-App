/**
 * ============================================================================
 * useFinCategories — CRUD para Categorias financeiras (Receita / Despesa)
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finCategories/{catId}
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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { financeSubPath, financeDocPath } from '@/lib/pathResolver';
import { toast } from 'sonner';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import type {
  FinCategory,
  FinCategoryDirection,
  FinCategoryStatus,
} from '@/types/finance';
import type { Timestamp } from 'firebase/firestore';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const finCategoryKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['finCategories', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateFinCategoryInput {
  direction: FinCategoryDirection;
  name: string;
  parentId?: string;
  status?: FinCategoryStatus;
}

export interface UpdateFinCategoryInput {
  categoryId: string;
  direction?: FinCategoryDirection;
  name?: string;
  parentId?: string;
  status?: FinCategoryStatus;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function categoriesRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'categories'));
}

function categoryDocRef(franchiseId: string, storeId: string, catId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'categories', catId));
}

function normalizeCategory(id: string, data: Record<string, unknown>): FinCategory {
  const VALID_DIRECTIONS: FinCategoryDirection[] = ['in', 'out'];
  const VALID_STATUSES: FinCategoryStatus[] = ['active', 'inactive'];

  return {
    id,
    direction: VALID_DIRECTIONS.includes(data.direction as FinCategoryDirection) ? (data.direction as FinCategoryDirection) : 'out',
    name: (data.name as string) || '',
    parentId: data.parentId as string | undefined,
    status: VALID_STATUSES.includes(data.status as FinCategoryStatus) ? (data.status as FinCategoryStatus) : 'active',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFinCategories(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = finCategoryKeys.all(franchiseId, storeId);
  const { log: audit } = useAudit();

  const {
    data: categories = [],
    isLoading: loadingCategories,
    error: categoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = categoriesRef(franchiseId, storeId);
      const q = query(ref, orderBy('name', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeCategory(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateFinCategoryInput) => {
      const ref = doc(categoriesRef(franchiseId, storeId));
      await setDoc(ref, {
        direction: input.direction,
        name: input.name,
        parentId: input.parentId || null,
        status: input.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Categoria criada');
      audit(AuditActions.FIN_CATEGORY_CREATE, { type: 'fin_category', id: _id, name: variables.name }, { direction: variables.direction, storeId });
    },
    onError: () => toast.error('Erro ao criar categoria'),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateFinCategoryInput) => {
      const { categoryId, ...rest } = input;
      const ref = categoryDocRef(franchiseId, storeId, categoryId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.direction !== undefined) data.direction = rest.direction;
      if (rest.name !== undefined) data.name = rest.name;
      if (rest.parentId !== undefined) data.parentId = rest.parentId || null;
      if (rest.status !== undefined) data.status = rest.status;
      await updateDoc(ref, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Categoria atualizada');
      audit(AuditActions.FIN_CATEGORY_UPDATE, { type: 'fin_category', id: variables.categoryId, name: variables.name || variables.categoryId }, { storeId });
    },
    onError: () => toast.error('Erro ao atualizar categoria'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      await deleteDoc(categoryDocRef(franchiseId, storeId, categoryId));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Categoria excluída');
      audit(AuditActions.FIN_CATEGORY_DELETE, { type: 'fin_category', id: variables, name: variables }, { storeId });
    },
    onError: () => toast.error('Erro ao excluir categoria'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === 'active'),
    [categories],
  );

  const incomeCategories = useMemo(
    () => activeCategories.filter((c) => c.direction === 'in'),
    [activeCategories],
  );

  const expenseCategories = useMemo(
    () => activeCategories.filter((c) => c.direction === 'out'),
    [activeCategories],
  );

  // [FIX F13] Hierarchy helpers ───────────────────────────────────────────

  /** Root categories (no parent) */
  const rootCategories = useMemo(
    () => activeCategories.filter((c) => !c.parentId),
    [activeCategories],
  );

  /** Get direct children of a given category */
  const getChildCategories = useCallback(
    (parentId: string) => activeCategories.filter((c) => c.parentId === parentId),
    [activeCategories],
  );

  /** Map: parentId → children[] for efficient lookups */
  const childrenMap = useMemo(() => {
    const map = new Map<string, FinCategory[]>();
    for (const cat of activeCategories) {
      if (cat.parentId) {
        const siblings = map.get(cat.parentId) || [];
        siblings.push(cat);
        map.set(cat.parentId, siblings);
      }
    }
    return map;
  }, [activeCategories]);

  /** Flatten a tree with depth info (useful for indented selects) */
  const flatTree = useMemo(() => {
    const result: Array<FinCategory & { depth: number }> = [];
    const visited = new Set<string>();
    const walk = (cats: FinCategory[], depth: number) => {
      for (const cat of cats) {
        if (!cat.id || visited.has(cat.id)) continue; // prevent circular ref
        visited.add(cat.id);
        result.push({ ...cat, depth });
        const children = childrenMap.get(cat.id) || [];
        if (children.length) walk(children, depth + 1);
      }
    };
    walk(rootCategories, 0);
    return result;
  }, [rootCategories, childrenMap]);

  return {
    categories,
    loadingCategories,
    categoriesError,
    refetchCategories,
    activeCategories,
    incomeCategories,
    expenseCategories,
    rootCategories,
    getChildCategories,
    childrenMap,
    flatTree,
    createCategory: createMutation.mutateAsync,
    isCreatingCategory: createMutation.isPending,
    updateCategory: updateMutation.mutateAsync,
    isUpdatingCategory: updateMutation.isPending,
    deleteCategory: deleteMutation.mutateAsync,
    isDeletingCategory: deleteMutation.isPending,
  };
}
