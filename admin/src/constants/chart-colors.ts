/**
 * Paleta de cores padrão para gráficos (Recharts).
 * Centralizada aqui para manter consistência visual e facilitar mudanças.
 */

export const CHART_COLORS = [
  '#8884d8', // roxo
  '#82ca9d', // verde
  '#ffc658', // amarelo
  '#ff7300', // laranja
  '#00C49F', // teal
] as const;

/** Cor primária para gráficos (linhas, barras únicas) */
export const CHART_PRIMARY = CHART_COLORS[0];

/** Cor secundária para gráficos */
export const CHART_SECONDARY = CHART_COLORS[1];

/**
 * Retorna a cor do índice, ciclando pela paleta.
 */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
