/**
 * ============================================================================
 * Hardware Types
 * ============================================================================
 *
 * Types for ESP32 hardware status and device connection states.
 * Extracted from StoreSettingsTab for reuse.
 */

/** Real-time hardware status from Firestore */
export interface HardwareStatus {
  esp32?: {
    isConnected: boolean;
    lastSeen: Date;
    firmwareVersion?: string;
    macAddress?: string;
    ipAddress?: string;
    lastError?: string;
  };
  dispensers?: Array<{
    id: number;
    name?: string;
    productId?: string;
    productName?: string;
    status: 'ready' | 'busy' | 'error' | 'offline';
    lastDispense?: Date;
    totalDispenses?: number;
    flowRate?: number;
  }>;
  printer?: {
    isConnected: boolean;
    model?: string;
    lastPrint?: Date;
    paperStatus?: 'ok' | 'low' | 'empty';
  };
  lastHeartbeat?: Date;
  updatedAt?: Date;
}

export type ConnectionState = 'unconfigured' | 'connecting' | 'online' | 'offline' | 'error';
export type ConnectionType = 'none' | 'usb' | 'ble' | 'wifi';

export interface DeviceStatus {
  state: ConnectionState;
  type: ConnectionType;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastErrorAt: Date | null;
  firmwareVersion: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  message: string;
  lastError?: string;
}
