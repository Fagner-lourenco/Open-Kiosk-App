/**
 * Tests for lib/firebase.ts
 * Covers: db, auth, storage, admin, serverTimestamp, increment, arrayUnion, arrayRemove
 */
import { vi, describe, it, expect } from 'vitest';

vi.mock('firebase-admin', () => {
  const firestoreFn = vi.fn(() => ({
    settings: vi.fn(),
  }));
  (firestoreFn as any).FieldValue = {
    serverTimestamp: vi.fn(() => 'TS'),
    increment: vi.fn((n: number) => n),
    arrayUnion: vi.fn((...els: any[]) => els),
    arrayRemove: vi.fn((...els: any[]) => els),
  };

  const admin = {
    apps: [{}], // Simulate already initialized
    initializeApp: vi.fn(),
    firestore: firestoreFn,
    auth: vi.fn(() => ({})),
    storage: vi.fn(() => ({})),
  };
  return { default: admin, ...admin };
});

import { db, auth, storage, admin, serverTimestamp, increment, arrayUnion, arrayRemove } from '../lib/firebase';

describe('lib/firebase', () => {
  it('exporta db', () => {
    expect(db).toBeDefined();
  });

  it('exporta auth', () => {
    expect(auth).toBeDefined();
  });

  it('exporta storage', () => {
    expect(storage).toBeDefined();
  });

  it('exporta admin', () => {
    expect(admin).toBeDefined();
  });

  it('serverTimestamp retorna valor', () => {
    expect(serverTimestamp()).toBeDefined();
  });

  it('increment retorna valor', () => {
    const result = increment(5);
    expect(result).toBeDefined();
  });

  it('arrayUnion retorna valor', () => {
    const result = arrayUnion('a', 'b');
    expect(result).toBeDefined();
  });

  it('arrayRemove retorna valor', () => {
    const result = arrayRemove('a');
    expect(result).toBeDefined();
  });
});
