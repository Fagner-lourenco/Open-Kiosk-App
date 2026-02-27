/**
 * ============================================================================
 * usePermissions Hook
 * ============================================================================
 * 
 * Hook de conveniência para verificação de permissões.
 * Delega inteiramente ao PermissionContext (fonte de verdade única).
 * 
 * Pode ser usado em qualquer componente DENTRO do PermissionProvider
 * como alternativa mais curta a `usePermissionContext()`.
 */

import { usePermissionContext, type PermissionContextType } from '@/context/PermissionContext';

export type UsePermissionsReturn = PermissionContextType;

export function usePermissions(): UsePermissionsReturn {
  return usePermissionContext();
}
