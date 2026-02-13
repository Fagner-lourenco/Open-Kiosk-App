/**
 * ============================================================================
 * Invitation Badge Utilities
 * ============================================================================
 *
 * Componente utilitário para badges de status de convites.
 * Extraído de TeamPage e InvitationsPage.
 */

import { Badge } from '@/components/ui/badge';

/** Retorna o componente Badge correspondente ao status do convite */
export function getInvitationStatusBadge(status: string, expiresAt: Date) {
  const isExpired = expiresAt < new Date();

  if (status === 'accepted') {
    return <Badge className="bg-green-100 text-green-700">Aceito</Badge>;
  }
  if (status === 'revoked') {
    return <Badge variant="destructive">Revogado</Badge>;
  }
  if (isExpired || status === 'expired') {
    return <Badge variant="secondary">Expirado</Badge>;
  }
  return <Badge className="bg-yellow-100 text-yellow-700">Pendente</Badge>;
}
