/**
 * ============================================================================
 * Shared Formatting Utilities
 * ============================================================================
 *
 * Funções utilitárias de formatação reutilizáveis.
 */

/**
 * Formata um valor em mililitros para exibição legível.
 * Valores >= 1000 ml são convertidos para litros.
 *
 * @example
 * formatMl(500)  // "500ml"
 * formatMl(1500) // "1.5L"
 * formatMl(2000) // "2.0L"
 */
export function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
  return `${Math.round(ml)}ml`;
}
