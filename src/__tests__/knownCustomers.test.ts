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

    it('generates payer fingerprint from payerId', () => {
      const fps = buildFingerprints({ payerId: '3094070084' });
      expect(fps).toEqual(['payer:3094070084']);
    });

    it('generates multiple fingerprints when data available', () => {
      const fps = buildFingerprints({
        cpf: '12345678901',
        payerId: '555',
        cardFirstDigits: '123456',
        cardLastDigits: '7890',
      });
      expect(fps).toHaveLength(3);
      expect(fps).toContain('cpf:12345678901');
      expect(fps).toContain('payer:555');
      expect(fps).toContain('card:123456_7890');
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

    it('updates existing customer on matching fingerprint', () => {
      registerCustomer('João Silva', '12345678901', ['cpf:12345678901']);
      registerCustomer('João S.', '12345678901', ['cpf:12345678901', 'payer:999']);

      const customers = getKnownCustomers();
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('João S.');
      expect(customers[0].fingerprints).toContain('cpf:12345678901');
      expect(customers[0].fingerprints).toContain('payer:999');
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

    it('finds customer by matching fingerprint', () => {
      registerCustomer('João', '12345678901', ['cpf:12345678901', 'payer:42']);
      const found = findCustomerByFingerprint(['payer:42']);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('João');
    });

    it('matches on any of multiple provided fingerprints', () => {
      registerCustomer('Maria', '99999999999', ['card:516703_4789']);
      const found = findCustomerByFingerprint(['cpf:11111111111', 'card:516703_4789']);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Maria');
    });

    it('updates lastSeen on match (side-effect)', () => {
      registerCustomer('João', '12345678901', ['cpf:12345678901']);
      const before = getKnownCustomers()[0].lastSeen;

      // findCustomerByFingerprint should update lastSeen to current Date.now()
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
