/**
 * Tests: PlugPag auth flow aligned with the kiosk production contract.
 *
 * Current contract:
 * - Bluetooth connect happens first.
 * - If `isAuthenticated()` is false, the terminal stays in
 *   `connected_but_unauthenticated`.
 * - Card-present payment remains blocked until explicit PagBank auth succeeds.
 * - Interactive auth must surface actionable error codes.
 */

import { describe, expect, it } from 'vitest';

type TerminalState =
  | 'idle'
  | 'disconnected'
  | 'connecting'
  | 'connected_but_unauthenticated'
  | 'authenticating'
  | 'connected'
  | 'error';

function resolveStateAfterBluetoothConnect(authenticated: boolean): TerminalState {
  return authenticated ? 'connected' : 'connected_but_unauthenticated';
}

function gatePayment(state: TerminalState, authenticated: boolean): {
  allowed: boolean;
  errorCode?: string;
} {
  if (state !== 'connected' && state !== 'connected_but_unauthenticated') {
    return { allowed: false, errorCode: 'NOT_CONNECTED' };
  }

  if (state === 'connected_but_unauthenticated' || !authenticated) {
    return { allowed: false, errorCode: 'AUTH_REQUIRED' };
  }

  return { allowed: true };
}

function finishInteractiveAuth(result: {
  pluginErrorCode?: 'AUTH_START_FAILED' | 'AUTH_TIMEOUT' | 'AUTH_FAILED' | 'AUTH_CALLBACK_ERROR_BUT_PERSISTED';
  persistedAuth: boolean;
}): {
  success: boolean;
  nextState: TerminalState;
  errorCode?: string;
} {
  if (result.persistedAuth) {
    return { success: true, nextState: 'connected' };
  }

  return {
    success: false,
    nextState: 'connected_but_unauthenticated',
    errorCode: result.pluginErrorCode || 'AUTH_FAILED',
  };
}

const SDK_TERMINAL_NOT_READY_CODES = ['PP1003', 'PP1025'];
const MAX_TERMINAL_NOT_READY_RETRIES = 2;

function shouldRetryTerminalNotReady(errorCode: string | null, retryCount: number) {
  return Boolean(
    errorCode &&
    SDK_TERMINAL_NOT_READY_CODES.includes(errorCode) &&
    retryCount < MAX_TERMINAL_NOT_READY_RETRIES,
  );
}

function buildAttemptOrder(
  requestedIdentifier: string,
  bondedDeviceName: string | null,
  bondedDeviceAddress: string | null,
): string[] {
  const attempts: string[] = [];
  const seen = new Set<string>();

  const add = (identifier: string | null) => {
    if (!identifier?.trim()) return;
    const normalized = identifier.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    attempts.push(identifier);
  };

  add(bondedDeviceName);
  add(bondedDeviceAddress);
  add(requestedIdentifier);
  return attempts;
}

describe('PlugPag Bluetooth connect contract', () => {
  it('goes to connected_but_unauthenticated when BT is up but auth is absent', () => {
    expect(resolveStateAfterBluetoothConnect(false)).toBe('connected_but_unauthenticated');
  });

  it('goes directly to connected when auth is already persisted', () => {
    expect(resolveStateAfterBluetoothConnect(true)).toBe('connected');
  });
});

describe('PlugPag payment gate', () => {
  it('blocks payment when terminal is connected but unauthenticated', () => {
    expect(gatePayment('connected_but_unauthenticated', false)).toEqual({
      allowed: false,
      errorCode: 'AUTH_REQUIRED',
    });
  });

  it('blocks payment when there is no BT session', () => {
    expect(gatePayment('disconnected', false)).toEqual({
      allowed: false,
      errorCode: 'NOT_CONNECTED',
    });
  });

  it('allows payment only after auth succeeds', () => {
    expect(gatePayment('connected', true)).toEqual({ allowed: true });
  });
});

describe('PlugPag interactive auth outcomes', () => {
  it('returns to connected after successful persisted auth', () => {
    expect(finishInteractiveAuth({ persistedAuth: true })).toEqual({
      success: true,
      nextState: 'connected',
    });
  });

  it('surfaces AUTH_START_FAILED when SDK cannot open the flow', () => {
    expect(finishInteractiveAuth({
      pluginErrorCode: 'AUTH_START_FAILED',
      persistedAuth: false,
    })).toEqual({
      success: false,
      nextState: 'connected_but_unauthenticated',
      errorCode: 'AUTH_START_FAILED',
    });
  });

  it('surfaces AUTH_TIMEOUT when no callback arrives from the SDK', () => {
    expect(finishInteractiveAuth({
      pluginErrorCode: 'AUTH_TIMEOUT',
      persistedAuth: false,
    })).toEqual({
      success: false,
      nextState: 'connected_but_unauthenticated',
      errorCode: 'AUTH_TIMEOUT',
    });
  });

  it('surfaces AUTH_FAILED when the operator cancels or auth fails', () => {
    expect(finishInteractiveAuth({
      pluginErrorCode: 'AUTH_FAILED',
      persistedAuth: false,
    })).toEqual({
      success: false,
      nextState: 'connected_but_unauthenticated',
      errorCode: 'AUTH_FAILED',
    });
  });

  it('treats callback error plus persisted token as success', () => {
    expect(finishInteractiveAuth({
      pluginErrorCode: 'AUTH_CALLBACK_ERROR_BUT_PERSISTED',
      persistedAuth: true,
    })).toEqual({
      success: true,
      nextState: 'connected',
    });
  });
});

describe('PlugPag retry policy', () => {
  it('retries PP1003 while retries remain', () => {
    expect(shouldRetryTerminalNotReady('PP1003', 0)).toBe(true);
  });

  it('retries PP1025 while retries remain', () => {
    expect(shouldRetryTerminalNotReady('PP1025', 1)).toBe(true);
  });

  it('stops retrying when the retry budget is exhausted', () => {
    expect(shouldRetryTerminalNotReady('PP1003', MAX_TERMINAL_NOT_READY_RETRIES)).toBe(false);
  });
});

describe('PlugPag identifier attempts', () => {
  const mac = 'A0:4F:E4:37:C7:EA';
  const name = 'PRO-1733203195';

  it('tries the bonded PRO-* name before the legacy MAC', () => {
    const attempts = buildAttemptOrder(mac, name, mac);
    expect(attempts[0]).toBe(name);
  });

  it('keeps the MAC as a compatibility fallback', () => {
    const attempts = buildAttemptOrder(mac, name, mac);
    expect(attempts.indexOf(name)).toBeLessThan(attempts.indexOf(mac));
  });
});
