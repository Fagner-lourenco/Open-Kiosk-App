/**
 * plugpagTerminal.ts — Capacitor bridge wrapper for PlugPag Terminal Plugin
 *
 * Phase 1 Skeleton (mini-spike):
 * Typed TS interface mirroring the Android PlugPagTerminalPlugin.java.
 * No real terminal dependency needed — the build validates the bridge works.
 *
 * Usage:
 *   import { PlugPagTerminal } from '@/plugins/plugpagTerminal';
 *   await PlugPagTerminal.initialize({ macAddress: '00:1B:66:...' });
 *   const result = await PlugPagTerminal.startPayment({ amount: 1500, type: 'DEBIT' });
 */

import { registerPlugin } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlugPagInitOptions {
  /** Bluetooth MAC address of the terminal (e.g. "00:1B:66:XX:YY:ZZ") */
  macAddress: string;
  /** Application name for PlugPag identification */
  appName?: string;
  /** Application version */
  appVersion?: string;
}

export interface PlugPagInitResult {
  connected: boolean;
  macAddress: string;
}

export type PlugPagPaymentType = 'CREDIT' | 'DEBIT';

export interface PlugPagPaymentOptions {
  /** Total amount in cents (e.g. 1500 = R$15,00) */
  amount: number;
  /** Payment type */
  type: PlugPagPaymentType;
  /** Number of installments (v1: always 1) */
  installments?: number;
  /** Whether the terminal should print a receipt */
  printReceipt?: boolean;
}

/**
 * Result returned from the terminal after a payment attempt.
 *
 * Security invariants:
 *   - PAN/CVV/track data are NEVER present here.
 *   - Only safe fields cross the native bridge.
 *   - holderName is PII — callers must mask before persisting.
 */
export interface PlugPagPaymentResult {
  approved: boolean;
  message: string | null;
  /** Card brand (e.g. "VISA", "MASTERCARD") */
  cardBrand: string | null;
  /** Last 4 digits of the card */
  cardLast4: string | null;
  /** NSU (unique sequential number) for the transaction */
  nsu: string | null;
  /** Authorization code from the acquirer */
  authCode: string | null;
  /** PlugPag transaction ID */
  transactionId: string | null;
}

export interface PlugPagAbortResult {
  aborted: boolean;
}

export interface PlugPagDisplayQROptions {
  /** EMV/BRCode QR payload to display on the terminal screen */
  qrCodeText: string;
}

export interface PlugPagDisplayQRResult {
  displayed: boolean;
  message?: string;
}

export interface PlugPagStatusResult {
  initialized: boolean;
  connected: boolean;
  sdkVersion: string;
}

export interface PlugPagDisconnectResult {
  disconnected: boolean;
}

// ---------------------------------------------------------------------------
// Plugin Interface
// ---------------------------------------------------------------------------

export interface PlugPagTerminalPlugin {
  /** Initialize PlugPag SDK with terminal Bluetooth MAC */
  initialize(options: PlugPagInitOptions): Promise<PlugPagInitResult>;

  /** Start a card-present payment on the terminal */
  startPayment(options: PlugPagPaymentOptions): Promise<PlugPagPaymentResult>;

  /** Abort the current in-progress payment */
  abortPayment(): Promise<PlugPagAbortResult>;

  /** Display a PIX QR code on the terminal screen (Phase 2+) */
  displayPixQR(options: PlugPagDisplayQROptions): Promise<PlugPagDisplayQRResult>;

  /** Check terminal status */
  getStatus(): Promise<PlugPagStatusResult>;

  /** Disconnect and release resources */
  disconnect(): Promise<PlugPagDisconnectResult>;
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
