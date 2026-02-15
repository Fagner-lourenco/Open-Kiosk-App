/**
 * ============================================================================
 * Tipos Compartilhados - Barrel Export
 * ============================================================================
 *
 * Re-exporta todos os tipos unificados para Kiosk e Admin
 */

// Roles
export {
  type UserRole,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  isRoleAtLeast,
  isRoleAbove,
  getAssignableRoles,
  ALL_ROLES,
  OWNER_ASSIGNABLE_ROLES,
  ADMIN_ASSIGNABLE_ROLES,
  MANAGER_ASSIGNABLE_ROLES,
} from './roles';

// Permissions
export {
  type Permission,
  ROLE_PERMISSIONS,
  roleHasPermission,
  roleHasAllPermissions,
  roleHasAnyPermission,
  groupPermissionsByResource,
  PERMISSION_LABELS,
} from './permissions';

// Store
export {
  type StoreAddress,
  type StoreContact,
  type ESP32ConnectionType,
  type ESP32Config,
  type PaymentProvider,
  type PaymentEnvironment,
  type EnabledPaymentMethods,
  type PagBankProviderConfig,
  type PlugPagConfig,
  type MercadoPagoProviderConfig,
  type PaymentGatewayConfig,
  type Store,
  type CreateStoreData,
  type UpdateStoreData,
  type StoreConnectionStatus,
  type StoreDispenser,
  type StoreStats,
} from './store';

// Operations (ERP Vertical de Chopp)
export {
  type TapStatus,
  type TapOperationalState,
  type KegStatus,
  type Keg,
  type TapAssignmentStatus,
  type TapAssignment,
  type ServingSessionStatus,
  type ServingSession,
  type WastageType,
  type WastageSource,
  type WastageEvent,
  type MaintenanceType,
  type MaintenanceStatus,
  type MaintenanceLog,
  type NotificationType,
  type NotificationSeverity,
  type OperationalNotification,
} from './operations';
