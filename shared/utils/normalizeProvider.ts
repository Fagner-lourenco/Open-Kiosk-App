/**
 * Normaliza formato de payment provider (legacy → canonical)
 *
 * Converte legacy 'mercadopago' para canonical 'mercado_pago'.
 * Esta é a primeira linha de defesa para backward-compatibility com dados antigos.
 *
 * CANONICAL SOURCE — todas as cópias em KIOSK, ADMIN e FUNCTIONS devem
 * convergir para este módulo. Se o módulo não puder ser importado diretamente
 * (ex.: FUNCTIONS), a cópia local deve permanecer semanticamente idêntica.
 *
 * @param provider - Valor do Firestore (pode estar em formato legado)
 * @returns Canonical PaymentProvider
 */
import type { PaymentProvider } from '../types/store';

export const normalizeProvider = (provider?: PaymentProvider | string): PaymentProvider => {
  if (!provider) return 'mercado_pago';
  if (provider === 'mercadopago') return 'mercado_pago';
  if (provider === 'none' || provider === 'mercado_pago' || provider === 'pagbank') return provider;
  return 'none';
};
