/**
 * ============================================================================
 * csvExport — Utilitário centralizado de exportação CSV
 * ============================================================================
 *
 * Cria um Blob CSV com BOM UTF-8 (para compatibilidade com Excel) e
 * dispara o download no navegador.
 *
 * @example
 *   downloadCSV('relatorio-jan.csv', ['Nome', 'Valor'], [['A', '1'], ['B', '2']]);
 */

/**
 * Gera e dispara o download de um arquivo CSV.
 *
 * @param filename  Nome do arquivo (ex: `relatorio-2026-02-26.csv`)
 * @param headers   Linha de cabeçalho (ex: `['Nome', 'Email', 'Role']`)
 * @param rows      Linhas de dados (cada inner-array é uma linha CSV)
 * @param quoteAll  Se `true`, envolve cada célula em aspas (default: `true`)
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: string[][],
  quoteAll = true,
): void {
  const escape = (cell: string) =>
    quoteAll ? `"${cell.replace(/"/g, '""')}"` : cell;

  const csvContent = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ].join('\n');

  // BOM UTF-8 para que o Excel reconheça acentos corretamente
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Liberar memória do Object URL
  URL.revokeObjectURL(url);
}
