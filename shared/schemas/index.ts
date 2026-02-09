/**
 * ============================================================================
 * Schemas de Validação - Barrel Export
 * ============================================================================
 *
 * Re-exporta todos os schemas Zod para uso em Kiosk e Admin.
 *
 * IMPORTANTE: Antes de gravar dados no Firestore, valide usando estes schemas.
 *
 * @example
 * import { validateCreateStore } from '@shared/schemas';
 *
 * try {
 *   const validData = validateCreateStore(rawData);
 *   await createStore(validData);
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Validação falhou:', error.errors);
 *   }
 * }
 */

// Store schemas
export {
  // Schemas
  StoreAddressSchema,
  StoreContactSchema,
  ESP32ConfigSchema,
  PaymentGatewayConfigSchema,
  StoreSchema,
  CreateStoreSchema,
  UpdateStoreSchema,

  // Types
  type StoreAddressInput,
  type StoreContactInput,
  type ESP32ConfigInput,
  type PaymentGatewayConfigInput,
  type StoreInput,
  type CreateStoreInput,
  type UpdateStoreInput,

  // Validation functions
  validateCreateStore,
  validateUpdateStore,
  validateStore,
  isValidStore,
  getValidationErrors,
} from './store.schema';

// Operations schemas (ERP Vertical de Chopp)
export {
  // Schemas
  TapStatusSchema,
  TapOperationalStateSchema,
  KegStatusSchema,
  KegSchema,
  CreateKegSchema,
  TapAssignmentStatusSchema,
  TapAssignmentSchema,
  ServingSessionStatusSchema,
  ServingSessionSchema,
  WastageTypeSchema,
  WastageSourceSchema,
  WastageEventSchema,
  MaintenanceTypeSchema,
  MaintenanceStatusSchema,
  MaintenanceLogSchema,
  NotificationTypeSchema,
  NotificationSeveritySchema,
  OperationalNotificationSchema,

  // Types
  type TapOperationalStateInput,
  type KegInput,
  type CreateKegInput,
  type TapAssignmentInput,
  type ServingSessionInput,
  type WastageEventInput,
  type MaintenanceLogInput,
  type OperationalNotificationInput,

  // Helpers
  generateServingEventId,
} from './operations.schema';
