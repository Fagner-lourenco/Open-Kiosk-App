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
 *
 * IMPORTANT: `payerId` is only included when NO card data is present.
 * For card-present (POS/Point terminal) payments, `payer.id` from Mercado Pago
 * is the SELLER's account ID, not the buyer's. Using it would cause every
 * terminal payment to match the first registered customer.
 * `payerId` is trustworthy only for authenticated flows (PIX, QR from MP app)
 * where the buyer is logged in — those have no card data.
 */
export function buildFingerprints(data: FingerprintInput): string[] {
  const fps: string[] = [];
  const cpfDigits = data.cpf?.replace(/\D/g, '');
  if (cpfDigits && cpfDigits.length >= 4) {
    fps.push(`cpf:${cpfDigits}`);
  }
  const hasCard = !!(data.cardFirstDigits && data.cardLastDigits);
  if (hasCard) {
    fps.push(`card:${data.cardFirstDigits}_${data.cardLastDigits}`);
  }
  // Only trust payerId when there is no card data (PIX/QR authenticated flow)
  if (data.payerId && !hasCard) {
    fps.push(`payer:${data.payerId}`);
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
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract the CPF digits from a fingerprint array (e.g. "cpf:12345678901" → "12345678901") */
function extractCpfFromFingerprints(fps: string[]): string | null {
  for (const fp of fps) {
    if (fp.startsWith('cpf:')) return fp.slice(4);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Find a previously registered customer.
 *
 * **CPF is the canonical identifier.**
 * 1. If the incoming fingerprints contain a `cpf:` token → match by CPF only.
 *    This avoids cross-contamination when two different people use the same card
 *    or when a shared terminal generates the same payer ID.
 * 2. If there is NO cpf token → fall back to matching any secondary fingerprint
 *    (card / payer), but ONLY against customers who also have no CPF stored
 *    (to prevent hijacking a CPF-identified customer via a card token).
 *
 * Updates `lastSeen` on match (side-effect).
 */
export function findCustomerByFingerprint(fingerprints: string[]): KnownCustomer | null {
  if (!fingerprints.length) return null;

  const customers = getKnownCustomers();
  const incomingCpf = extractCpfFromFingerprints(fingerprints);

  let match: KnownCustomer | undefined;

  if (incomingCpf) {
    // CPF-first lookup: exact match on stored CPF field
    match = customers.find(c => c.cpf === incomingCpf);
  } else {
    // No CPF in input → secondary fingerprint match (card / payer)
    const fpSet = new Set(fingerprints);
    match = customers.find(c => c.fingerprints.some(fp => fpSet.has(fp)));
  }

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
 *
 * **CPF is the canonical identifier.**
 * - If CPF is provided → lookup by CPF first. If found, update.
 * - If no CPF (or CPF not found) → lookup by secondary fingerprint.
 *   But only match against customers without a CPF to prevent hijacking.
 * - On update: merge fingerprints, update name/cpf.
 * - On new: create entry.
 * - Enforce LRU cap by evicting the oldest (by lastSeen) entries.
 */
export function registerCustomer(
  name: string,
  cpf: string,
  fingerprints: string[],
): void {
  if (!name.trim() || !fingerprints.length) return;

  const customers = getKnownCustomers();
  const cpfDigits = cpf.replace(/\D/g, '');
  let existingIdx = -1;

  // 1) CPF-first: if caller provided CPF, match on stored CPF
  if (cpfDigits.length >= 4) {
    existingIdx = customers.findIndex(c => c.cpf === cpfDigits);
  }

  // 2) Fallback: match by secondary fingerprint, but ONLY against
  //    customers with no CPF stored (avoid merging into wrong person)
  if (existingIdx < 0) {
    const fpSet = new Set(fingerprints);
    existingIdx = customers.findIndex(c =>
      !c.cpf && c.fingerprints.some(fp => fpSet.has(fp)),
    );
  }

  if (existingIdx >= 0) {
    // Update existing
    const existing = customers[existingIdx];
    existing.name = name.trim();
    if (cpfDigits.length >= 4) existing.cpf = cpfDigits;
    // Merge fingerprints (deduplicate)
    const mergedFps = new Set([...existing.fingerprints, ...fingerprints]);
    existing.fingerprints = [...mergedFps];
    existing.lastSeen = Date.now();
  } else {
    // New entry
    customers.push({
      name: name.trim(),
      cpf: cpfDigits,
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
