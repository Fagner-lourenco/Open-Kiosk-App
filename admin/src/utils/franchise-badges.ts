/**
 * ============================================================================
 * Franchise Badge Utilities
 * ============================================================================
 *
 * Funções utilitárias para estilização de badges de plano e status de franquias.
 * Extraídas de SuperAdminDashboard, FranchisesPage e FranchiseDetailPage.
 */

const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-yellow-100 text-yellow-800',
  basic: 'bg-blue-100 text-blue-800',
  professional: 'bg-purple-100 text-purple-800',
  enterprise: 'bg-green-100 text-green-800',
};

/** Retorna as classes CSS para o badge de plano da franquia */
export function getPlanBadge(plan?: string): string {
  return PLAN_COLORS[plan || 'trial'] || PLAN_COLORS.trial;
}

/** Retorna as classes CSS para o badge de status da franquia */
export function getStatusBadge(status?: string): string {
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-muted text-foreground',
    suspended: 'bg-red-100 text-red-800',
  };
  return statusColors[status || 'active'] || 'bg-red-100 text-red-800';
}
