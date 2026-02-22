/**
 * ============================================================================
 * pickAccent — Resolve cor/tema de um card de bebida
 * ============================================================================
 *
 * Retorna classes Tailwind para colorir o DrinkCard baseado no estilo/nome
 * da cerveja, com suporte a override manual via accentColor.
 *
 * Ordem de resolução:
 * 1. Se `accentColor` é uma keyword válida → palette fixa
 * 2. Senão, infere de `style` + `title` (case-insensitive substring match)
 * 3. Fallback: amarelo/lager
 */

export interface AccentTheme {
  /** Classe da barra lateral colorida */
  bar: string;
  /** Classe de sombra/glow do card */
  glow: string;
  /** Classe dos chips/badges de info */
  chip: string;
  /** Classe do fundo principal do card */
  bg: string;
  /** Classe de texto principal (branco ou preto) */
  fg: string;
}

const PALETTES: Record<string, AccentTheme> = {
  violet: {
    bar: 'bg-violet-700',
    glow: 'shadow-[0_18px_60px_rgba(124,58,237,0.25)]',
    chip: 'bg-white/18 text-white',
    bg: 'bg-violet-700',
    fg: 'text-white',
  },
  sky: {
    bar: 'bg-sky-600',
    glow: 'shadow-[0_18px_60px_rgba(14,165,233,0.22)]',
    chip: 'bg-white/18 text-white',
    bg: 'bg-sky-600',
    fg: 'text-white',
  },
  amber: {
    bar: 'bg-amber-400',
    glow: 'shadow-[0_18px_60px_rgba(251,191,36,0.22)]',
    chip: 'bg-black/18 text-black',
    bg: 'bg-amber-400',
    fg: 'text-black',
  },
  yellow: {
    bar: 'bg-yellow-300',
    glow: 'shadow-[0_18px_60px_rgba(250,204,21,0.18)]',
    chip: 'bg-black/18 text-black',
    bg: 'bg-yellow-300',
    fg: 'text-black',
  },
  red: {
    bar: 'bg-red-600',
    glow: 'shadow-[0_18px_60px_rgba(220,38,38,0.22)]',
    chip: 'bg-white/18 text-white',
    bg: 'bg-red-600',
    fg: 'text-white',
  },
  green: {
    bar: 'bg-green-600',
    glow: 'shadow-[0_18px_60px_rgba(22,163,74,0.22)]',
    chip: 'bg-white/18 text-white',
    bg: 'bg-green-600',
    fg: 'text-white',
  },
  stone: {
    bar: 'bg-stone-700',
    glow: 'shadow-[0_18px_60px_rgba(68,64,60,0.22)]',
    chip: 'bg-white/18 text-white',
    bg: 'bg-stone-700',
    fg: 'text-white',
  },
  cream: {
    bar: 'bg-amber-300',
    glow: 'shadow-[0_18px_60px_rgba(217,195,160,0.20)]',
    chip: 'bg-stone-800/25 text-stone-900',
    bg: 'bg-gradient-to-br from-amber-50 to-amber-100',
    fg: 'text-stone-800',
  },
};

// Ordered patterns for style/title inference (first match wins)
const INFERENCE_RULES: Array<{ pattern: string; palette: string }> = [
  { pattern: 'ipa', palette: 'violet' },
  { pattern: 'pilsen', palette: 'cream' },
  { pattern: 'pils', palette: 'cream' },
  { pattern: 'lager', palette: 'cream' },
  { pattern: 'session', palette: 'amber' },
  { pattern: 'amber', palette: 'amber' },
  { pattern: 'apa', palette: 'amber' },
  { pattern: 'red ale', palette: 'red' },
  { pattern: 'stout', palette: 'stone' },
  { pattern: 'porter', palette: 'stone' },
  { pattern: 'wheat', palette: 'yellow' },
  { pattern: 'weiss', palette: 'yellow' },
  { pattern: 'pale ale', palette: 'amber' },
];

export interface PickAccentInput {
  style?: string;
  title?: string;
  accentColor?: string;
}

/**
 * Resolve o tema de accent para um card de drink.
 *
 * @param product - Produto com fields opcionais (style, title, accentColor)
 * @returns AccentTheme com classes Tailwind
 */
export function pickAccent(product?: PickAccentInput | null): AccentTheme {
  const p = product || {};

  // 1. Override manual (keyword explícita)
  const override = p.accentColor;
  if (override && override !== 'auto' && PALETTES[override]) {
    return PALETTES[override];
  }

  // 2. Inferência pelo style + title
  const text = ((p.style || '') + ' ' + (p.title || '')).toLowerCase();

  for (const rule of INFERENCE_RULES) {
    if (text.includes(rule.pattern)) {
      return PALETTES[rule.palette];
    }
  }

  // 3. Fallback
  return PALETTES.amber;
}
