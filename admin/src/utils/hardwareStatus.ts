/**
 * ============================================================================
 * Hardware Status Utilities
 * ============================================================================
 *
 * Maps Firestore hardware document to DeviceStatus.
 * Extracted from StoreSettingsTab for reuse.
 */

import type { ConnectionType, DeviceStatus } from '@/types/hardware';

function getMinutesAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

/**
 * Accepts both nested (admin) and flat (kiosk) formats to avoid regression.
 */
export function mapFirestoreToDeviceStatus(data: Record<string, any> | null): DeviceStatus {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return {
      state: 'unconfigured',
      type: 'none',
      lastSeenAt: null,
      lastSyncAt: null,
      lastErrorAt: null,
      firmwareVersion: null,
      macAddress: null,
      ipAddress: null,
      message: 'Dispositivo não configurado. Escaneie QR ou conecte USB.',
    };
  }

  const isConnected = data.isConnected ?? data.esp32Connected ?? false;
  const connectionType = data.type ?? data.esp32Type ?? 'wifi';
  const ipAddress = data.ipAddress ?? data.esp32Ip ?? null;
  const lastSeenRaw = data.lastSeenAt ?? data.lastSeen ?? data.lastHeartbeat ?? null;
  const lastSeen = lastSeenRaw instanceof Date ? lastSeenRaw : (lastSeenRaw?.toDate?.() ?? null);
  const lastError = data.lastError ?? null;

  const hasSignal = Boolean(
    isConnected ||
    lastSeen ||
    data.firmwareVersion ||
    data.macAddress ||
    ipAddress ||
    lastError
  );

  if (!hasSignal) {
    return {
      state: 'unconfigured',
      type: 'none',
      lastSeenAt: null,
      lastSyncAt: null,
      lastErrorAt: null,
      firmwareVersion: null,
      macAddress: null,
      ipAddress: null,
      message: 'Dispositivo não configurado. Escaneie QR ou conecte USB.',
    };
  }

  if (isConnected === true) {
    return {
      state: 'online',
      type: (connectionType as ConnectionType) || 'wifi',
      lastSeenAt: lastSeen,
      lastSyncAt: new Date(),
      lastErrorAt: null,
      firmwareVersion: data.firmwareVersion ?? null,
      macAddress: data.macAddress ?? null,
      ipAddress,
      message: `Online • ${String(connectionType).toUpperCase()}`,
      lastError: lastError ?? undefined,
    };
  }

  if (lastSeen instanceof Date && lastSeen < new Date(Date.now() - 60_000)) {
    return {
      state: 'offline',
      type: (connectionType as ConnectionType) || 'wifi',
      lastSeenAt: lastSeen,
      lastSyncAt: new Date(),
      lastErrorAt: lastError && new Date(),
      firmwareVersion: data.firmwareVersion ?? null,
      macAddress: data.macAddress ?? null,
      ipAddress,
      message: `Offline (último visto há ${getMinutesAgo(lastSeen)}min)`,
      lastError: lastError ?? undefined,
    };
  }

  return {
    state: 'connecting',
    type: (connectionType as ConnectionType) || 'wifi',
    lastSeenAt: lastSeen,
    lastSyncAt: new Date(),
    lastErrorAt: null,
    firmwareVersion: null,
    macAddress: null,
    ipAddress: null,
    message: 'Conectando...',
    lastError: lastError ?? undefined,
  };
}
