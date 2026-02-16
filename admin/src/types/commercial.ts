/**
 * ============================================================================
 * Commercial (CRM) Types — Customers, Deals, Activities, Calendar, Events, Quotes
 * ============================================================================
 *
 * Tipos para o módulo Comercial (CRM leve) do admin.
 * Firestore path: franchises/{fId}/stores/{sId}/customers|deals|calendarItems|commercialEvents|quotes
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import type { Timestamp } from 'firebase/firestore';

// ─── Customer ───────────────────────────────────────────────────────────────

export type CustomerType = 'company' | 'person';

export type CustomerSource =
  | 'instagram'
  | 'indicacao'
  | 'inbound'
  | 'outbound'
  | 'evento_passado';

export type CustomerStatus = 'active' | 'archived';

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface Customer {
  id?: string;
  type: CustomerType;
  name: string;
  doc?: string; // CPF ou CNPJ
  tags: string[];
  phones: string[];
  emails: string[];
  address?: CustomerAddress;
  source?: CustomerSource;
  ownerUserId: string;
  status: CustomerStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Contact (subcoleção de Customer) ───────────────────────────────────────

export interface Contact {
  id?: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

// ─── Deal (Pipeline) ────────────────────────────────────────────────────────

export type DealStage =
  | 'lead'
  | 'qualify'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export const DEAL_STAGES: DealStage[] = [
  'lead',
  'qualify',
  'proposal',
  'negotiation',
  'won',
  'lost',
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  lead: 'Lead',
  qualify: 'Qualificação',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  won: 'Ganho',
  lost: 'Perdido',
};

export interface Deal {
  id?: string;
  title: string;
  customerId: string;
  stage: DealStage;
  valueEstimate: number;
  probability: number; // 0–100
  expectedCloseAt?: Timestamp;
  eventStartAt?: Timestamp;
  eventEndAt?: Timestamp;
  nextActionAt?: Timestamp;
  ownerUserId: string;
  lostReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Activity (subcoleção de Deal) ──────────────────────────────────────────

export type ActivityType = 'call' | 'whatsapp' | 'email' | 'visit' | 'task';
export type ActivityStatus = 'open' | 'done' | 'canceled';

export interface Activity {
  id?: string;
  type: ActivityType;
  dueAt: Timestamp;
  doneAt?: Timestamp;
  status: ActivityStatus;
  summary: string;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
}

// ─── Calendar Item ──────────────────────────────────────────────────────────

export type CalendarItemType = 'event' | 'task' | 'reminder' | 'visit';
export type CalendarItemStatus = 'tentative' | 'confirmed' | 'canceled' | 'done';
export type CalendarRelatedType = 'deal' | 'customer' | 'commercialEvent' | 'quote';

export interface CalendarItem {
  id?: string;
  type: CalendarItemType;
  title: string;
  startAt: Timestamp;
  endAt?: Timestamp;
  allDay: boolean;
  ownerUserId: string;
  relatedType?: CalendarRelatedType;
  relatedId?: string;
  status: CalendarItemStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Commercial Event ───────────────────────────────────────────────────────

export type CommercialEventStatus =
  | 'draft'
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'done'
  | 'canceled';

export type LocationType = 'on_site' | 'external';
export type PricingModel = 'per_liter' | 'per_hour' | 'package';

export interface CommercialEvent {
  id?: string;
  customerId: string;
  dealId?: string;
  quoteId?: string;
  title: string;
  description?: string;
  status: CommercialEventStatus;
  locationType: LocationType;
  address?: CustomerAddress;
  startAt: Timestamp;
  endAt?: Timestamp;
  attendeesEstimate?: number;
  pricingModel?: PricingModel;
  notesInternal?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Budget Line (subcoleção de Commercial Event) ───────────────────────────

export type BudgetLineType =
  | 'staff'
  | 'transport'
  | 'beverage'
  | 'rental'
  | 'fee'
  | 'discount';

export type PaidBy = 'store' | 'client' | 'split';

export interface BudgetLine {
  id?: string;
  type: BudgetLineType;
  categoryId?: string; // ref finance/categories
  qty: number;
  unitCost: number;
  totalCost: number;
  supplierId?: string;
  paidBy: PaidBy;
}

// ─── Quote (Proposta) ───────────────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface Quote {
  id?: string;
  customerId: string;
  dealId?: string;
  eventId?: string;
  status: QuoteStatus;
  validUntil?: Timestamp;
  subtotal: number;
  discounts: number;
  fees: number;
  total: number;
  paymentTerms?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Quote Line (subcoleção de Quote) ───────────────────────────────────────

export type QuoteLineType = 'keg' | 'service' | 'transport' | 'staff' | 'package';

export interface QuoteLine {
  id?: string;
  type: QuoteLineType;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  productId?: string; // ref products
}
