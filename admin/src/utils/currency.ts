/**
 * ============================================================================
 * Currency utilities — avoid IEEE 754 floating-point errors
 * ============================================================================
 *
 * JavaScript uses 64-bit doubles. Multiplying decimals like 3 × 19.99 yields
 * 59.96999999999999 instead of 59.97. This helper rounds to 2 decimal places
 * after arithmetic so that persisted values are always clean.
 *
 * Usage:
 *   roundCurrency(qty * unitPrice)   // e.g. roundCurrency(3 * 19.99) → 59.97
 *
 * @author Open Kiosk Project
 */

/**
 * Round a number to 2 decimal places (cents precision).
 * Uses the "multiply → round → divide" pattern to avoid
 * further floating-point drift during rounding itself.
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
