/**
 * ============================================================================
 * Ranking Helpers — Funções compartilhadas entre Cloud Functions de ranking
 * ============================================================================
 *
 * Centraliza lógica de:
 *   - maskName (LGPD)
 *   - getCustomerId (chave estável)
 *   - calcTotalMl
 *   - calcFavoriteDrink
 *   - todayYMD
 *   - generatePrizeCode
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface OrderData {
  orderNumber?: string;
  customerName?: string;
  customerIdentification?: string;
  customerEmail?: string;
  total: number;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  date?: string;
  timestamp?: FirebaseFirestore.Timestamp;
  createdAt?: FirebaseFirestore.Timestamp;
  items?: OrderItem[];
  franchiseId?: string;
  storeId?: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  quantity: number;
  price: number;
  total: number;
  mlPerUnit?: number;
  sizeKey?: string;
}

export interface RankingAggDoc {
  customerId: string;
  displayName: string;
  totalMl: number;
  totalMl30min: number;
  totalSpent: number;
  orderCount: number;
  favoriteDrink: string;
  lastOrderAt: FirebaseFirestore.Timestamp;
  date: string;
  positionChange?: number;
}

export interface ChallengeDoc {
  id: string;
  title: string;
  rule: {
    type: string;
    threshold: number;
    windowMinutes: number;
  };
  status: string;
  startsAt: FirebaseFirestore.Timestamp;
  endsAt: FirebaseFirestore.Timestamp;
  completedCount: number;
  rewardType: string;
  rewardDescription: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Mascara nome para LGPD: "João Miguel Santos" → "João M. S."
 */
export function maskName(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  return [parts[0], ...parts.slice(1).map((p) => `${p[0]?.toUpperCase()}.`)].join(' ');
}

/**
 * Gera ID estável para o cliente.
 * Se há customerIdentification (CPF/CNPJ), extrai apenas dígitos.
 * Senão, usa nome normalizado (uppercase, underscores).
 */
export function getCustomerId(order: { customerIdentification?: string; customerName?: string }): string {
  if (order.customerIdentification) {
    const numeric = String(order.customerIdentification).replace(/\D/g, '');
    if (numeric.length > 0) return numeric;
  }
  return String(order.customerName || 'unknown').toUpperCase().trim().replace(/\s+/g, '_');
}

/**
 * Calcula total de mL nos items do pedido
 */
export function calcTotalMl(items?: OrderItem[] | any[]): number {
  if (!items) return 0;
  return items.reduce((sum, item) => {
    if (item?.mlPerUnit && item.mlPerUnit > 0) {
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 0;
      return sum + item.mlPerUnit * qty;
    }
    return sum;
  }, 0);
}

/**
 * Determina bebida mais consumida em mL
 */
export function calcFavoriteDrink(items?: OrderItem[] | any[]): string {
  if (!items || items.length === 0) return 'N/A';
  const breakdown: Record<string, number> = {};
  for (const item of items) {
    if (item?.mlPerUnit && item.mlPerUnit > 0) {
      const name = String(item.title || 'Desconhecido').split(' - ')[0]?.trim() || 'Desconhecido';
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 0;
      breakdown[name] = (breakdown[name] || 0) + item.mlPerUnit * qty;
    }
  }
  const sorted = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || 'N/A';
}

/**
 * Gera data YYYY-MM-DD de hoje em BRT (UTC-3)
 * 🔧 FIX R9-04: Usar BRT para coincidir com o campo `date` escrito pelo kiosk no browser
 */
export function todayYMD(): string {
  const d = new Date();
  // Converter UTC para BRT (UTC-3)
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, '0')}-${String(brt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Gera código aleatório de 8 chars para prêmios.
 * Exclui caracteres ambíguos (0, O, I, 1, L).
 */
export function generatePrizeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
