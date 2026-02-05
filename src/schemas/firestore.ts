/**
 * ============================================
 * Zod Schemas for Firestore Document Validation
 * ============================================
 * 
 * Runtime validation schemas para garantir integridade
 * dos dados entre aplicações e Firestore.
 * 
 * Uso: validar dados antes de write e após read
 */

import { z } from 'zod';

// ============================================
// Timestamp Schema (compatível com Firebase)
// ============================================
export const FirestoreTimestamp = z.union([
    z.date(),
    z.string().datetime(),
    z.object({
        seconds: z.number(),
        nanoseconds: z.number(),
    }),
]);

// ============================================
// Product Schemas
// ============================================
export const ProductSizeSchema = z.object({
    key: z.string(),
    label: z.string(),
    price: z.number().min(0),
    ml: z.number().min(0),
});

export const ProductSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    price: z.number().min(0),
    description: z.string(),
    image: z.string().url().optional(),
    tags: z.array(z.string()),
    inStock: z.boolean(),
    category: z.string(),
    stock: z.number().int().min(0),
    minStock: z.number().int().min(0).optional(),

    // Drink-specific fields
    isDrink: z.boolean().optional(),
    sizes: z.array(ProductSizeSchema).optional(),
    defaultSizeKey: z.string().optional(),
    totalMlAvailable: z.number().min(0).optional(),

    // Multi-store support
    storeId: z.string().optional(),

    // Metadata (canonical)
    createdAt: FirestoreTimestamp.optional(),
    updatedAt: FirestoreTimestamp.optional(),
    // Legacy fields (deprecated)
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
});

export type ProductInput = z.infer<typeof ProductSchema>;

// ============================================
// Order Schemas
// ============================================
export const OrderStatusSchema = z.enum([
    'created',
    'at_terminal',
    'opened',
    'processed',
    'closed',
    'canceled',
    'expired',
    'failed',
    'action_required',
]);

export const PaymentStatusSchema = z.enum([
    'created',
    'pending',
    'approved',
    'declined',
    'refunded',
    'processed',
]);

export const PaymentMethodSchema = z.enum([
    'pix_qr',
    'credit_card',
    'debit_card',
    'mercadopago_qr',
    'mercadopago_point',
    'cash',
    'unknown',
]);

export const OrderItemSchema = z.object({
    productId: z.string().min(1),
    title: z.string(),
    quantity: z.number().int().min(1),
    price: z.number().min(0),
    total: z.number().min(0),
});

export const OrderSchema = z.object({
    id: z.string().min(1),
    total: z.number().min(0),
    status: OrderStatusSchema,
    paymentStatus: PaymentStatusSchema,
    paymentMethod: PaymentMethodSchema,
    storeId: z.string().optional(),
    franchiseId: z.string().optional(),
    items: z.array(OrderItemSchema).optional(),
    createdAt: FirestoreTimestamp.optional(),
    timestamp: FirestoreTimestamp.optional(),
    updatedAt: FirestoreTimestamp.optional(),

    // Status change tracking
    cancelledAt: FirestoreTimestamp.optional(),
    refundedAt: FirestoreTimestamp.optional(),
    notes: z.string().optional(),
});

export type OrderInput = z.infer<typeof OrderSchema>;

// ============================================
// Franchise Schemas
// ============================================
export const FranchisePlanSchema = z.enum([
    'free',
    'trial',
    'starter',
    'pro',
    'enterprise',
]);

export const PlanStatusSchema = z.enum([
    'active',
    'past_due',
    'unpaid',
    'canceled',
    'paused',
    'trial',
    'expired',
]);

export const FranchiseSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    ownerId: z.string().min(1),
    plan: FranchisePlanSchema,
    planStatus: PlanStatusSchema,
    planExpiresAt: FirestoreTimestamp.optional(),
    maxStores: z.number().int().min(1),
    maxUsersPerStore: z.number().int().min(1),
    stripeCustomerId: z.string().optional(),
    stripeSubscriptionId: z.string().optional(),
    features: z.array(z.string()),
    createdAt: FirestoreTimestamp.optional(),
    updatedAt: FirestoreTimestamp.optional(),
});

export type FranchiseInput = z.infer<typeof FranchiseSchema>;

// ============================================
// Member Schemas
// ============================================
export const MemberRoleSchema = z.enum([
    'superadmin',
    'owner',
    'admin',
    'manager',
    'operator',
    'employee',
    'technician',
    'viewer',
]);

export const MemberSchema = z.object({
    userId: z.string().min(1),
    role: MemberRoleSchema,
    storeAccess: z.array(z.string()), // ['*'] for all stores
    customPermissions: z.array(z.string()).optional(),
    invitedBy: z.string().optional(),
    invitedAt: FirestoreTimestamp.optional(),
    joinedAt: FirestoreTimestamp.optional(),
    isActive: z.boolean(),
});

export type MemberInput = z.infer<typeof MemberSchema>;

// ============================================
// Invitation Schemas
// ============================================
export const InvitationStatusSchema = z.enum([
    'pending',
    'accepted',
    'expired',
    'revoked',
]);

