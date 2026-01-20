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
