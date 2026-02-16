import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - paths e contratos', () => {
  it('mantem mapeamento financeiro canonico fin*', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/pathResolver.ts'),
      'utf8'
    );

    expect(source).toContain("accounts: 'finAccounts'");
    expect(source).toContain("ledger: 'finLedger'");
    expect(source).toContain("finPayments: 'finPayments'");
  });

  it('mantem path canonico de auditoria por franquia', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/pathResolver.ts'),
      'utf8'
    );

    expect(source).toMatch(/return\s+`franchises\/\$\{franchiseId\}\/auditLogs`/);
  });

  it('contrato de status entre Kiosk e Admin deve ser compativel (RED)', () => {
    const repoRoot = path.resolve(process.cwd(), '..');
    const salesSource = fs.readFileSync(path.resolve(repoRoot, 'src/services/salesService.ts'), 'utf8');
    const adminOrderTypeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/orders/types.ts'),
      'utf8'
    );

    const kioskStatusLiterals = new Set<string>();
    for (const match of salesSource.matchAll(/status:\s*'([^']+)'/g)) {
      kioskStatusLiterals.add(match[1]);
    }
    for (const match of salesSource.matchAll(/updateData\.status\s*=\s*'([^']+)'/g)) {
      kioskStatusLiterals.add(match[1]);
    }

    const statusUnion = adminOrderTypeSource.match(/status:\s*([^;]+);/s)?.[1] ?? '';
    const adminStatuses = Array.from(statusUnion.matchAll(/'([^']+)'/g), (m) => m[1]);

    const kioskCriticalStatuses = ['paid_pending_dispense', 'dispensing', 'failed_dispense'];
    const missingInAdmin = kioskCriticalStatuses.filter((status) => !adminStatuses.includes(status));

    expect(Array.from(kioskStatusLiterals)).toEqual(expect.arrayContaining(kioskCriticalStatuses));
    expect(missingInAdmin).toEqual([]);
  });
});