export const InvitationSchema = z.object({
    id: z.string().min(1),
    email: z.string().email(),
    franchiseId: z.string().min(1),
    role: MemberRoleSchema,
    storeAccess: z.array(z.string()),
    invitedBy: z.string().min(1),
    invitedByEmail: z.string().email().optional(),
    status: InvitationStatusSchema,
    token: z.string().min(1),
    expiresAt: FirestoreTimestamp,
    createdAt: FirestoreTimestamp.optional(),
    acceptedAt: FirestoreTimestamp.optional(),
});

export type InvitationInput = z.infer<typeof InvitationSchema>;

// ============================================
// Store Schemas
// ============================================
export const StoreAddressSchema = z.object({
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
});

export const StoreContactSchema = z.object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    whatsapp: z.string().optional(),
});

export const PaymentGatewayConfigSchema = z.object({
    type: z.enum(['mercadopago', 'stripe', 'none']),
    accessToken: z.string().optional(),
    publicKey: z.string().optional(),
    notificationUrl: z.string().url().optional(),
    mode: z.enum(['sandbox', 'production']).optional(),
});

export const StoreSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    franchiseId: z.string().optional(), // Only for franchise mode
    address: StoreAddressSchema.optional(),
    contact: StoreContactSchema.optional(),
    paymentGateway: PaymentGatewayConfigSchema.optional(),
    isActive: z.boolean(),
    createdAt: FirestoreTimestamp.optional(),
    updatedAt: FirestoreTimestamp.optional(),
});

export type StoreInput = z.infer<typeof StoreSchema>;

// ============================================
// Dispenser Schemas
// ============================================
export const DispenserSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    productId: z.string().optional(),
    type: z.enum(['pump', 'valve', 'solenoid']).optional(),
    gpio: z.number().int().min(0).optional(),
    flowRate: z.number().min(0).optional(), // ml per second
    isActive: z.boolean(),
    lastCalibrationAt: FirestoreTimestamp.optional(),
    createdAt: FirestoreTimestamp.optional(),
    updatedAt: FirestoreTimestamp.optional(),
});

export type DispenserInput = z.infer<typeof DispenserSchema>;

// ============================================
// Audit Log Schemas
// ============================================
export const AuditLogActorSchema = z.object({
    id: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().optional(),
    role: MemberRoleSchema.optional(),
});

export const AuditLogTargetSchema = z.object({
    type: z.enum(['user', 'franchise', 'store', 'product', 'order', 'member', 'invitation', 'dispenser', 'settings']),
    id: z.string().min(1),
    name: z.string().optional(),
});

export const AuditLogSchema = z.object({
    id: z.string().min(1),
    action: z.string().min(1), // e.g., 'member.invited', 'product.created'
    actor: AuditLogActorSchema,
    target: AuditLogTargetSchema.optional(),
    details: z.record(z.unknown()).optional(),
    timestamp: FirestoreTimestamp,
    franchiseId: z.string().optional(),
    storeId: z.string().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
});

export type AuditLogInput = z.infer<typeof AuditLogSchema>;

// ============================================
// SyncQueue Schemas (IndexedDB)
// ============================================
export const SyncQueueItemSchema = z.object({
    id: z.string().min(1),
    operation: z.enum(['create', 'update', 'delete']),
    collection: z.string().min(1),
    docId: z.string().min(1),
    data: z.unknown().optional(),
    createdAt: z.number(),
    retryCount: z.number().int().min(0).max(5),
    storeId: z.string(),
});

export type SyncQueueItemInput = z.infer<typeof SyncQueueItemSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Validates data before writing to Firestore.
 * Strips unknown fields and returns validated data.
 */
export function validateForWrite<T extends z.ZodSchema>(
    schema: T,
    data: unknown
): z.infer<T> {
    return schema.parse(data);
}

/**
 * Safely parses data from Firestore.
 * Returns null if validation fails (logs warning).
 */
export function safeParseFromFirestore<T extends z.ZodSchema>(
    schema: T,
    data: unknown,
    context?: string
): z.infer<T> | null {
    const result = schema.safeParse(data);
    if (!result.success) {
        console.warn(
            `[Zod] Validation failed${context ? ` for ${context}` : ''}:`,
            result.error.issues
        );
        return null;
    }
    return result.data;
}

/**
 * Normalizes legacy field names to canonical format.
 * E.g., created_at → createdAt
 */
export function normalizeTimestampFields<T extends Record<string, unknown>>(
    data: T
): T {
    const normalized = { ...data } as Record<string, unknown>;

    // Normalize legacy snake_case to camelCase
    if ('created_at' in normalized && !('createdAt' in normalized)) {
        normalized.createdAt = normalized.created_at;
        delete normalized.created_at;
    }
    if ('updated_at' in normalized && !('updatedAt' in normalized)) {
        normalized.updatedAt = normalized.updated_at;
        delete normalized.updated_at;
    }

    return normalized as T;
}
