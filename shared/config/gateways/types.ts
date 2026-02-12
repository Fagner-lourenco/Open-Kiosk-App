/**
 * Gateway Registry — Types (shared)
 *
 * Tipos centrais para o modelo plug-and-play de gateways de pagamento.
 * Localizado em shared/ para acesso por ambos Admin e Kiosk.
 *
 * NÃO importa de @/ ou @shared/ — usa apenas tipos nativos do TypeScript.
 */

// ============================================================================
// Gateway IDs
// ============================================================================

/**
 * Identificador do gateway no registro.
 */
export type GatewayId = 'mercado_pago' | 'pagbank' | 'stone';

// ============================================================================
// Config Schema (campo de formulário)
// ============================================================================

/**
 * Define um campo de configuração do gateway.
 * Usado pelo Admin para renderizar formulários dinâmicos.
 */
export interface GatewayConfigField {
  /** Chave do campo (ex: 'userId', 'clientId') — mapeia para providers.<firestoreKey>.<key> */
  key: string;

  /** Rótulo exibido no formulário */
  label: string;

  /** Tipo do input */
  type: 'text' | 'password' | 'select';

  /** Campo obrigatório? */
  required: boolean;

  /** Placeholder do input */
  placeholder?: string;

  /** Texto de ajuda exibido abaixo do campo */
  helpText?: string;

  /** Opções para type='select' */
  options?: { value: string; label: string }[];
}

// ============================================================================
// Gateway Status
// ============================================================================

/**
 * Maturidade da integração do gateway.
 */
export type GatewayStatus = 'stable' | 'beta' | 'coming_soon';

// ============================================================================
// Gateway Definition (catálogo)
// ============================================================================

/**
 * Definição declarativa de um gateway de pagamento.
 */
export interface GatewayDefinition {
  /** Identificador (ex: 'mercado_pago') */
  id: GatewayId;

  /** Nome exibido na UI (ex: 'Mercado Pago') */
  displayName: string;

  /** Descrição curta */
  description: string;

  /** Ícone (nome de ícone Lucide: 'CreditCard', 'Landmark', etc.) */
  icon: string;

  /** Métodos suportados pelo gateway */
  supportedMethods: Array<'pix' | 'credit' | 'debit' | 'cash'>;

  /** Status de maturidade */
  status: GatewayStatus;

  /** Campos de configuração que o Admin renderiza */
  configFields: GatewayConfigField[];

  /**
   * Notas informativas para o admin (ex: instruções de configuração backend).
   * Exibidas como Alert/Info na UI.
   */
  adminNotes?: string[];

  /**
   * Chave do providers no Firestore: paymentGatewayConfig.providers.<firestoreKey>
   * Permite que o registro use chave diferente do `id` (backward compat).
   * Ex: GatewayId 'mercado_pago' → firestoreKey 'mercadopago'.
   */
  firestoreKey: string;
}
