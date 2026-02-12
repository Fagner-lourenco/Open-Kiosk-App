/**
 * Gateway Registry — Barrel Export
 *
 * Re-exports from shared/ (single source of truth) for convenience.
 */

export {
  GATEWAY_REGISTRY,
  getAvailableGateways,
  getGatewayById,
  isGatewaySelectable,
  getGatewayStatusBadge,
} from '../../../shared/config/gateways';

export type {
  GatewayId,
  GatewayDefinition,
  GatewayConfigField,
  GatewayStatus,
} from '../../../shared/config/gateways';
