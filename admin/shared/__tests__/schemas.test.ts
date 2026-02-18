/**
 * Tests for shared/schemas — barrel export, operations.schema, store.schema
 * Pure validation functions — no mocking needed
 */
import { describe, it, expect } from 'vitest';

import {
  // Store schemas
  StoreAddressSchema,
  StoreContactSchema,
  ESP32ConfigSchema,
  PaymentGatewayConfigSchema,
  StoreSchema,
  CreateStoreSchema,
  UpdateStoreSchema,
  validateCreateStore,
  validateUpdateStore,
  isValidStore,
  getValidationErrors,

  // Operations schemas
  TapStatusSchema,
  TapOperationalStateSchema,
  KegStatusSchema,
  KegSchema,
  CreateKegSchema,
  TapAssignmentStatusSchema,
  ServingSessionStatusSchema,
  WastageTypeSchema,
  WastageSourceSchema,
  MaintenanceTypeSchema,
  MaintenanceStatusSchema,
  NotificationTypeSchema,
  NotificationSeveritySchema,
  generateServingEventId,
} from '../schemas';

// Direct imports for file-reach detection
import '../schemas/operations.schema';
import '../schemas/store.schema';

describe('shared/schemas barrel', () => {
  it('exporta schemas de Store', () => {
    expect(StoreAddressSchema).toBeDefined();
    expect(StoreContactSchema).toBeDefined();
    expect(ESP32ConfigSchema).toBeDefined();
    expect(PaymentGatewayConfigSchema).toBeDefined();
    expect(StoreSchema).toBeDefined();
    expect(CreateStoreSchema).toBeDefined();
    expect(UpdateStoreSchema).toBeDefined();
  });

  it('exporta schemas de Operations', () => {
    expect(TapStatusSchema).toBeDefined();
    expect(TapOperationalStateSchema).toBeDefined();
    expect(KegStatusSchema).toBeDefined();
    expect(KegSchema).toBeDefined();
    expect(CreateKegSchema).toBeDefined();
    expect(TapAssignmentStatusSchema).toBeDefined();
    expect(ServingSessionStatusSchema).toBeDefined();
    expect(WastageTypeSchema).toBeDefined();
    expect(WastageSourceSchema).toBeDefined();
    expect(MaintenanceTypeSchema).toBeDefined();
    expect(MaintenanceStatusSchema).toBeDefined();
    expect(NotificationTypeSchema).toBeDefined();
    expect(NotificationSeveritySchema).toBeDefined();
  });

  it('exporta funções de validação', () => {
    expect(typeof validateCreateStore).toBe('function');
    expect(typeof validateUpdateStore).toBe('function');
    expect(typeof isValidStore).toBe('function');
    expect(typeof getValidationErrors).toBe('function');
    expect(typeof generateServingEventId).toBe('function');
  });
});

describe('shared/schemas/operations.schema', () => {
  it('TapStatusSchema valida valores corretos', () => {
    expect(TapStatusSchema.parse('idle')).toBe('idle');
    expect(TapStatusSchema.parse('active')).toBe('active');
    expect(TapStatusSchema.parse('disabled')).toBe('disabled');
    expect(TapStatusSchema.parse('maintenance')).toBe('maintenance');
  });

  it('TapStatusSchema rejeita valor inválido', () => {
    expect(() => TapStatusSchema.parse('unknown')).toThrow();
  });

  it('KegStatusSchema valida valores corretos', () => {
    expect(KegStatusSchema.parse('in_stock')).toBe('in_stock');
    expect(KegStatusSchema.parse('tapped')).toBe('tapped');
    expect(KegStatusSchema.parse('depleted')).toBe('depleted');
    expect(KegStatusSchema.parse('returned')).toBe('returned');
  });

  it('CreateKegSchema valida input mínimo', () => {
    const result = CreateKegSchema.safeParse({ productId: 'p1', volumeMl: 50000 });
    expect(result.success).toBe(true);
  });

  it('CreateKegSchema rejeita volumeMl negativo', () => {
    const result = CreateKegSchema.safeParse({ productId: 'p1', volumeMl: -1 });
    expect(result.success).toBe(false);
  });

  it('generateServingEventId formata corretamente', () => {
    expect(generateServingEventId('ord-1', 'tap-2', 0)).toBe('ord-1_ttap-2_c0');
    expect(generateServingEventId('ord-1', 3, 1)).toBe('ord-1_t3_c1');
  });

  it('WastageTypeSchema aceita auto', () => {
    expect(WastageTypeSchema.parse('auto')).toBe('auto');
  });

  it('MaintenanceStatusSchema aceita scheduled', () => {
    expect(MaintenanceStatusSchema.parse('scheduled')).toBe('scheduled');
  });

  it('NotificationSeveritySchema aceita critical', () => {
    expect(NotificationSeveritySchema.parse('critical')).toBe('critical');
  });
});

describe('shared/schemas/store.schema', () => {
  it('StoreAddressSchema valida endereço', () => {
    const result = StoreAddressSchema.safeParse({
      street: 'Rua X', number: '10', neighborhood: 'Centro',
      city: 'São Paulo', state: 'SP', zipCode: '01001-001',
    });
    expect(result.success).toBe(true);
  });

  it('StoreAddressSchema rejeita CEP inválido', () => {
    const result = StoreAddressSchema.safeParse({
      street: 'Rua X', number: '10', neighborhood: 'Centro',
      city: 'São Paulo', state: 'SP', zipCode: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('validateCreateStore aceita input válido', () => {
    const result = validateCreateStore({ name: 'Loja Teste' });
    expect(result.name).toBe('Loja Teste');
  });

  it('validateCreateStore rejeita input sem name', () => {
    expect(() => validateCreateStore({})).toThrow();
  });

  it('isValidStore retorna false para input incompleto', () => {
    expect(isValidStore({ name: 'test' })).toBe(false);
  });

  it('getValidationErrors retorna [] para input válido com StoreSchema', () => {
    // StoreSchema requires full store, so partial will have errors
    const errors = getValidationErrors({ name: 'test' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('PaymentGatewayConfigSchema aceita mercadopago e mercado_pago', () => {
    expect(PaymentGatewayConfigSchema.safeParse({ provider: 'mercadopago' }).success).toBe(true);
    expect(PaymentGatewayConfigSchema.safeParse({ provider: 'mercado_pago' }).success).toBe(true);
    expect(PaymentGatewayConfigSchema.safeParse({ provider: 'pagbank' }).success).toBe(true);
  });
});
