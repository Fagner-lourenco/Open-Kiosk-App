/**
 * ============================================================================
 * formatVolume — Formatação padronizada de volume (mL / L)
 * ============================================================================
 *
 * Regra universal (Admin + Telão):
 *   - < 1 000 mL  →  "800 mL"
 *   - ≥ 1 000 mL  →  "9,6 L"  (1 casa decimal; remove ",0" se inteiro)
 *   - ≥ 1 000 L   →  "1.200 L"
 *
 * Variantes:
 *   - formatVolume(ml)        → "9,6 L"   (padrão, com espaço)
 *   - formatVolumeCompact(ml) → "9.6L"    (sem espaço, ponto decimal — telão)
 *   - formatVolumeShort(ml)   → "91L"     (sem decimal, resumido para metas)
 */

// ─── Padrão (pt-BR, com espaço) ────────────────────────────────────────────

export function formatVolume(ml: number): string {
  if (ml < 0) ml = 0;
  if (ml < 1000) return `${Math.round(ml)} mL`;
  const liters = ml / 1000;
  if (liters >= 1000) {
    return `${liters.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L`;
  }
  const formatted = liters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Remove ",0" desnecessário (ex: "2,0 L" → "2 L")
  return `${formatted.replace(/,0$/, '')} L`;
}

// ─── Compacto (telão, sem espaço, ponto decimal) ────────────────────────────

export function formatVolumeCompact(ml: number): string {
  if (ml < 0) ml = 0;
  if (ml < 1000) return `${Math.round(ml)}mL`;
  const liters = ml / 1000;
  if (liters >= 1000) {
    return `${Math.round(liters).toLocaleString('pt-BR')}L`;
  }
  const str = liters.toFixed(1);
  return `${str.replace(/\.0$/, '')}L`;
}

// ─── Curto (metas, totais grandes) ──────────────────────────────────────────

export function formatVolumeShort(ml: number): string {
  if (ml < 0) ml = 0;
  if (ml >= 1_000_000) return `${(ml / 1_000_000).toFixed(0)}K L`;
  if (ml >= 1000) return `${Math.round(ml / 1000)}L`;
  return `${Math.round(ml)}mL`;
}
