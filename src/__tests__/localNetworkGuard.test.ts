import { describe, expect, it } from 'vitest';
import { buildLocalHttpUrl, isAllowedLocalHttpTarget, normalizeLocalHost } from '@/utils/localNetworkGuard';

describe('localNetworkGuard', () => {
  it('aceita IPs privados e hostnames locais', () => {
    expect(isAllowedLocalHttpTarget('192.168.4.1')).toBe(true);
    expect(isAllowedLocalHttpTarget('10.0.0.15')).toBe(true);
    expect(isAllowedLocalHttpTarget('localhost')).toBe(true);
    expect(isAllowedLocalHttpTarget('esp32.local')).toBe(true);
  });

  it('rejeita hosts públicos para HTTP do ESP32', () => {
    expect(isAllowedLocalHttpTarget('8.8.8.8')).toBe(false);
    expect(isAllowedLocalHttpTarget('api.example.com')).toBe(false);
    expect(isAllowedLocalHttpTarget('https://mercadopago.com')).toBe(false);
  });

  it('normaliza e monta URL HTTP local com segurança', () => {
    expect(normalizeLocalHost('http://192.168.4.1/status')).toBe('192.168.4.1');
    expect(buildLocalHttpUrl('192.168.4.1', '/status')).toBe('http://192.168.4.1/status');
    expect(() => buildLocalHttpUrl('api.example.com', '/status')).toThrow('Refusing non-local HTTP target');
  });
});
