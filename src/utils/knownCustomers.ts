/**
 * Known Customers — localStorage-based customer fingerprint recognition.
 *
 * Uses payment data (card BIN+last4, MP payerId, CPF) to recognise returning
 * customers so they don't need to fill out the ranking opt-in form every time.
 *
 * Storage key: "kiosk_known_customers"
 * LRU cap: 100 entries (oldest `lastSeen` evicted first)
 */

const STORAGE_KEY = 'kiosk_known_customers';
const MAX_ENTRIES = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnownCustomer {
  /** Full display name (as entered by customer) */
  name: string;
  /** CPF digits only (11 chars), or empty string if not given */
  cpf: string;
  /** De-duplicated list of fingerprint tokens, e.g. ["card:516703_4789", "payer:309407"] */
  fingerprints: string[];
  /** Unix-ms of last recognition / registration */
  lastSeen: number;
}

export interface FingerprintInput {
  cpf?: string;
  payerId?: string;
  cardFirstDigits?: string;
  cardLastDigits?: string;
}

// ---------------------------------------------------------------------------
// Fingerprint construction
// ---------------------------------------------------------------------------

/**
 * Build an array of fingerprint tokens from available payment data.
 * Each token is a namespaced string like `card:516703_4789`, `payer:309407`, `cpf:12345678901`.
 * Only non-empty data produces tokens.
 */
export function buildFingerprints(data: FingerprintInput): string[] {
  const fps: string[] = [];
  const cpfDigits = data.cpf?.replace(/\D/g, '');
  if (cpfDigits && cpfDigits.length >= 4) {
    fps.push(`cpf:${cpfDigits}`);
  }
  if (data.payerId) {
    fps.push(`payer:${data.payerId}`);
  }
  if (data.cardFirstDigits && data.cardLastDigits) {
    fps.push(`card:${data.cardFirstDigits}_${data.cardLastDigits}`);
  }
  return fps;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function getKnownCustomers(): KnownCustomer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveKnownCustomers(customers: KnownCustomer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  } catch {
    // localStorage may be full — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Find a previously registered customer that matches ANY of the given fingerprints.
 * Updates `lastSeen` on match (side-effect).
 */
export function findCustomerByFingerprint(fingerprints: string[]): KnownCustomer | null {
  if (!fingerprints.length) return null;

  const customers = getKnownCustomers();
  const fpSet = new Set(fingerprints);

  const match = customers.find(c => c.fingerprints.some(fp => fpSet.has(fp)));
  if (!match) return null;

  // Touch lastSeen
  match.lastSeen = Date.now();
  saveKnownCustomers(customers);

  return { ...match };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register (or update) a customer with the given name, CPF and fingerprints.
 * - If any fingerprint already exists → update that entry (merge fingerprints, update name/cpf).
 * - Otherwise create a new entry.
 * - Enforce LRU cap by evicting the oldest (by lastSeen) entries.
 */
export function registerCustomer(
  name: string,
  cpf: string,
  fingerprints: string[],
): void {
  if (!name.trim() || !fingerprints.length) return;

  const customers = getKnownCustomers();
  const fpSet = new Set(fingerprints);

  const existingIdx = customers.findIndex(c =>
    c.fingerprints.some(fp => fpSet.has(fp)),
  );

  if (existingIdx >= 0) {
    // Update existing
    const existing = customers[existingIdx];
    existing.name = name.trim();
    if (cpf) existing.cpf = cpf.replace(/\D/g, '');
    // Merge fingerprints (deduplicate)
    const mergedFps = new Set([...existing.fingerprints, ...fingerprints]);
    existing.fingerprints = [...mergedFps];
    existing.lastSeen = Date.now();
  } else {
    // New entry
    customers.push({
      name: name.trim(),
      cpf: cpf.replace(/\D/g, ''),
      fingerprints: [...new Set(fingerprints)],
      lastSeen: Date.now(),
    });
  }

  // LRU eviction
  if (customers.length > MAX_ENTRIES) {
    customers.sort((a, b) => b.lastSeen - a.lastSeen);
    customers.length = MAX_ENTRIES;
  }

  saveKnownCustomers(customers);
}
