/**
 * ============================================================================
 * useAudit - Hook centralizado para registrar ações de auditoria
 * ============================================================================
 *
 * Uso:
 *   const { log } = useAudit();
 *   await log(AuditActions.PRODUCT_CREATE, { type: 'product', id, name }, { price, category });
 *
 * Nunca bloqueia o fluxo operacional — erros são logados no console.
 */

import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import { logUserAction } from '@/services/auditService';

type AuditTarget = { type: string; id: string; name?: string };

export function useAudit() {
  const { user } = useAuth();
  const { currentFranchise } = useFranchise();

  /**
   * Registra uma ação de auditoria.
   * Silencia erros para nunca bloquear a operação principal.
   */
  const log = useCallback(
    async (
      action: string,
      target?: AuditTarget,
      details?: Record<string, any>,
    ) => {
      if (!currentFranchise || !user) return;

      try {
        await logUserAction(
          currentFranchise.id,
          action,
          {
            id: user.uid,
            email: user.email || '',
            name: user.displayName || undefined,
          },
          target,
          details,
        );
      } catch (err) {
        console.warn(`[audit] Falha ao registrar ${action}:`, err);
      }
    },
    [currentFranchise, user],
  );

  return { log };
}
