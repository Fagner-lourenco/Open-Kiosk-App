/**
 * plugpagTerminal.ts — Capacitor bridge wrapper for PlugPag Terminal Plugin
 *
 * Full integration with PagBank PlugPag SDK 4.11.0
 * Typed TS interface mirroring the Android PlugPagTerminalPlugin.java.
 *
 * Usage:
 *   import { PlugPagTerminal } from '@/plugins/plugpagTerminal';
 *   await PlugPagTerminal.initialize({ appName: 'OpenKiosk' });
 *   await PlugPagTerminal.connect({ deviceId: '00:1B:66:...' });
 *   const result = await PlugPagTerminal.startPayment({ amountCents: 1500, type: 'DEBIT' });
 */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Types — Initialization
// ---------------------------------------------------------------------------

export interface PlugPagInitOptions {
  /** Application name for PlugPag identification */
  appName?: string;
  /** Application version */
  appVersion?: string;
}

export interface PlugPagInitResult {
  initialized: boolean;
}

// ---------------------------------------------------------------------------
// Types — Permissions
// ---------------------------------------------------------------------------

export interface PlugPagPermissionResult {
  granted: boolean;
  message?: string;
}

export interface PlugPagOpenSettingsResult {
  opened: boolean;
}

// ---------------------------------------------------------------------------
// Types — Connection
// ---------------------------------------------------------------------------

export interface PlugPagConnectOptions {
  /** Bluetooth MAC address of the terminal (e.g. "00:1B:66:XX:YY:ZZ") */
  deviceId: string;
}

export interface PlugPagConnectResult {
  connected: boolean;
  deviceId: string;
}

export interface PlugPagDisconnectResult {
  disconnected: boolean;
}

// ---------------------------------------------------------------------------
// Types — Authentication
// ---------------------------------------------------------------------------

export interface PlugPagAuthResult {
  authenticated: boolean;
}

export interface PlugPagActivationOptions {
  /** Código de ativação fornecido pelo PagBank */
  activationCode: string;
}

export interface PlugPagInvalidateResult {
  invalidated: boolean;
}

// ---------------------------------------------------------------------------
// Types — Payment
// ---------------------------------------------------------------------------

export type PlugPagPaymentType = 'CREDIT' | 'DEBIT';

export interface PlugPagPaymentOptions {
  /** Total amount in cents (e.g. 1500 = R$15,00) */
  amountCents: number;
  /** Payment type */
  type: PlugPagPaymentType;
  /** Number of installments (1 = à vista) */
  installments?: number;
  /** Order reference for reconciliation */
  userReference?: string;
  /** Whether the terminal should print a receipt */
  printReceipt?: boolean;
}

/**
 * Result returned from the terminal after a payment attempt.
 *
 * Security invariants:
 *   - PAN/CVV/track data are NEVER present here.
 *   - Only safe, allowlisted fields cross the native bridge.
 *   - holderName is PII — callers must mask before persisting.
 */
export interface PlugPagPaymentResult {
  approved: boolean;
  resultCode: number;
  message: string | null;
  errorCode: string | null;

  // Transaction identifiers (safe for reconciliation)
  transactionCode: string | null;
  transactionId: string | null;
  hostNsu: string | null;
  nsu: string | null;
  autoCode: string | null;
  userReference: string | null;

  // Terminal info
  terminalSerialNumber: string | null;
  date: string | null;
  time: string | null;

  // Card info (safe — only brand + last4, no PAN)
  cardBrand: string | null;
  cardLast4: string | null;

  // Payment details
  paymentType: number;
  amount: string | null;

  // PII — mask before persist/log
  holderName: string | null;
}

export interface PlugPagAbortResult {
  aborted: boolean;
}

// ---------------------------------------------------------------------------
// Types — Void (Estorno)
// ---------------------------------------------------------------------------

export interface PlugPagVoidOptions {
  /** transactionCode from original payment result */
  transactionCode?: string;
  /** transactionId from original payment result */
  transactionId?: string;
  /** Whether to print void receipt */
  printReceipt?: boolean;
}

