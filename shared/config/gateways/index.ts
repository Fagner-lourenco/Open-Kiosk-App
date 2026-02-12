/**
 * Gateway Registry — Definições e Helpers (shared)
 *
 * Registry único de gateways de pagamento.
 * Localizado em shared/ para acesso por ambos Admin e Kiosk.
 *
 * Para adicionar um novo gateway:
 * 1. Adicione a definição no objeto GATEWAY_DEFINITIONS abaixo
 * 2. Atualize GatewayId em ./types.ts
 * 3. Atualize PaymentProvider em shared/types/store.ts (se o gateway será selecionável)
 */

import type { GatewayDefinition, GatewayId } from './types';

// ============================================================================
// Definições dos Gateways
// ============================================================================

const mercadoPagoGateway: GatewayDefinition = {
  id: 'mercado_pago',
  displayName: 'Mercado Pago',
  description: 'PIX via QR Code dinâmico e cartão via terminal Point integrado.',
  icon: 'CreditCard',
  supportedMethods: ['pix', 'credit', 'debit'],
  status: 'stable',
  firestoreKey: 'mercadopago',

  configFields: [
    {
      key: 'userId',
      label: 'User ID',
      type: 'text',
      required: true,
      placeholder: 'Ex: 123456789',
      helpText: 'ID do usuário na conta Mercado Pago (encontrado em Seu Negócio > Configurações).',
    },
    {
      key: 'externalPosId',
      label: 'External POS ID',
      type: 'text',
      required: true,
      placeholder: 'Ex: KIOSK-001',
      helpText: 'Identificador único do ponto de venda (caixa) registrado na API do Mercado Pago.',
    },
    {
      key: 'storeId',
      label: 'Store ID (Gateway)',
      type: 'text',
      required: false,
      placeholder: 'Ex: 12345678',
      helpText: 'ID da loja no Mercado Pago. Opcional para QR dinâmico.',
    },
    {
      key: 'terminalId',
      label: 'Terminal ID (Point)',
      type: 'text',
      required: false,
      placeholder: 'Ex: GERTEC_MP35P__12345',
      helpText: 'ID do terminal físico para pagamentos com cartão. Se vazio, será detectado automaticamente.',
    },
  ],

  adminNotes: [
    'O Access Token deve ser configurado via variável de ambiente (VITE_MP_ACCESS_TOKEN) ou Firebase Functions config. Nunca salve tokens diretamente no Firestore.',
    'Para ambiente de produção, use VITE_MP_ACCESS_TOKEN_PRODUCTION.',
  ],
};

const pagbankGateway: GatewayDefinition = {
  id: 'pagbank',
  displayName: 'PagBank',
  description: 'PIX e cartão via API PagSeguro (processamento server-side via Cloud Functions).',
  icon: 'Landmark',
  supportedMethods: ['pix', 'credit', 'debit'],
  status: 'beta',
  firestoreKey: 'pagbank',

  configFields: [
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      placeholder: 'Client ID da aplicação PagBank',
      helpText: 'Obtido no painel de desenvolvedores do PagBank.',
    },
    {
      key: 'merchantId',
      label: 'Merchant ID',
      type: 'text',
      required: false,
      placeholder: 'ID do vendedor (opcional)',
      helpText: 'Identificador do vendedor no PagBank.',
    },
    {
      key: 'publicKey',
      label: 'Public Key',
      type: 'text',
      required: false,
      placeholder: 'Chave pública para tokenização de cartão',
      helpText: 'Necessária para pagamentos com cartão. Obtida no painel PagBank.',
    },
  ],

  adminNotes: [
    'O Auth Token (segredo) deve ser configurado no backend via Firebase CLI:',
    '  firebase functions:config:set pagbank.auth_token_sandbox="SEU_TOKEN"',
    '  firebase functions:config:set pagbank.auth_token_production="SEU_TOKEN"',
    'O webhook token também deve ser configurado:',
    '  firebase functions:config:set pagbank.webhook_token="SEU_TOKEN"',
    'Esses segredos nunca são armazenados no Firestore.',
  ],
};

const stoneGateway: GatewayDefinition = {
  id: 'stone',
  displayName: 'Stone',
  description: 'Integração com Stone para PIX e cartão (em desenvolvimento).',
  icon: 'CircleDollarSign',
  supportedMethods: ['pix', 'credit', 'debit'],
  status: 'coming_soon',
  firestoreKey: 'stone',

  configFields: [
    {
      key: 'stoneCode',
      label: 'Stone Code',
      type: 'text',
      required: true,
      placeholder: 'Código Stone do estabelecimento',
      helpText: 'Código único fornecido pela Stone.',
    },
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      placeholder: 'Client ID da API Stone',
      helpText: 'Obtido no portal de desenvolvedores Stone.',
    },
  ],

  adminNotes: [
    'Integração Stone em desenvolvimento. Em breve estará disponível.',
  ],
};

// ============================================================================
// Registry
// ============================================================================

/**
 * Registro central de gateways de pagamento.
 */
export const GATEWAY_REGISTRY: Record<GatewayId, GatewayDefinition> = {
  mercado_pago: mercadoPagoGateway,
  pagbank: pagbankGateway,
  stone: stoneGateway,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Retorna a lista de gateways disponíveis, ordenados por status.
 * stable → beta → coming_soon
 */
export function getAvailableGateways(): GatewayDefinition[] {
  const statusOrder: Record<string, number> = { stable: 0, beta: 1, coming_soon: 2 };
  return Object.values(GATEWAY_REGISTRY).sort(
    (a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
  );
}

/**
 * Busca um gateway pelo ID.
 */
export function getGatewayById(id: string): GatewayDefinition | undefined {
  return GATEWAY_REGISTRY[id as GatewayId];
}

/**
 * Verifica se um GatewayId é selecionável (não é coming_soon).
 */
export function isGatewaySelectable(id: GatewayId): boolean {
  const gw = GATEWAY_REGISTRY[id];
  return !!gw && gw.status !== 'coming_soon';
}

/**
 * Retorna dados para badge de status na UI.
 */
export function getGatewayStatusBadge(status: GatewayDefinition['status']): {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
} {
  switch (status) {
    case 'stable':
      return { label: 'Estável', variant: 'default' };
    case 'beta':
      return { label: 'Beta', variant: 'secondary' };
    case 'coming_soon':
      return { label: 'Em breve', variant: 'outline' };
  }
}

export type { GatewayId, GatewayDefinition, GatewayConfigField, GatewayStatus } from './types';
