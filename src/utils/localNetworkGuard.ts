const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

function extractHost(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error('[localNetworkGuard] Empty target');
  }

  if (trimmed.includes('://')) {
    return new URL(trimmed).hostname.trim().toLowerCase();
  }

  const [host] = trimmed.split('/');
  return host.replace(/^\[/, '').replace(/\]$/, '').split(':')[0].trim().toLowerCase();
}

function isValidIpv4(host: string): boolean {
  const octets = host.split('.');
  if (octets.length !== 4) return false;

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const value = Number(octet);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

export function normalizeLocalHost(target: string): string {
  return extractHost(target);
}

export function isAllowedLocalHttpTarget(target: string): boolean {
  const host = extractHost(target);

  if (host === 'localhost' || host === '::1') {
    return true;
  }

  if (host.endsWith('.local')) {
    return true;
  }

  if (!isValidIpv4(host)) {
    return false;
  }

  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host));
}

export function buildLocalHttpUrl(target: string, pathname: string): string {
  const host = extractHost(target);
  if (!isAllowedLocalHttpTarget(host)) {
    throw new Error(`[localNetworkGuard] Refusing non-local HTTP target: ${target}`);
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const formattedHost = host.includes(':') ? `[${host}]` : host;
  return `http://${formattedHost}${normalizedPath}`;
}
