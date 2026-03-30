/**
 * plugpagTerminal.ts — Capacitor bridge wrapper for PlugPag Terminal Plugin
 *
 * Full integration with PagBank PlugPag SDK 4.12.0-beta
 * Typed TS interface mirroring the Android PlugPagTerminalPlugin.java.
 *
 * Usage:
 *   import { PlugPagTerminal } from '@/plugins/plugpagTerminal';
 *   await PlugPagTerminal.initialize({ appName: 'OpenKiosk' });
 *   await PlugPagTerminal.connect({ deviceId: 'PRO-1733436984' });
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
  /** Terminal identifier accepted by PlugPag (e.g. "PRO-1733203195" or a legacy BT MAC) */
  deviceId: string;
  /** Código de ativação PagBank — passado ao PlugPagDevice para que initBTConnection use internamente */
  activationCode?: string;
}

export interface PlugPagConnectResult {
  connected: boolean;
  deviceId: string;
  requestedDeviceId?: string;
  mode?: string;
  authenticated?: boolean;
  resolvedBluetoothAddress?: string | null;
  resolvedBluetoothName?: string | null;
  diagnostics?: Record<string, unknown>;
}

export interface PlugPagDisconnectResult {
  disconnected: boolean;
}

// ---------------------------------------------------------------------------
// Types — Authentication
// ---------------------------------------------------------------------------

export interface PlugPagAuthResult {
  authenticated: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultCode?: number | null;
  durationMs?: number | null;
}

export interface PlugPagActivationOptions {
  /** Código de ativação fornecido pelo PagBank */
  activationCode?: string;
}

export interface PlugPagInvalidateResult {
  invalidated: boolean;
}

// ---------------------------------------------------------------------------
// Types — Payment
// ---------------------------------------------------------------------------

export type PlugPagPaymentType = 'CREDIT' | 'DEBIT' | 'VOUCHER' | 'PIX';

export interface PlugPagPaymentOptions {
  /** Total amount in cents (e.g. 1500 = R$15,00) */
  amountCents: number;
  /** Payment type */
  type: PlugPagPaymentType;
  /** Number of installments (1 = à vista) */
  installments?: number;
  /** Order reference for reconciliation (max 10 chars for Moderninhas) */
  userReference?: string;
}

/**
 * Result returned from the terminal after a payment attempt.
 *
 * Security invariants:
 *   - PAN/CVV/track data are NEVER present here.
 *   - Only safe, allowlisted fields cross the native bridge.
 *   - holderName is PII — callers must mask before persisting.
 *
 * Fields aligned with PlugPagTransactionResult from official doc.
 */
export interface PlugPagPaymentResult {
  approved: boolean;
  resultCode: number;
  message: string | null;
  errorCode: string | null;

  // Transaction identifiers — doc: getTransactionCode, getTransactionId, getHostNsu, getUserReference
  transactionCode: string | null;
  transactionId: string | null;
  hostNsu: string | null;
  userReference: string | null;

  // Terminal info — doc: getTerminalSerialNumber, getDate, getTime
  terminalSerialNumber: string | null;
  date: string | null;
  time: string | null;

  // Card info (safe — only brand + last4) — doc: getCardBrand, getBin
  cardBrand: string | null;
  cardLast4: string | null;

  // Payment details — doc: getAmount
  amount: string | null;

  // PII — doc: getHolderName — mask before persist/log
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
  requestedDeviceId?: string;
  code?: number;
  mode?: string;
  resolvedBluetoothAddress?: string | null;
  resolvedBluetoothName?: string | null;
}

export interface PlugPagTransactionEvent {
  status: 'approved' | 'rejected' | 'voided';
  result: PlugPagPaymentResult;
}

export interface PlugPagAuthEvent {
  status: 'authenticated' | 'error';
  message?: string;
  authenticated?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultCode?: number | null;
  durationMs?: number | null;
  lockTaskRestored?: boolean;
}

/**
 * SDK event codes for UI feedback — mapped from PlugPagEventData constants.
 * Source: Manual de Integração PlugPag Android (oficial PagSeguro)
 *
 *   EVENT_CODE_DEFAULT          = -1 (nenhum evento enviado)
 *   EVENT_CODE_WAITING_CARD     = 0  (aguardando inserir cartão)
 *   EVENT_CODE_INSERTED_CARD    = 1  (cartão inserido)
 *   EVENT_CODE_PIN_REQUESTED    = 2  (aguardando senha)
 *   EVENT_CODE_PIN_OK           = 3  (senha validada)
 *   EVENT_CODE_SALE_END         = 4  (fim da transação)
 *   EVENT_CODE_AUTHORIZING      = 5  (aguardando autorização)
 *   EVENT_CODE_INSERTED_KEY     = 6  (senha digitada)
 *   EVENT_CODE_WAITING_REMOVE_CARD = 7 (aguardando remover cartão)
 *   EVENT_CODE_REMOVED_CARD     = 8  (cartão removido)
 */
export const PlugPagEventCodes = {
  DEFAULT: -1,
  WAITING_CARD: 0,           // Aguardando inserção do cartão
  INSERTED_CARD: 1,          // Cartão inserido
  PIN_REQUESTED: 2,          // Aguardando digitação de senha
  PIN_OK: 3,                 // Senha validada com sucesso
  SALE_END: 4,               // Fim da transação
  AUTHORIZING: 5,            // Aguardando autorização do servidor
  INSERTED_KEY: 6,           // Senha foi digitada
  WAITING_REMOVE_CARD: 7,    // Aguardando remoção do cartão
  REMOVED_CARD: 8,           // Cartão removido do leitor
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

  /** Request interactive authentication using the official demo flow */
  requestInteractiveAuthentication(): Promise<PlugPagAuthResult>;

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
