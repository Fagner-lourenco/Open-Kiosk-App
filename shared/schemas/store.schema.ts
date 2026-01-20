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
 * Schema de configuração de pagamento
 */
export const PaymentGatewayConfigSchema = z.object({
  provider: z.enum(['mercadopago', 'stripe', 'pix']),
  accessToken: z.string().optional(),
  publicKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  sandbox: z.boolean().default(true),
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
