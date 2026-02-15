/**
 * ============================================================================
 * Schemas de Validação - Store (Loja)
 * ============================================================================
 * 
 * Schemas Zod para validação de dados de lojas.
 * Use antes de gravar no Firestore para garantir integridade.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { z } from 'zod';

// ============================================================================
// SCHEMAS BASE
// ============================================================================

/**
 * Schema de endereço
 */
export const StoreAddressSchema = z.object({
  street: z.string().min(1, 'Rua é obrigatória').max(200),
  number: z.string().min(1, 'Número é obrigatório').max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(1, 'Bairro é obrigatório').max(100),
  city: z.string().min(1, 'Cidade é obrigatória').max(100),
  state: z.string().min(2).max(2, 'Use a sigla do estado (ex: SP)'),
  zipCode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  country: z.string().default('BR'),
});

/**
 * Schema de contato
 */
export const StoreContactSchema = z.object({
  phone: z.string().min(10, 'Telefone deve ter pelo menos 10 dígitos').max(20),
  email: z.string().email('Email inválido'),
  website: z.string().url('URL inválida').optional(),
});

/**
 * Schema de configuração ESP32
 */
export const ESP32ConfigSchema = z.object({
  connectionType: z.enum(['usb', 'wifi', 'ble', 'bluetooth']),
  connectionId: z.string().optional(),
  lastSeen: z.date().optional(),
  firmwareVersion: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  comPort: z.string().regex(/^COM\d+$/).optional(),
});

/**
 * Schema de métodos de pagamento habilitados
 */
const EnabledPaymentMethodsSchema = z.object({
  cash: z.boolean().default(true),
  pix: z.boolean().default(true),
  credit: z.boolean().default(true),
  debit: z.boolean().default(true),
});

/**
 * Schema de configuração PlugPag (card-present via Bluetooth terminal)
 */
const PlugPagConfigSchema = z.object({
  enabled: z.boolean().default(false),
  deviceId: z.string(),
  activationCode: z.string().optional(),
});

/**
 * Schema de configuração de provedor PagBank (sem segredos)
 */
const PagBankProviderConfigSchema = z.object({
  clientId: z.string().optional(),
  merchantId: z.string().optional(),
  publicKey: z.string().optional(),
  plugpag: PlugPagConfigSchema.optional(),
});

/**
 * Schema de configuração de provedor Mercado Pago (sem segredos)
 */
const MercadoPagoProviderConfigSchema = z.object({
  userId: z.string().optional(),
  storeId: z.string().optional(),
  externalPosId: z.string().optional(),
  terminalId: z.string().optional(),
});

/**
 * Schema de configuração de pagamento (input validation)
 *
 * IMPORTANT: This schema accepts BOTH 'mercado_pago' (canonical) and
 * 'mercadopago' (legacy) because it needs to validate documents read from
 * Firestore that may still contain the legacy format.
 *
 * Runtime normalization via normalizeProvider() and normalizePaymentGatewayConfig()
 * ensures that the canonical format is always used in application code.
 *
 * The type layer (PaymentProvider type) enforces canonical format only,
 * ensuring type safety while this schema layer maintains backward compatibility.
 *
 * @see normalizeProvider() - Converts legacy 'mercadopago' → 'mercado_pago'
 * @see PaymentProvider type - Enforces canonical format
 */
export const PaymentGatewayConfigSchema = z.object({
  provider: z.enum(['none', 'mercado_pago', 'mercadopago', 'pagbank']),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  enabledMethods: EnabledPaymentMethodsSchema.default({
    cash: true,
    pix: true,
    credit: true,
    debit: true,
  }),
  pixKey: z.string().optional(),
  providers: z.object({
    pagbank: PagBankProviderConfigSchema.optional(),
    mercadopago: MercadoPagoProviderConfigSchema.optional(),
  }).optional(),

  // Legacy fields (read-compat only)
  accessToken: z.string().optional(),
  mode: z.enum(['sandbox', 'production']).optional(),
  userId: z.string().optional(),
  storeId: z.string().optional(),
  externalPosId: z.string().optional(),
  terminalId: z.string().optional(),
  pollingIntervalMs: z.number().optional(),
  pollingMaxAttempts: z.number().optional(),
  pointExpirationTime: z.string().optional(),
  qrExpirationMinutes: z.number().optional(),
  configuredAt: z.string().optional(),
  configuredBy: z.string().optional(),
  lastValidatedAt: z.string().optional(),
  lastValidationResult: z.enum(['success', 'error']).optional(),
});

// ============================================================================
// SCHEMA DE VÍDEO DA TELA DE ATRAÇÃO
// ============================================================================

/**
 * Schema de configuração do vídeo da tela de atração
 */
