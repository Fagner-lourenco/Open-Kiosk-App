/**
 * ============================================================================
 * Tipos Compartilhados - ERP Operacional de Chopp (Self-Service)
 * ============================================================================
 *
 * Entidades operacionais para gestão de torneiras, barris, sessões de servir,
 * perdas e manutenção. Todas dentro de franchises/{fId}/stores/{sId}/.
 *
 * Convenções:
 * - IMUTÁVEL: ServingSession, WastageEvent — somente create + read
 * - MUTÁVEL com restrição: TapOperationalState, Keg, TapAssignment, MaintenanceLog
 * - Timestamps: Firestore Timestamp ou Date (normalizados no runtime)
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

// ============================================================================
// TAP OPERATIONAL STATE
// ============================================================================

/**
 * Status operacional de uma torneira.
 * Path: franchises/{fId}/stores/{sId}/taps/{tapId}
 *
 * NÃO confundir com taps[] no store doc (config de hardware ESP32).
 * Este doc é estado operacional (qual barril está conectado, contadores diários).
 */
export type TapStatus = 'idle' | 'active' | 'disabled' | 'maintenance';

export interface TapOperationalState {
  tapId: string;
  status: TapStatus;
  currentKegId: string | null;
  todayMlDispensed: number;
  todaySessions: number;
  todayWastageMl: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

// ============================================================================
// KEG (BARRIL)
// ============================================================================

/**
 * Barril de chopp.
 * Path: franchises/{fId}/stores/{sId}/kegs/{kegId}
 */
export type KegStatus = 'in_stock' | 'tapped' | 'depleted' | 'returned';

export interface Keg {
  kegId: string;
  productId: string;
  supplierId?: string;
  volumeMl: number;
  remainingMl: number;
  status: KegStatus;
  tapId: string | null;
  tappedAt: Date | null;
  depletedAt: Date | null;
  batchCode?: string;
  expiresAt?: Date;
  cost?: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

// ============================================================================
// TAP ASSIGNMENT (HISTÓRICO DE CONEXÃO TAP ↔ KEG)
// ============================================================================

/**
 * Registro de associação tap ↔ keg.
 * Path: franchises/{fId}/stores/{sId}/tapAssignments/{assignmentId}
 */
export type TapAssignmentStatus = 'active' | 'removed';

export interface TapAssignment {
  assignmentId: string;
  tapId: string;
  kegId: string;
  status: TapAssignmentStatus;
  attachedAt: Date;
  attachedBy: string;
  removedAt: Date | null;
  removedBy: string | null;
  removalReason?: string;
  totalMlDispensed: number;
  totalSessions: number;
  totalWastageMl: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

// ============================================================================
// SERVING SESSION (IMUTÁVEL)
// ============================================================================

/**
 * Sessão de servir — evento IMUTÁVEL gerado pelo Kiosk após cada dispensação.
 * Path: franchises/{fId}/stores/{sId}/servingSessions/{eventId}
 *
 * eventId determinístico: `${orderId}_t${tapId}_c${cupIndex}`
 * Idempotência garantida via setDoc (sem merge) no Firestore.
 */
export type ServingSessionStatus = 'completed' | 'error' | 'canceled';

export interface ServingSession {
  eventId: string;
  orderId: string;
  tapId: string;
  kegId: string | null;
  productId: string | null;
  cupIndex: number;
  targetMl: number;
  actualMl: number;
  startedAt: Date;
  completedAt: Date;
  createdAt: Date;
  status: ServingSessionStatus;
  errorCode?: string;
  source: 'kiosk';
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// WASTAGE EVENT (IMUTÁVEL)
// ============================================================================

/**
 * Evento de perda — IMUTÁVEL, gerado por Admin (manual) ou Cloud Function (auto).
 * Path: franchises/{fId}/stores/{sId}/wastageEvents/{id}
 */
export type WastageType = 'foam' | 'purge' | 'spill' | 'other' | 'auto';
export type WastageSource = 'admin' | 'auto';

export interface WastageEvent {
  id: string;
  type: WastageType;
  tapId: string;
  kegId: string | null;
  mlLost: number;
  reason?: string;
  source: WastageSource;
  createdAt: Date;
  createdBy: string;
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// MAINTENANCE LOG
// ============================================================================

/**
 * Log de manutenção — update limitado a workflow (status, performedAt, notes).
 * Path: franchises/{fId}/stores/{sId}/maintenanceLogs/{id}
 */
export type MaintenanceType = 'cleaning' | 'calibration' | 'repair' | 'inspection' | 'other';
export type MaintenanceStatus = 'scheduled' | 'overdue' | 'completed' | 'canceled';

export interface MaintenanceLog {
  id: string;
  type: MaintenanceType;
  tapId?: string;
  kegId?: string;
  status: MaintenanceStatus;
  scheduledAt?: Date;
  performedAt?: Date;
  durationMinutes?: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// NOTIFICATION (STORE-LEVEL)
// ============================================================================

/**
 * Notificação operacional — criada por Cloud Functions.
 * Path: franchises/{fId}/stores/{sId}/notifications/{id}
 */
export type NotificationType = 'keg_low' | 'keg_expiring' | 'maintenance_overdue' | 'tap_idle' | 'wastage_high' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface OperationalNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  message: string;
  createdAt: Date;
  readAt: Date | null;
  entityRef?: string;
  storeId: string;
  franchiseId: string;
}
