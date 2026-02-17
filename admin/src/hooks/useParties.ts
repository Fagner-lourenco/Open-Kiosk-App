/**
 * ============================================================================
 * useParties — CRUD para Fornecedores / Funcionários / Terceiros
 * ============================================================================
 *
 * Firestore path: franchises/{fId}/stores/{sId}/finParties/{partyId}
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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { financeSubPath, financeDocPath } from '@/lib/pathResolver';
import { toast } from 'sonner';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import type { Party, PartyType, PartyContact, PartyBankInfo } from '@/types/finance';
import type { Timestamp } from 'firebase/firestore';

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const partyKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['parties', franchiseId, storeId] as const,
};

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreatePartyInput {
  type: PartyType;
  name: string;
  doc?: string;
  contacts?: PartyContact[];
  bankInfo?: PartyBankInfo;
  customerId?: string;
  status?: 'active' | 'inactive';
}

export interface UpdatePartyInput {
  partyId: string;
  type?: PartyType;
  name?: string;
  doc?: string;
  contacts?: PartyContact[];
  bankInfo?: PartyBankInfo;
  customerId?: string;
  status?: 'active' | 'inactive';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function partiesRef(franchiseId: string, storeId: string) {
  return collection(db, financeSubPath(franchiseId, storeId, 'parties'));
}

function partyDocRef(franchiseId: string, storeId: string, partyId: string) {
  return doc(db, financeDocPath(franchiseId, storeId, 'parties', partyId));
}

const VALID_PARTY_TYPES: PartyType[] = ['customer', 'supplier', 'employee', 'other'];
const VALID_PARTY_STATUSES: ('active' | 'inactive')[] = ['active', 'inactive'];

function normalizeParty(id: string, data: Record<string, unknown>): Party {
  const tp = data.type as string;
  const st = data.status as string;
  return {
    id,
    type: VALID_PARTY_TYPES.includes(tp as PartyType) ? (tp as PartyType) : 'other',
    name: (data.name as string) || '',
    doc: data.doc as string | undefined,
    contacts: (data.contacts as PartyContact[]) || [],
    bankInfo: data.bankInfo as PartyBankInfo | undefined,
    customerId: data.customerId as string | undefined,
    status: VALID_PARTY_STATUSES.includes(st as 'active' | 'inactive') ? (st as 'active' | 'inactive') : 'active',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useParties(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const qKey = partyKeys.all(franchiseId, storeId);
  const { log: audit } = useAudit();

  const {
    data: parties = [],
    isLoading: loadingParties,
    error: partiesError,
    refetch: refetchParties,
  } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const ref = partiesRef(franchiseId, storeId);
      const q = query(ref, orderBy('name', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeParty(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreatePartyInput) => {
      const ref = doc(partiesRef(franchiseId, storeId));
      await setDoc(ref, {
        type: input.type,
        name: input.name,
        doc: input.doc || null,
        contacts: input.contacts || [],
        bankInfo: input.bankInfo || null,
        customerId: input.customerId || null,
        status: input.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Parte criada com sucesso');
      audit(AuditActions.PARTY_CREATE, { type: 'party', id: _id, name: variables.name }, { partyType: variables.type, storeId });
    },
    onError: () => toast.error('Erro ao criar parte'),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdatePartyInput) => {
      const { partyId, ...rest } = input;
      const ref = partyDocRef(franchiseId, storeId, partyId);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (rest.type !== undefined) data.type = rest.type;
      if (rest.name !== undefined) data.name = rest.name;
      if (rest.doc !== undefined) data.doc = rest.doc || null;
      if (rest.contacts !== undefined) data.contacts = rest.contacts;
      if (rest.bankInfo !== undefined) data.bankInfo = rest.bankInfo || null;
      if (rest.customerId !== undefined) data.customerId = rest.customerId || null;
      if (rest.status !== undefined) data.status = rest.status;
      await updateDoc(ref, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Parte atualizada');
      audit(AuditActions.PARTY_UPDATE, { type: 'party', id: variables.partyId, name: variables.name || variables.partyId }, { storeId });
    },
    onError: () => toast.error('Erro ao atualizar parte'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (partyId: string) => {
      await deleteDoc(partyDocRef(franchiseId, storeId, partyId));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast.success('Parte excluída');
      audit(AuditActions.PARTY_DELETE, { type: 'party', id: variables, name: variables }, { storeId });
    },
    onError: () => toast.error('Erro ao excluir parte'),
  });

  // ── Computed ────────────────────────────────────────────────────────────

  const activeParties = useMemo(
    () => parties.filter((p) => p.status === 'active'),
    [parties],
  );

  const suppliers = useMemo(
    () => activeParties.filter((p) => p.type === 'supplier'),
    [activeParties],
  );

  const employees = useMemo(
    () => activeParties.filter((p) => p.type === 'employee'),
    [activeParties],
  );

  return {
    parties,
    loadingParties,
    partiesError,
    refetchParties,
    activeParties,
    suppliers,
    employees,
    createParty: createMutation.mutateAsync,
    isCreatingParty: createMutation.isPending,
    updateParty: updateMutation.mutateAsync,
    isUpdatingParty: updateMutation.isPending,
    deleteParty: deleteMutation.mutateAsync,
    isDeletingParty: deleteMutation.isPending,
  };
}
