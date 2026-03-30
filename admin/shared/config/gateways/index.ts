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
      label: 'User ID *',
      type: 'text',
      required: true,
      placeholder: 'Ex: 123456789',
      helpText: 'ID do usuário na conta Mercado Pago (encontrado em Seu Negócio > Configurações).',
    },
    {
      key: 'storeId',
      label: 'Store ID',
      type: 'text',
      required: false,
      placeholder: 'Ex: 12345678',
      helpText: 'ID da loja no Mercado Pago. Opcional para QR dinâmico.',
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
    // ── Maquininha (PlugPag) ──────────────────────────────
    {
      key: '_section_plugpag',
      label: '🔌 Terminal de Pagamento (Maquininha)',
      type: 'section',
      required: false,
      helpText: 'Pagamentos por cartão de crédito/débito usando a maquininha PagBank conectada via Bluetooth.',
    },
    {
      key: 'plugpag.enabled',
      label: 'Usar Maquininha PagBank',
      type: 'toggle',
      required: false,
      helpText: 'Ative para receber cartão na Moderninha Pro 2 via Bluetooth. Configure o identificador do terminal na seção "Torneiras" abaixo.',
    },
    {
      key: 'plugpag.activationCode',
      label: 'Código de Ativação',
      type: 'text',
      required: false,
      placeholder: 'Ex: 403938',
      helpText: 'Código fornecido pelo PagBank para fluxos legados de ativação. O fluxo principal segue o demo oficial com autenticação interativa.',
      dependsOn: 'plugpag.enabled',
    },
    // ── API PagBank (PIX e cartão online) ────────────────
    {
      key: '_section_api',
      label: '🌐 API PagBank (PIX)',
      type: 'section',
      required: false,
      helpText: 'Para PIX via API, configure o Auth Token no backend (functions/.env). Não é necessário para pagamentos por cartão na maquininha.',
    },
    {
      key: 'publicKey',
      label: 'Public Key',
      type: 'text',
      required: false,
      placeholder: 'Chave pública para tokenização',
      helpText: 'Necessária apenas para cartão online (sem maquininha). Com PlugPag ativo, não é usada. É gerada automaticamente pela API.',
    },
  ],

  adminNotes: [
    '📌 Para maquininha (PlugPag): Ative o toggle acima e configure o identificador do terminal na seção Torneiras.',
    '📌 Para Moderninha PRO/PRO 2/WIFI, prefira o identificador de pareamento exibido como PRO-... no Bluetooth, alinhado ao demo oficial.',
    '📌 Para PIX via API: Configure o Auth Token no backend:',
    '  PAGBANK_AUTH_TOKEN_PRODUCTION=seu_token (no arquivo functions/.env)',
    '  PAGBANK_AUTH_TOKEN_SANDBOX=seu_token_sandbox (para testes)',
    'Auth Token e Public Key são obtidos no painel PagBank. Segredos nunca são armazenados no Firestore.',
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
