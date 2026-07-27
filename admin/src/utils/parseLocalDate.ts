/**
 * Converte o valor de um <input type="date"> (YYYY-MM-DD) para Date no fuso
 * LOCAL do usuário.
 *
 * `new Date('2026-07-27')` interpreta a string como MEIA-NOITE UTC — no Brasil
 * (UTC-3) isso vira 26/07 21:00 e a data exibida/gravada fica um dia atrás
 * (off-by-one). Este helper monta a Date por componentes, que o JS interpreta
 * no fuso local.
 */
export function parseLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}
