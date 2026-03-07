/**
 * Tests: PagBank Gateway Registry configuration
 *
 * Validates that:
 * - PagBank gateway has correct config fields
 * - clientId is NOT required
 * - plugpag.enabled is a toggle
 * - plugpag.activationCode depends on plugpag.enabled
 * - Section fields render properly
 */
import { describe, it, expect } from 'vitest';
import { GATEWAY_REGISTRY, getGatewayById, getAvailableGateways, isGatewaySelectable } from '../config/gateways/index';

describe('PagBank Gateway Registry', () => {
  const pagbank = GATEWAY_REGISTRY.pagbank;

  it('pagbank gateway exists in registry', () => {
    expect(pagbank).toBeDefined();
    expect(pagbank.id).toBe('pagbank');
    expect(pagbank.displayName).toBe('PagBank');
  });

  it('supports pix, credit, and debit methods', () => {
    expect(pagbank.supportedMethods).toContain('pix');
    expect(pagbank.supportedMethods).toContain('credit');
    expect(pagbank.supportedMethods).toContain('debit');
  });

  it('has beta status and is selectable', () => {
    expect(pagbank.status).toBe('beta');
    expect(isGatewaySelectable('pagbank')).toBe(true);
  });

  it('getGatewayById returns pagbank', () => {
    const gw = getGatewayById('pagbank');
    expect(gw).toBeDefined();
    expect(gw?.id).toBe('pagbank');
  });

  it('is included in getAvailableGateways', () => {
    const all = getAvailableGateways();
    const ids = all.map(g => g.id);
    expect(ids).toContain('pagbank');
  });

  describe('configFields', () => {
    const fields = pagbank.configFields;

    it('has section fields for terminal and API', () => {
      const sections = fields.filter(f => f.type === 'section');
      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections.some(s => s.key === '_section_plugpag')).toBe(true);
      expect(sections.some(s => s.key === '_section_api')).toBe(true);
    });

    it('plugpag.enabled is a toggle', () => {
      const field = fields.find(f => f.key === 'plugpag.enabled');
      expect(field).toBeDefined();
      expect(field?.type).toBe('toggle');
    });

    it('plugpag.activationCode depends on plugpag.enabled', () => {
      const field = fields.find(f => f.key === 'plugpag.activationCode');
      expect(field).toBeDefined();
      expect(field?.dependsOn).toBe('plugpag.enabled');
    });

    it('clientId is removed from configFields (dead field)', () => {
      const field = fields.find(f => f.key === 'clientId');
      expect(field).toBeUndefined();
    });

    it('publicKey is NOT required', () => {
      const field = fields.find(f => f.key === 'publicKey');
      expect(field).toBeDefined();
      expect(field?.required).toBe(false);
    });

    it('merchantId is removed from configFields (dead field)', () => {
      const field = fields.find(f => f.key === 'merchantId');
      expect(field).toBeUndefined();
    });
  });

  describe('adminNotes', () => {
    it('mentions PlugPag and Auth Token', () => {
      const notes = pagbank.adminNotes?.join(' ') ?? '';
      expect(notes).toContain('PlugPag');
      expect(notes).toContain('Auth Token');
    });
  });
});

describe('Gateway Registry completeness', () => {
  it('all gateways have required fields', () => {
    for (const [id, gw] of Object.entries(GATEWAY_REGISTRY)) {
      expect(gw.id).toBe(id);
      expect(gw.displayName).toBeTruthy();
      expect(gw.supportedMethods.length).toBeGreaterThan(0);
      expect(['stable', 'beta', 'coming_soon']).toContain(gw.status);
      expect(gw.configFields).toBeDefined();
    }
  });
});
