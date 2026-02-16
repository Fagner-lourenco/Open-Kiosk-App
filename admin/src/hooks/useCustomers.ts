/**
 * ============================================================================
 * useCustomers Hook — Customer CRUD + Queries
 * ============================================================================
 *
 * Hook para gerenciar clientes (customers) de uma loja.
 * Path: franchises/{fId}/stores/{sId}/customers/{customerId}
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
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import type {
  Customer,
  CustomerType,
  CustomerStatus,
  CustomerSource,
  CustomerAddress,
} from '@/types/commercial';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const customerKeys = {
  all: (franchiseId: string, storeId: string) =>
    ['customers', franchiseId, storeId] as const,
};

// ============================================================================
// HELPERS
// ============================================================================

function customersRef(franchiseId: string, storeId: string) {
  return collection(db, 'franchises', franchiseId, 'stores', storeId, 'customers');
}

function customerDocRef(franchiseId: string, storeId: string, customerId: string) {
  return doc(db, 'franchises', franchiseId, 'stores', storeId, 'customers', customerId);
}

/** Converte Firestore doc → Customer com Timestamps normalizados */
const CUSTOMER_TYPES: CustomerType[] = ['company', 'person'];
const CUSTOMER_STATUSES: CustomerStatus[] = ['active', 'archived'];
const CUSTOMER_SOURCES: CustomerSource[] = [
  'instagram',
  'indicacao',
  'inbound',
  'outbound',
  'evento_passado',
];

function normalizeCustomer(id: string, data: Record<string, unknown>): Customer {
  const type = data.type as CustomerType;
  const status = data.status as CustomerStatus;
  const source = data.source as CustomerSource;

  return {
    id,
    type: CUSTOMER_TYPES.includes(type) ? type : 'person',
    name: (data.name as string) || '',
    doc: (data.doc as string) || undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    phones: Array.isArray(data.phones) ? (data.phones as string[]) : [],
    emails: Array.isArray(data.emails) ? (data.emails as string[]) : [],
    address: (data.address as CustomerAddress) || undefined,
    source: CUSTOMER_SOURCES.includes(source) ? source : undefined,
    ownerUserId: (data.ownerUserId as string) || '',
    status: CUSTOMER_STATUSES.includes(status) ? status : 'active',
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface CreateCustomerInput {
  type: CustomerType;
  name: string;
  doc?: string;
  tags?: string[];
  phones?: string[];
  emails?: string[];
  address?: CustomerAddress;
  source?: CustomerSource;
}

export interface UpdateCustomerInput {
  customerId: string;
  type?: CustomerType;
  name?: string;
  doc?: string;
  tags?: string[];
  phones?: string[];
  emails?: string[];
  address?: CustomerAddress;
  source?: CustomerSource;
  status?: CustomerStatus;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCustomers(franchiseId: string, storeId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { log: audit } = useAudit();

  // ── Fetch all customers ─────────────────────────────────────────────────
  const {
    data: customers = [],
    isLoading: loadingCustomers,
    error: customersError,
    refetch: refetchCustomers,
  } = useQuery({
    queryKey: customerKeys.all(franchiseId, storeId),
    queryFn: async (): Promise<Customer[]> => {
      const ref = customersRef(franchiseId, storeId);
      const q = query(ref, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalizeCustomer(d.id, d.data()));
    },
    enabled: !!franchiseId && !!storeId,
    refetchOnWindowFocus: true,
  });

  // ── Create customer ─────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreateCustomerInput) => {
      const newRef = doc(customersRef(franchiseId, storeId));
      const now = serverTimestamp();
      await setDoc(newRef, {
        type: input.type,
        name: input.name,
        doc: input.doc || null,
        tags: input.tags || [],
        phones: input.phones || [],
        emails: input.emails || [],
        address: input.address || null,
        source: input.source || null,
        ownerUserId: user?.uid || '',
        status: 'active' as CustomerStatus,
        createdAt: now,
        updatedAt: now,
      });
      return newRef.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(franchiseId, storeId) });
      toast.success('Cliente cadastrado com sucesso');
      audit(AuditActions.CUSTOMER_CREATE, { type: 'customer', id: _id, name: variables.name }, { type: variables.type, storeId });
    },
    onError: () => {
      toast.error('Erro ao cadastrar cliente');
    },
  });

  // ── Update customer ─────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateCustomerInput) => {
      const { customerId, ...fields } = input;
      const ref = customerDocRef(franchiseId, storeId, customerId);
      // Remove undefined values
      const cleanFields = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      await updateDoc(ref, {
        ...cleanFields,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(franchiseId, storeId) });
      toast.success('Cliente atualizado com sucesso');
      audit(AuditActions.CUSTOMER_UPDATE, { type: 'customer', id: variables.customerId, name: variables.name || variables.customerId }, { updatedFields: Object.keys(variables).filter(k => k !== 'customerId'), storeId });
    },
    onError: () => {
      toast.error('Erro ao atualizar cliente');
    },
  });

  // ── Delete customer ─────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const ref = customerDocRef(franchiseId, storeId, customerId);
      await deleteDoc(ref);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all(franchiseId, storeId) });
      toast.success('Cliente excluído com sucesso');
      audit(AuditActions.CUSTOMER_DELETE, { type: 'customer', id: variables, name: variables }, { storeId });
    },
    onError: () => {
      toast.error('Erro ao excluir cliente');
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  const activeCustomers = customers.filter((c) => c.status === 'active');
  const archivedCustomers = customers.filter((c) => c.status === 'archived');

  return {
    customers,
    loadingCustomers,
    customersError,
    refetchCustomers,
    activeCustomers,
    archivedCustomers,

    createCustomer: createMutation.mutateAsync,
    isCreatingCustomer: createMutation.isPending,

    updateCustomer: updateMutation.mutateAsync,
    isUpdatingCustomer: updateMutation.isPending,

    deleteCustomer: deleteMutation.mutateAsync,
    isDeletingCustomer: deleteMutation.isPending,
  };
}
