/**
 * ============================================================================
 * GPIO Configuration — XIAO ESP32-S3
 * ============================================================================
 *
 * Pin definitions, validation helpers, and tap config types.
 * Single source of truth for the GPIO pin dropdown.
 */

// ============================================================================
// TAP CONFIG (CANONICAL)
// ============================================================================

/**
 * Canonical TapConfig — the format persisted as taps[] in Firestore.
 * Admin UI edits this directly.
 */
export interface TapConfigLocal {
  id: number;
  name: string;
  enabled: boolean;
  valvePin?: number;
  sensorPin?: number;
  calibration?: {
    pulsesPerLiter?: number;
    mlPerSecond?: number;
  };
  productId?: string;
  productName?: string;
}

// ============================================================================
// XIAO ESP32-S3 BOARD PROFILE
// ============================================================================

/**
 * Available GPIO pins on Seeed Studio XIAO ESP32-S3 header.
 */
export const XIAO_GPIO_OPTIONS: { gpio: number; label: string }[] = [
  { gpio: 1,  label: 'D0 (GPIO1)' },
  { gpio: 2,  label: 'D1 (GPIO2)' },
  { gpio: 3,  label: 'D2 (GPIO3)' },
  { gpio: 4,  label: 'D3 (GPIO4)' },
  { gpio: 5,  label: 'D4 (GPIO5)' },
  { gpio: 6,  label: 'D5 (GPIO6)' },
  { gpio: 7,  label: 'D8 (GPIO7)' },
  { gpio: 8,  label: 'D9 (GPIO8)' },
  { gpio: 9,  label: 'D10 (GPIO9)' },
  { gpio: 12, label: 'D11 (GPIO12)' },
  { gpio: 13, label: 'D12 (GPIO13)' },
];

/** UART pins — selectable only in advanced mode with explicit warning */
export const XIAO_UART_OPTIONS: { gpio: number; label: string }[] = [
  { gpio: 43, label: 'D6/TX (GPIO43) ⚠️' },
  { gpio: 44, label: 'D7/RX (GPIO44) ⚠️' },
];

const ALLOWED_PINS = new Set(XIAO_GPIO_OPTIONS.map(o => o.gpio));
const UART_PINS = new Set(XIAO_UART_OPTIONS.map(o => o.gpio));

// ============================================================================
// GPIO VALIDATION HELPERS
// ============================================================================

export function validateGpioPin(
  pin: number | undefined,
  _isValve: boolean,
  advancedMode: boolean,
): { valid: boolean; warning?: string } {
  if (pin === undefined || pin === null) return { valid: true };
  if (!Number.isInteger(pin)) {
    return { valid: false, warning: 'GPIO deve ser número inteiro' };
  }
  if (UART_PINS.has(pin)) {
    if (!advancedMode) {
      return { valid: false, warning: `GPIO ${pin} é TX/RX Serial — habilite "Modo Avançado" para usar` };
    }
    return { valid: true, warning: `GPIO ${pin} é TX/RX Serial — pode causar ativação indesejada da válvula quando idle!` };
  }
  if (!ALLOWED_PINS.has(pin) && !UART_PINS.has(pin)) {
    return { valid: false, warning: `GPIO ${pin} não está disponível no XIAO ESP32-S3` };
  }
  return { valid: true };
}

export function findDuplicateGpioPins(taps: TapConfigLocal[]): Map<number, string[]> {
  const usage = new Map<number, string[]>();
  taps.forEach((t) => {
    if (t.valvePin !== undefined && t.valvePin !== null) {
      const list = usage.get(t.valvePin) || [];
      list.push(`T${t.id} Válvula`);
      usage.set(t.valvePin, list);
    }
    if (t.sensorPin !== undefined && t.sensorPin !== null) {
      const list = usage.get(t.sensorPin) || [];
      list.push(`T${t.id} Sensor`);
      usage.set(t.sensorPin, list);
    }
  });
  const dupes = new Map<number, string[]>();
  usage.forEach((users, pin) => { if (users.length > 1) dupes.set(pin, users); });
  return dupes;
}

/**
 * Convert canonical taps[] → legacy dispensers[] for dual-write.
 */
export function convertTapsToDispensers(taps: TapConfigLocal[]): any[] {
  return taps.map(t => ({
    id: t.id,
    name: t.name,
    enabled: t.enabled,
    valvePin: t.valvePin,
    sensorPin: t.sensorPin,
    calibration: {
      mlPerPulse: t.calibration?.pulsesPerLiter && t.calibration.pulsesPerLiter > 0
        ? parseFloat((1000 / t.calibration.pulsesPerLiter).toFixed(3))
        : 1.0,
      flowTimeout: 30,
    },
    productId: t.productId,
  }));
}

/**
 * Convert legacy dispensers[] → canonical taps[] on load.
 */
export function convertDispensersToTaps(dispensers: any[]): TapConfigLocal[] {
  return dispensers.map(d => ({
    id: d.id,
    name: d.name,
    enabled: d.enabled ?? true,
    valvePin: d.valvePin,
    sensorPin: d.sensorPin,
    calibration: {
      pulsesPerLiter: d.calibration?.mlPerPulse && d.calibration.mlPerPulse > 0
        ? Math.round(1000 / d.calibration.mlPerPulse)
        : d.calibration?.pulsesPerLiter,
      mlPerSecond: d.calibration?.mlPerSecond,
    },
    productId: d.productId,
    productName: d.productName,
  }));
}
