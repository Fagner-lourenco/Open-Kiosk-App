/**
 * Tests for knownCustomers.ts — localStorage-based customer fingerprint recognition.
 */

import {
  buildFingerprints,
  getKnownCustomers,
  findCustomerByFingerprint,
  registerCustomer,
} from '@/utils/knownCustomers';

const STORAGE_KEY = 'kiosk_known_customers';

describe('knownCustomers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ---------------------------------------------------------------
  // buildFingerprints
  // ---------------------------------------------------------------
  describe('buildFingerprints', () => {
    it('generates CPF fingerprint from full CPF', () => {
      const fps = buildFingerprints({ cpf: '123.456.789-01' });
      expect(fps).toEqual(['cpf:12345678901']);
    });

    it('generates card fingerprint from first+last digits', () => {
      const fps = buildFingerprints({ cardFirstDigits: '516703', cardLastDigits: '4789' });
      expect(fps).toEqual(['card:516703_4789']);
    });

    it('generates payer fingerprint from payerId when no card data', () => {
      const fps = buildFingerprints({ payerId: '3094070084' });
      expect(fps).toEqual(['payer:3094070084']);
    });

    it('does NOT include payerId when card data is present (POS seller ID)', () => {
      const fps = buildFingerprints({
        payerId: '3094070084',
        cardFirstDigits: '516703',
        cardLastDigits: '4789',
      });
      expect(fps).toEqual(['card:516703_4789']);
      expect(fps).not.toContain('payer:3094070084');
    });

    it('generates multiple fingerprints when data available', () => {
      const fps = buildFingerprints({
        cpf: '12345678901',
        payerId: '555',
        cardFirstDigits: '123456',
        cardLastDigits: '7890',
      });
      // payerId is excluded because card data is present
      expect(fps).toHaveLength(2);
      expect(fps).toContain('cpf:12345678901');
      expect(fps).toContain('card:123456_7890');
      expect(fps).not.toContain('payer:555');
    });

    it('includes payerId when only CPF and payerId are present (PIX flow)', () => {
      const fps = buildFingerprints({
        cpf: '12345678901',
        payerId: '555',
      });
      expect(fps).toHaveLength(2);
      expect(fps).toContain('cpf:12345678901');
      expect(fps).toContain('payer:555');
    });

    it('returns empty array when no data provided', () => {
      expect(buildFingerprints({})).toEqual([]);
    });

    it('ignores short CPF (less than 4 digits)', () => {
      expect(buildFingerprints({ cpf: '12' })).toEqual([]);
    });

    it('ignores card when only first digits provided (no last)', () => {
      expect(buildFingerprints({ cardFirstDigits: '516703' })).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // getKnownCustomers
  // ---------------------------------------------------------------
  describe('getKnownCustomers', () => {
    it('returns empty array when nothing stored', () => {
      expect(getKnownCustomers()).toEqual([]);
    });

    it('returns empty array when storage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not json');
      expect(getKnownCustomers()).toEqual([]);
    });

    it('returns stored customers', () => {
      const data = [{ name: 'João', cpf: '12345678901', fingerprints: ['cpf:12345678901'], lastSeen: 1000 }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      expect(getKnownCustomers()).toEqual(data);
    });
  });

  // ---------------------------------------------------------------
  // registerCustomer
  // ---------------------------------------------------------------
  describe('registerCustomer', () => {
    it('registers a new customer', () => {
      registerCustomer('João Silva', '12345678901', ['cpf:12345678901']);
      const customers = getKnownCustomers();
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('João Silva');
      expect(customers[0].cpf).toBe('12345678901');
      expect(customers[0].fingerprints).toContain('cpf:12345678901');
      expect(customers[0].lastSeen).toBeGreaterThan(0);
    });

    it('updates existing customer by CPF match (canonical ID)', () => {
      registerCustomer('João Silva', '12345678901', ['cpf:12345678901', 'card:111_222']);
      registerCustomer('João S.', '12345678901', ['cpf:12345678901', 'card:333_444']);

      const customers = getKnownCustomers();
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('João S.');
      // Merged fingerprints from both registrations
      expect(customers[0].fingerprints).toContain('card:111_222');
      expect(customers[0].fingerprints).toContain('card:333_444');
    });

    it('does NOT merge different CPF customer via shared card fingerprint', () => {
      registerCustomer('João', '11111111111', ['cpf:11111111111', 'card:516703_4789']);
      registerCustomer('Maria', '22222222222', ['cpf:22222222222', 'card:516703_4789']);

      const customers = getKnownCustomers();
      // They are different people (different CPF) → separate entries
      expect(customers).toHaveLength(2);
      expect(customers[0].name).toBe('João');
      expect(customers[1].name).toBe('Maria');
    });

    it('falls back to fingerprint match for customers without CPF', () => {
      registerCustomer('Anon User', '', ['card:516703_4789']);
      registerCustomer('Now Named', '', ['card:516703_4789']);

      const customers = getKnownCustomers();
      // Same card, no CPF → same person, updated name
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('Now Named');
    });

    it('does not merge card fingerprint into a CPF-identified customer', () => {
      registerCustomer('João', '11111111111', ['cpf:11111111111', 'card:516703_4789']);
      registerCustomer('Stranger', '', ['card:516703_4789']);

      const customers = getKnownCustomers();
      // Stranger has no CPF but card matches João's entry → should NOT merge
      // because João already has a CPF (protected identity)
      expect(customers).toHaveLength(2);
    });

    it('does not register when name is empty', () => {
      registerCustomer('   ', '12345678901', ['cpf:12345678901']);
      expect(getKnownCustomers()).toHaveLength(0);
    });

    it('does not register when fingerprints are empty', () => {
      registerCustomer('João', '12345678901', []);
      expect(getKnownCustomers()).toHaveLength(0);
    });

    it('strips CPF mask on register', () => {
      registerCustomer('João', '123.456.789-01', ['cpf:12345678901']);
      expect(getKnownCustomers()[0].cpf).toBe('12345678901');
    });

    it('enforces LRU cap of 100 entries', () => {
      // Insert 101 customers
      for (let i = 0; i < 101; i++) {
        registerCustomer(`User ${i}`, `${i}`.padStart(11, '0'), [`id:${i}`]);
      }
      const customers = getKnownCustomers();
      expect(customers.length).toBeLessThanOrEqual(100);
    });
  });

  // ---------------------------------------------------------------
  // findCustomerByFingerprint
  // ---------------------------------------------------------------
  describe('findCustomerByFingerprint', () => {
    it('returns null when no customers stored', () => {
      expect(findCustomerByFingerprint(['cpf:12345678901'])).toBeNull();
    });

    it('returns null when no fingerprint matches', () => {
      registerCustomer('João', '12345678901', ['cpf:12345678901']);
      expect(findCustomerByFingerprint(['payer:999'])).toBeNull();
    });

    it('finds customer by CPF fingerprint (canonical match)', () => {
      registerCustomer('João', '12345678901', ['cpf:12345678901', 'card:111_222']);
      const found = findCustomerByFingerprint(['cpf:12345678901', 'card:999_888']);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('João');
    });

    it('finds customer by card fingerprint when no CPF in input', () => {
      registerCustomer('Maria', '', ['card:516703_4789']);
      const found = findCustomerByFingerprint(['card:516703_4789']);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Maria');
    });

    it('CPF match takes priority: same CPF, different card', () => {
      registerCustomer('Fagner', '08405241965', ['cpf:08405241965', 'card:516703_4789']);
      // Search with Fagner's CPF but a different card (new card)
      const found = findCustomerByFingerprint(['cpf:08405241965', 'card:999_888']);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Fagner');
    });

    it('does NOT return wrong customer when CPF differs but card matches', () => {
      registerCustomer('Fagner', '08405241965', ['cpf:08405241965', 'card:516703_4789']);
      // Search with DIFFERENT CPF but same card → CPF takes priority, no match by CPF
      const found = findCustomerByFingerprint(['cpf:99999999999', 'card:516703_4789']);
      expect(found).toBeNull();
    });

    it('matches on card/payer fingerprints when input has no CPF', () => {
      registerCustomer('Maria', '99999999999', ['card:516703_4789']);
      const found = findCustomerByFingerprint(['card:516703_4789']);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Maria');
    });

    it('updates lastSeen on match (side-effect)', () => {
      registerCustomer('João', '12345678901', ['cpf:12345678901']);
      const before = getKnownCustomers()[0].lastSeen;

      const found = findCustomerByFingerprint(['cpf:12345678901']);
      expect(found).not.toBeNull();
      const after = getKnownCustomers()[0].lastSeen;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('returns null when given empty fingerprints array', () => {
      registerCustomer('João', '12345678901', ['cpf:12345678901']);
      expect(findCustomerByFingerprint([])).toBeNull();
    });
  });
});
