import { describe, it, expect } from 'vitest';
import {
  GATEWAY_REGISTRY,
  getAvailableGateways,
  getGatewayById,
  isGatewaySelectable,
  getGatewayStatusBadge,
} from '../../shared/config/gateways';

describe('gateway registry branch coverage', () => {
  it('retorna status badges para stable, beta e coming_soon', () => {
    expect(getGatewayStatusBadge('stable')).toEqual({ label: 'Estável', variant: 'default' });
    expect(getGatewayStatusBadge('beta')).toEqual({ label: 'Beta', variant: 'secondary' });
    expect(getGatewayStatusBadge('coming_soon')).toEqual({ label: 'Em breve', variant: 'outline' });
  });

  it('getGatewayById retorna definições esperadas', () => {
    expect(getGatewayById('mercado_pago')?.status).toBe('stable');
    expect(getGatewayById('pagbank')?.status).toBe('beta');
    expect(getGatewayById('stone')?.status).toBe('coming_soon');
  });

  it('isGatewaySelectable cobre gateways existentes true/false', () => {
    expect(isGatewaySelectable('mercado_pago')).toBe(true);
    expect(isGatewaySelectable('pagbank')).toBe(true);
    expect(isGatewaySelectable('stone')).toBe(false);
  });

  it('ordena gateways na ordem padrão stable -> beta -> coming_soon', () => {
    const ordered = getAvailableGateways().map((item) => item.id);
    expect(ordered).toEqual(['mercado_pago', 'pagbank', 'stone']);
  });

  it('ordena gateways com fallback quando status não mapeado', () => {
    const originalStatus = GATEWAY_REGISTRY.stone.status;
    const originalMp = GATEWAY_REGISTRY.mercado_pago.status;
    const originalPg = GATEWAY_REGISTRY.pagbank.status;

    try {
      (GATEWAY_REGISTRY.stone as any).status = 'experimental';
      (GATEWAY_REGISTRY.mercado_pago as any).status = 'experimental';
      (GATEWAY_REGISTRY.pagbank as any).status = 'experimental';
      const ordered = getAvailableGateways();
      expect(ordered[ordered.length - 1].id).toBe('stone');
    } finally {
      (GATEWAY_REGISTRY.stone as any).status = originalStatus;
      (GATEWAY_REGISTRY.mercado_pago as any).status = originalMp;
      (GATEWAY_REGISTRY.pagbank as any).status = originalPg;
    }
  });

  it('retorna undefined para gateway inexistente', () => {
    expect(getGatewayById('unknown-gateway')).toBeUndefined();
  });

  it('isGatewaySelectable retorna false quando gateway não existe', () => {
    expect(isGatewaySelectable('unknown' as any)).toBe(false);
  });

  it('getGatewayStatusBadge retorna undefined para status desconhecido', () => {
    expect(getGatewayStatusBadge('unknown' as any)).toBeUndefined();
  });
});
