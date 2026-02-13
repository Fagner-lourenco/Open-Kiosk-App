/**
 * ============================================================================
 * Store Settings Types
 * ============================================================================
 *
 * Canonical StoreSettings interface used by the settings tab.
 * Includes backward-compatibility fields for Firestore migration.
 */

import type { AttractVideoConfig } from '../../../shared/types/store';
import type { PaymentGatewayConfig } from '@/types/store';
import type { TapConfigLocal } from '@/config/gpio';

export interface StoreSettings {
  // General
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;

  // Tax/Fiscal
  taxId?: string;
  taxPercentage?: number;

  // Operation
  currency: string;
  timezone: string;
  language: string;

  // Payment Gateway (canonical)
  paymentGatewayConfig?: PaymentGatewayConfig;

  // ESP32 / Hardware
  esp32?: {
    isConnected?: boolean;
    lastSeen?: Date;
    firmwareVersion?: string;
    macAddress?: string;
    lastError?: string;
  };

  // Multi-Tap versioning
  tapsUpdatedAt?: Date | string | number;
  tapsVersion?: string | number;

  // Canonical Taps Configuration (source of truth)
  taps?: TapConfigLocal[];
  maxTaps?: number;

  // Legacy dispensers (load-only, kept for backward compat)
  dispensers?: any[];

  // Notifications
  orderNotifications?: boolean;
  lowStockAlerts?: boolean;
  lowStockThreshold?: number;

  // Kiosk (canonical names)
  kioskEnabled?: boolean;
  attractScreenEnabled?: boolean;
  attractTimeoutSeconds?: number;
  attractVideoConfig?: AttractVideoConfig;

  // Legacy fields (read from Firestore, kept for backward compat)
  /** @deprecated Use kioskEnabled */
  kioskMode?: boolean;
  /** @deprecated Use attractTimeoutSeconds */
  idleTimeout?: number;
}

export interface StoreSettingsTabProps {
  franchiseId: string;
  storeId: string;
}