export const AttractVideoConfigSchema = z.object({
  isEnabled: z.boolean().default(false),
  videoUrl: z.string().url('URL inválida').optional(),
  displayTitle: z.string().max(200).optional(),
  displaySubtitle: z.string().max(200).optional(),
  videoOpacity: z.number().min(0).max(1).default(0.4),
  videoCoverMode: z.enum(['cover', 'contain']).default('cover'),
  lastValidatedAt: z.string().optional(),
  lastValidationResult: z.enum(['valid', 'invalid', 'cors_warning']).optional(),
  contentType: z.string().optional(),
});

// ============================================================================
// SCHEMA PRINCIPAL - STORE
// ============================================================================

/**
 * Schema completo da loja
 */
export const StoreSchema = z.object({
  id: z.string().min(1),
  franchiseId: z.string().min(1, 'Franquia é obrigatória'),
  slug: z.string()
    .min(3, 'Slug deve ter pelo menos 3 caracteres')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  isActive: z.boolean().default(true),
  
  // Localização
  address: StoreAddressSchema.optional(),
  contact: StoreContactSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  timezone: z.string().default('America/Sao_Paulo'),
  
  // Fiscal
  taxId: z.string().optional(),
  currency: z.string().length(3).default('BRL'),
  taxPercentage: z.number().min(0).max(100).default(0),
  
  // Interface
  language: z.enum(['pt-BR', 'en']).default('pt-BR'),
  attractTimeoutSeconds: z.number().min(10).max(600).default(60),
  useThermalPrinter: z.boolean().default(false),

  // Kiosk (store-level)
  kioskEnabled: z.boolean().default(false),
  attractScreenEnabled: z.boolean().default(true),
  attractVideoConfig: AttractVideoConfigSchema.optional(),

  // Legacy fields (backward compat)
  kioskMode: z.boolean().optional(),
  idleTimeout: z.number().optional(),
  _migrationVersion: z.number().optional(),

  // Hardware
  esp32Config: ESP32ConfigSchema.optional(),
  comPort: z.string().optional(),
  paymentGatewayConfig: PaymentGatewayConfigSchema.optional(),
  
  // Metadados
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().optional(),
});

/**
 * Schema para criar loja (campos opcionais com defaults)
 */
export const CreateStoreSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  slug: z.string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .transform((val, ctx) => {
      if (val) return val;
      // Gera slug a partir do nome se não fornecido
      const name = ctx.path.length > 0 ? '' : '';
      return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }),
  franchiseId: z.string().optional(),
  address: StoreAddressSchema.partial().optional(),
  contact: StoreContactSchema.partial().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  language: z.enum(['pt-BR', 'en']).optional(),
  taxId: z.string().optional(),
  taxPercentage: z.number().min(0).max(100).optional(),
});

/**
 * Schema para atualizar loja
 */
export const UpdateStoreSchema = CreateStoreSchema.partial().extend({
  isActive: z.boolean().optional(),
  attractTimeoutSeconds: z.number().min(10).max(600).optional(),
  useThermalPrinter: z.boolean().optional(),
  kioskEnabled: z.boolean().optional(),
  attractScreenEnabled: z.boolean().optional(),
  attractVideoConfig: AttractVideoConfigSchema.partial().optional(),
  esp32Config: ESP32ConfigSchema.partial().optional(),
  paymentGatewayConfig: PaymentGatewayConfigSchema.partial().optional(),
});

// ============================================================================
// TIPOS INFERIDOS
// ============================================================================

export type StoreAddressInput = z.infer<typeof StoreAddressSchema>;
export type StoreContactInput = z.infer<typeof StoreContactSchema>;
export type ESP32ConfigInput = z.infer<typeof ESP32ConfigSchema>;
export type PaymentGatewayConfigInput = z.infer<typeof PaymentGatewayConfigSchema>;
export type AttractVideoConfigInput = z.infer<typeof AttractVideoConfigSchema>;
export type StoreInput = z.infer<typeof StoreSchema>;
export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

// ============================================================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================================================

/**
 * Valida dados de criação de loja
 */
export function validateCreateStore(data: unknown): CreateStoreInput {
  return CreateStoreSchema.parse(data);
}

/**
 * Valida dados de atualização de loja
 */
export function validateUpdateStore(data: unknown): UpdateStoreInput {
  return UpdateStoreSchema.parse(data);
}

/**
 * Valida dados completos de loja
 */
export function validateStore(data: unknown): StoreInput {
  return StoreSchema.parse(data);
}

/**
 * Verifica se dados são válidos sem lançar erro
 */
export function isValidStore(data: unknown): data is StoreInput {
  return StoreSchema.safeParse(data).success;
}

/**
 * Retorna erros de validação formatados
 */
export function getValidationErrors(data: unknown): string[] {
  const result = StoreSchema.safeParse(data);
  if (result.success) return [];
  return result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
}