// ---------------------------------------------------------------------------
// Types — PIX QR Display
// ---------------------------------------------------------------------------

export interface PlugPagDisplayQROptions {
  /** EMV/BRCode QR payload to display on the terminal screen */
  qrCodeText: string;
}

export interface PlugPagDisplayQRResult {
  displayed: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Types — Status
// ---------------------------------------------------------------------------

export interface PlugPagStatusResult {
  initialized: boolean;
  btConnected: boolean;
  deviceId: string | null;
  authenticated: boolean;
}

// ---------------------------------------------------------------------------
// Types — Events
// ---------------------------------------------------------------------------

export interface PlugPagEventData {
  eventCode: number;
  message: string | null;
}

export interface PlugPagConnectionEvent {
  status: 'connected' | 'disconnected' | 'error';
  deviceId?: string;
  code?: number;
}

export interface PlugPagTransactionEvent {
  status: 'approved' | 'rejected' | 'voided';
  result: PlugPagPaymentResult;
}

export interface PlugPagAuthEvent {
  status: 'authenticated' | 'error';
  message?: string;
}

/** SDK event codes for UI feedback */
export const PlugPagEventCodes = {
  WAITING_CARD: 0,
  INSERTED_CARD: 1,
  PIN_REQUESTED: 2,
  AUTHORIZING: 3,
  SALE_APPROVED: 4,
  SALE_NOT_APPROVED: 5,
  // Add more as needed from PlugPagEventData constants
} as const;

// ---------------------------------------------------------------------------
// Plugin Interface
// ---------------------------------------------------------------------------

export interface PlugPagTerminalPlugin {
  /** Initialize PlugPag SDK (does NOT connect) */
  initialize(options?: PlugPagInitOptions): Promise<PlugPagInitResult>;

  /** Request Bluetooth permissions (Android 12+) */
  requestPermissions(): Promise<PlugPagPermissionResult>;

  /** Open device Bluetooth settings (for pairing) */
  openBluetoothSettings(): Promise<PlugPagOpenSettingsResult>;

  /** Connect to the terminal via Bluetooth Classic */
  connect(options: PlugPagConnectOptions): Promise<PlugPagConnectResult>;

  /** Disconnect from the terminal */
  disconnect(): Promise<PlugPagDisconnectResult>;

  /** Check if terminal is authenticated with PagBank */
  isAuthenticated(): Promise<PlugPagAuthResult>;

  /** Request authentication (activation) with PagBank */
  requestAuthentication(options: PlugPagActivationOptions): Promise<PlugPagAuthResult>;

  /** Invalidate authentication (deactivation) */
  invalidateAuthentication(): Promise<PlugPagInvalidateResult>;

  /** Start a card-present payment on the terminal */
  startPayment(options: PlugPagPaymentOptions): Promise<PlugPagPaymentResult>;

  /** Abort the current in-progress payment */
  abortPayment(): Promise<PlugPagAbortResult>;

  /** Void/refund a previous or last approved transaction */
  voidPayment(options?: PlugPagVoidOptions): Promise<PlugPagPaymentResult>;

  /** Get the last approved transaction */
  getLastApprovedTransaction(): Promise<PlugPagPaymentResult>;

  /** Display a PIX QR code on the terminal screen */
  displayPixQR(options: PlugPagDisplayQROptions): Promise<PlugPagDisplayQRResult>;

  /** Check terminal status — initialization, connection, authentication */
  getStatus(): Promise<PlugPagStatusResult>;

  // Event listeners
  addListener(eventName: 'plugpagEvent', handler: (data: PlugPagEventData) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'plugpagConnection', handler: (data: PlugPagConnectionEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'plugpagTransaction', handler: (data: PlugPagTransactionEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'plugpagAuth', handler: (data: PlugPagAuthEvent) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Capacitor-registered PlugPagTerminal plugin.
 *
 * On Android, this resolves to the native PlugPagTerminalPlugin.java.
 * On Web, calls will throw "not implemented" (no web fallback for terminal).
 */
export const PlugPagTerminal = registerPlugin<PlugPagTerminalPlugin>('PlugPagTerminal');
