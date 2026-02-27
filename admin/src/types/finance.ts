/**
 * ============================================================================
 * Finance Types — Accounts, Categories, CostCenters, Parties, Ledger,
 *                 Invoices, Bills, Payments, Summary
 * ============================================================================
 *
 * Tipos para o módulo Financeiro do admin.
 * Firestore path: franchises/{fId}/stores/{sId}/fin{Subcollection}
 * Consolidado:    franchises/{fId}/financeSummary/{period}
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import type { Timestamp } from 'firebase/firestore';

// ─── Finance Account (Caixa / Banco) ───────────────────────────────────────

export type FinAccountType = 'cash' | 'bank' | 'pix' | 'card_clearing';
export type FinAccountStatus = 'active' | 'inactive';

export interface FinAccount {
  id?: string;
  name: string;
  type: FinAccountType;
  currency: string; // ex: 'BRL'
  openingBalance: number;
  openingAt?: Timestamp;
  status: FinAccountStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Finance Category (Receita / Despesa) ───────────────────────────────────

export type FinCategoryDirection = 'in' | 'out';
export type FinCategoryStatus = 'active' | 'inactive';

export interface FinCategory {
  id?: string;
  direction: FinCategoryDirection;
  name: string;
  parentId?: string; // hierarquia
  status: FinCategoryStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Cost Center ────────────────────────────────────────────────────────────

export type CostCenterStatus = 'active' | 'inactive';

export interface CostCenter {
  id?: string;
  name: string;
  status: CostCenterStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Party (Fornecedor / Funcionário / Terceiro) ────────────────────────────

export type PartyType = 'customer' | 'supplier' | 'employee' | 'other';

export interface PartyContact {
  phone?: string;
  email?: string;
}

export interface PartyBankInfo {
  bankName?: string;
  agency?: string;
  account?: string;
  pixKey?: string;
}

export interface Party {
  id?: string;
  type: PartyType;
  name: string;
  doc?: string; // CPF/CNPJ
  contacts: PartyContact[];
  bankInfo?: PartyBankInfo;
  customerId?: string; // ref em customers (se for cliente)
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Ledger Entry (Fonte da verdade financeira) ─────────────────────────────

export type LedgerDirection = 'in' | 'out';
export type LedgerStatus = 'pending' | 'paid' | 'reconciled' | 'canceled';
export type PaymentMethod = 'pix' | 'card' | 'cash' | 'transfer';
export type LedgerSourceType =
  | 'kiosk_order'
  | 'commercial_event'
  | 'invoice'
  | 'bill'
  | 'wastage'
  | 'keg_event'
  | 'recurring_bill'
  | 'manual';

export interface LedgerEntry {
  id?: string;
  direction: LedgerDirection;
  status: LedgerStatus;
  competenceDate: Timestamp;
  cashDate?: Timestamp;
  amount: number;
  accountId: string;
  categoryId: string;
  costCenterId?: string;
  partyId?: string;
  method: PaymentMethod;
  sourceType: LedgerSourceType;
  sourceId: string; // idempotência
  description: string;
  attachments: string[]; // URLs do Storage
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Invoice (Contas a Receber / AR) ────────────────────────────────────────

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'canceled';

export type InvoiceSourceType = 'commercial_event' | 'kiosk' | 'manual';

export interface Invoice {
  id?: string;
  partyId: string;
  status: InvoiceStatus;
  issueDate: Timestamp;
  dueDate: Timestamp;
  subtotal: number;
  discounts: number;
  fees: number;
  total: number;
  paidTotal: number;
  remaining: number;
  sourceType: InvoiceSourceType;
  sourceId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvoiceLine {
  id?: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  categoryId?: string;
}

// ─── Bill (Contas a Pagar / AP) ─────────────────────────────────────────────

export type BillStatus =
  | 'draft'
  | 'scheduled'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'canceled';

export interface Bill {
  id?: string;
  partyId: string;
  status: BillStatus;
  issueDate: Timestamp;
  dueDate: Timestamp;
  total: number;
  paidTotal: number;
  remaining: number;
  categoryId: string;
  costCenterId?: string;
  attachments: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Finance Payment (Baixa de AR/AP → Ledger) ─────────────────────────────

export type FinPaymentDirection = 'in' | 'out';
export type FinPaymentTargetType = 'invoice' | 'bill' | 'ledger';

export interface FinPayment {
  id?: string;
  direction: FinPaymentDirection;
  date: Timestamp;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  targetType: FinPaymentTargetType;
  targetId: string;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
}

// ─── Finance Summary (Consolidado da Franquia — materializado) ──────────────

export interface StoreFinanceSummary {
  revenue: number;
  expenses: number;
  balance: number;
}

export interface FinanceSummary {
  id?: string; // ex: '2026-02'
  totalRevenue: number;
  totalExpenses: number;
  balance: number;
  byStore: Record<string, StoreFinanceSummary>;
  updatedAt: Timestamp;
}
