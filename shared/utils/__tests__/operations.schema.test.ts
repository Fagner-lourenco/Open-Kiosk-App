/**
 * Tests for operational schemas (ERP Vertical de Chopp)
 */
import { describe, it, expect } from 'vitest';
import {
  TapOperationalStateSchema,
  KegSchema,
  CreateKegSchema,
  TapAssignmentSchema,
  ServingSessionSchema,
  WastageEventSchema,
  MaintenanceLogSchema,
  OperationalNotificationSchema,
  generateServingEventId,
} from '../../schemas/operations.schema';

describe('generateServingEventId', () => {
  it('generates deterministic eventId', () => {
    const id = generateServingEventId('ORD-123', '0', 2);
    expect(id).toBe('ORD-123_t0_c2');
  });

  it('handles numeric tapId', () => {
    const id = generateServingEventId('ABC', 3, 0);
    expect(id).toBe('ABC_t3_c0');
  });

  it('is idempotent for same inputs', () => {
    const a = generateServingEventId('X', '1', 5);
    const b = generateServingEventId('X', '1', 5);
    expect(a).toBe(b);
  });
});

describe('ServingSessionSchema', () => {
  const validSession = {
    eventId: 'ORD1_t0_c0',
    orderId: 'ORD1',
    tapId: '0',
    kegId: 'keg-abc',
    productId: 'prod-1',
    cupIndex: 0,
    targetMl: 300,
    actualMl: 295,
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    status: 'completed' as const,
    source: 'kiosk' as const,
    franchiseId: 'f1',
    storeId: 's1',
  };

  it('validates a correct session', () => {
    const result = ServingSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it('allows null kegId', () => {
    const result = ServingSessionSchema.safeParse({ ...validSession, kegId: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = ServingSessionSchema.safeParse({ ...validSession, status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rejects missing franchiseId', () => {
    const { franchiseId, ...rest } = validSession;
    const result = ServingSessionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects negative actualMl', () => {
    const result = ServingSessionSchema.safeParse({ ...validSession, actualMl: -10 });
    expect(result.success).toBe(false);
  });
});

describe('KegSchema', () => {
  const validKeg = {
    kegId: 'keg-1',
    productId: 'prod-1',
    volumeMl: 30000,
    remainingMl: 25000,
    status: 'in_stock' as const,
    tapId: null,
    tappedAt: null,
    depletedAt: null,
    createdAt: new Date(),
    createdBy: 'user-1',
    updatedAt: new Date(),
    updatedBy: 'user-1',
  };

  it('validates a correct keg', () => {
    const result = KegSchema.safeParse(validKeg);
    expect(result.success).toBe(true);
  });

  it('rejects negative remainingMl', () => {
    const result = KegSchema.safeParse({ ...validKeg, remainingMl: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero volumeMl', () => {
    const result = KegSchema.safeParse({ ...validKeg, volumeMl: 0 });
    expect(result.success).toBe(false);
  });

  it('allows optional fields', () => {
    const result = KegSchema.safeParse({ ...validKeg, batchCode: 'B001', cost: 150.50 });
    expect(result.success).toBe(true);
  });
});

describe('CreateKegSchema', () => {
  it('validates minimal create data', () => {
    const result = CreateKegSchema.safeParse({ productId: 'p1', volumeMl: 50000 });
    expect(result.success).toBe(true);
  });

  it('rejects empty productId', () => {
    const result = CreateKegSchema.safeParse({ productId: '', volumeMl: 50000 });
    expect(result.success).toBe(false);
  });
});

describe('TapOperationalStateSchema', () => {
  const validTap = {
    tapId: '0',
    status: 'idle' as const,
    currentKegId: null,
    todayMlDispensed: 0,
    todaySessions: 0,
    todayWastageMl: 0,
    createdAt: new Date(),
    createdBy: 'system',
    updatedAt: new Date(),
    updatedBy: 'system',
  };

  it('validates a correct tap state', () => {
    const result = TapOperationalStateSchema.safeParse(validTap);
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = TapOperationalStateSchema.safeParse({ ...validTap, status: 'broken' });
    expect(result.success).toBe(false);
  });
});

describe('WastageEventSchema', () => {
  const validWastage = {
    id: 'w1',
    type: 'foam' as const,
    tapId: '0',
    kegId: 'keg-1',
    mlLost: 50,
    source: 'admin' as const,
    createdAt: new Date(),
    createdBy: 'user-1',
    franchiseId: 'f1',
    storeId: 's1',
  };

  it('validates a correct wastage event', () => {
    const result = WastageEventSchema.safeParse(validWastage);
    expect(result.success).toBe(true);
  });

  it('allows auto source and type', () => {
    const result = WastageEventSchema.safeParse({
      ...validWastage, type: 'auto', source: 'auto',
    });
    expect(result.success).toBe(true);
  });
});

describe('MaintenanceLogSchema', () => {
  const validLog = {
    id: 'm1',
    type: 'cleaning' as const,
    status: 'scheduled' as const,
    scheduledAt: new Date(),
    createdAt: new Date(),
    createdBy: 'user-1',
    updatedAt: new Date(),
    updatedBy: 'user-1',
    franchiseId: 'f1',
    storeId: 's1',
  };

  it('validates a correct maintenance log', () => {
    const result = MaintenanceLogSchema.safeParse(validLog);
    expect(result.success).toBe(true);
  });

  it('allows all status values', () => {
    for (const status of ['scheduled', 'overdue', 'completed', 'canceled']) {
      const result = MaintenanceLogSchema.safeParse({ ...validLog, status });
      expect(result.success).toBe(true);
    }
  });
});

describe('TapAssignmentSchema', () => {
  const validAssignment = {
    assignmentId: 'a1',
    tapId: '0',
    kegId: 'keg-1',
    status: 'active' as const,
    attachedAt: new Date(),
    attachedBy: 'user-1',
    removedAt: null,
    removedBy: null,
    totalMlDispensed: 0,
    totalSessions: 0,
    totalWastageMl: 0,
    createdAt: new Date(),
    createdBy: 'user-1',
    updatedAt: new Date(),
    updatedBy: 'user-1',
  };

  it('validates a correct assignment', () => {
    const result = TapAssignmentSchema.safeParse(validAssignment);
    expect(result.success).toBe(true);
  });

  it('validates removed assignment', () => {
    const result = TapAssignmentSchema.safeParse({
      ...validAssignment,
      status: 'removed',
      removedAt: new Date(),
      removedBy: 'user-2',
      removalReason: 'Keg empty',
    });
    expect(result.success).toBe(true);
  });
});

describe('OperationalNotificationSchema', () => {
  it('validates a correct notification', () => {
    const result = OperationalNotificationSchema.safeParse({
      id: 'n1',
      type: 'keg_low',
      severity: 'warning',
      message: 'Keg below 15%',
      createdAt: new Date(),
      readAt: null,
      storeId: 's1',
      franchiseId: 'f1',
    });
    expect(result.success).toBe(true);
  });
});
