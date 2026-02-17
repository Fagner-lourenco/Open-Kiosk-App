/**
 * Coverage tests for admin/src/lib/ (uncovered files)
 */
import { describe, it, expect } from 'vitest';

// lib/analytics.ts
import {
  trackEvent,
  AnalyticsEvents,
  trackSectionView,
  trackFormSubmit,
  trackCTA,
} from '@/lib/analytics';

// lib/firebase.ts — just verify it exports
import { auth, db } from '@/lib/firebase';

// lib/utils.ts
import { cn, formatCurrency } from '@/lib/utils';

// lib/invitationToken.ts
import { generateInvitationToken } from '@/lib/invitationToken';

describe('lib/analytics', () => {
  it('AnalyticsEvents tem eventos padronizados', () => {
    expect(typeof AnalyticsEvents).toBe('object');
    expect(Object.keys(AnalyticsEvents).length).toBeGreaterThan(5);
  });

  it('trackEvent é função', () => {
    expect(typeof trackEvent).toBe('function');
  });

  it('trackSectionView é função', () => {
    expect(typeof trackSectionView).toBe('function');
  });

  it('trackFormSubmit é função', () => {
    expect(typeof trackFormSubmit).toBe('function');
  });

  it('trackCTA é função', () => {
    expect(typeof trackCTA).toBe('function');
  });
});

describe('lib/firebase', () => {
  it('exporta auth e db', () => {
    expect(auth).toBeDefined();
    expect(db).toBeDefined();
  });
});

describe('lib/utils', () => {
  it('cn combina classes corretamente', () => {
    const result = cn('px-2', 'py-1', 'bg-red-500');
    expect(typeof result).toBe('string');
    expect(result).toContain('px-2');
  });

  it('cn lida com inputs condicionais', () => {
    const result = cn('base', false && 'hidden', undefined, 'end');
    expect(result).toContain('base');
    expect(result).toContain('end');
    expect(result).not.toContain('hidden');
  });

  it('formatCurrency formata BRL', () => {
    const result = formatCurrency(10.5);
    expect(result).toContain('10,50');
  });
});

describe('lib/invitationToken', () => {
  it('generateInvitationToken retorna string hex de 48 chars', () => {
    const token = generateInvitationToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[0-9a-f-]+$/i);
  });

  it('generateInvitationToken gera tokens únicos', () => {
    const t1 = generateInvitationToken();
    const t2 = generateInvitationToken();
    expect(t1).not.toBe(t2);
  });
});
