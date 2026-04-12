/**
 * ============================================================================
 * Schemas de Validação - ERP Operacional de Chopp
 * ============================================================================
 *
 * Zod schemas para validação de entidades operacionais.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { z } from 'zod';

// ============================================================================
// TAP OPERATIONAL STATE
// ============================================================================

export const TapStatusSchema = z.enum(['idle', 'active', 'disabled', 'maintenance']);

export const TapOperationalStateSchema = z.object({
  tapId: z.string().min(1),
  status: TapStatusSchema,
  currentKegId: z.string().nullable(),
  todayMlDispensed: z.number().min(0).default(0),
  todaySessions: z.number().int().min(0).default(0),
  todayWastageMl: z.number().min(0).default(0),
  createdAt: z.date(),
  createdBy: z.string().min(1),
  updatedAt: z.date(),
  updatedBy: z.string().min(1),
});

// ============================================================================
// KEG
// ============================================================================

export const KegStatusSchema = z.enum(['in_stock', 'tapped', 'depleted', 'returned']);

export const KegSchema = z.object({
  kegId: z.string().min(1),
  productId: z.string().min(1),
  supplierId: z.string().optional(),
  volumeMl: z.number().int().min(1),
  remainingMl: z.number().min(0),
  status: KegStatusSchema,
  tapIds: z.array(z.string()).max(2).default([]),
  tappedAt: z.date().nullable(),
  depletedAt: z.date().nullable(),
  batchCode: z.string().optional(),
  expiresAt: z.date().optional(),
  cost: z.number().min(0).optional(),
  createdAt: z.date(),
  createdBy: z.string().min(1),
  updatedAt: z.date(),
  updatedBy: z.string().min(1),
});

export const CreateKegSchema = z.object({
  productId: z.string().min(1),
  supplierId: z.string().optional(),
  volumeMl: z.number().int().min(1),
  remainingMl: z.number().min(0).optional(),
  batchCode: z.string().optional(),
  expiresAt: z.date().optional(),
  cost: z.number().min(0).optional(),
});

// ============================================================================
// TAP ASSIGNMENT
// ============================================================================

export const TapAssignmentStatusSchema = z.enum(['active', 'removed']);

export const TapAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  tapId: z.string().min(1),
  kegId: z.string().min(1),
  status: TapAssignmentStatusSchema,
  attachedAt: z.date(),
  attachedBy: z.string().min(1),
  removedAt: z.date().nullable(),
  removedBy: z.string().nullable(),
  removalReason: z.string().optional(),
  totalMlDispensed: z.number().min(0).default(0),
  totalSessions: z.number().int().min(0).default(0),
  totalWastageMl: z.number().min(0).default(0),
  createdAt: z.date(),
  createdBy: z.string().min(1),
  updatedAt: z.date(),
  updatedBy: z.string().min(1),
});

// ============================================================================
// SERVING SESSION (IMMUTABLE)
// ============================================================================

export const ServingSessionStatusSchema = z.enum(['completed', 'error', 'canceled']);

export const ServingSessionSchema = z.object({
  eventId: z.string().min(1),
  orderId: z.string().min(1),
  tapId: z.string().min(1),
  kegId: z.string().nullable(),
  productId: z.string().nullable(),
  cupIndex: z.number().int().min(0),
  targetMl: z.number().min(0),
  actualMl: z.number().min(0),
  startedAt: z.date(),
  completedAt: z.date(),
  createdAt: z.date(),
  status: ServingSessionStatusSchema,
  errorCode: z.string().optional(),
  source: z.literal('kiosk'),
  franchiseId: z.string().min(1),
  storeId: z.string().min(1),
});

/**
 * Generates deterministic eventId for idempotent writes.
 * Format: `${orderId}_t${tapId}_c${cupIndex}`
 */
export function generateServingEventId(orderId: string, tapId: string | number, cupIndex: number): string {
  return `${orderId}_t${tapId}_c${cupIndex}`;
}

// ============================================================================
// WASTAGE EVENT (IMMUTABLE)
// ============================================================================

export const WastageTypeSchema = z.enum(['foam', 'purge', 'spill', 'other', 'auto']);
export const WastageSourceSchema = z.enum(['admin', 'auto']);

export const WastageEventSchema = z.object({
  id: z.string().min(1),
  type: WastageTypeSchema,
  tapId: z.string().min(1),
  kegId: z.string().nullable(),
  mlLost: z.number().min(0),
  reason: z.string().optional(),
  source: WastageSourceSchema,
  createdAt: z.date(),
  createdBy: z.string().min(1),
  franchiseId: z.string().min(1),
  storeId: z.string().min(1),
});

// ============================================================================
// MAINTENANCE LOG
// ============================================================================

export const MaintenanceTypeSchema = z.enum(['cleaning', 'calibration', 'repair', 'inspection', 'other']);
export const MaintenanceStatusSchema = z.enum(['scheduled', 'overdue', 'completed', 'canceled']);

export const MaintenanceLogSchema = z.object({
  id: z.string().min(1),
  type: MaintenanceTypeSchema,
  tapId: z.string().optional(),
  kegId: z.string().optional(),
  status: MaintenanceStatusSchema,
  scheduledAt: z.date().optional(),
  performedAt: z.date().optional(),
  durationMinutes: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string().min(1),
  updatedAt: z.date(),
  updatedBy: z.string().min(1),
  franchiseId: z.string().min(1),
  storeId: z.string().min(1),
});

// ============================================================================
// NOTIFICATION
// ============================================================================

export const NotificationTypeSchema = z.enum([
  'keg_low', 'keg_expiring', 'maintenance_overdue', 'tap_idle', 'wastage_high', 'system',
]);
export const NotificationSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const OperationalNotificationSchema = z.object({
  id: z.string().min(1),
  type: NotificationTypeSchema,
  severity: NotificationSeveritySchema,
  message: z.string().min(1),
  createdAt: z.date(),
  readAt: z.date().nullable(),
  entityRef: z.string().optional(),
  storeId: z.string().min(1),
  franchiseId: z.string().min(1),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type TapOperationalStateInput = z.infer<typeof TapOperationalStateSchema>;
export type KegInput = z.infer<typeof KegSchema>;
export type CreateKegInput = z.infer<typeof CreateKegSchema>;
export type TapAssignmentInput = z.infer<typeof TapAssignmentSchema>;
export type ServingSessionInput = z.infer<typeof ServingSessionSchema>;
export type WastageEventInput = z.infer<typeof WastageEventSchema>;
export type MaintenanceLogInput = z.infer<typeof MaintenanceLogSchema>;
export type OperationalNotificationInput = z.infer<typeof OperationalNotificationSchema>;
