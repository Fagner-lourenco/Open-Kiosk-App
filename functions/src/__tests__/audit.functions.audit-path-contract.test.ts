import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Functions - claims audit path contracts', () => {
  it('setAdminClaims deve persistir auditoria somente no path canonico por franquia (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/auth/claims.ts'),
      'utf8',
    );

    expect(source).toMatch(/collection\('franchises'\)[\s\S]*collection\('auditLogs'\)/);
    expect(source).not.toMatch(/collection\('audit_logs'\)/);
  });

  it('acao de auditoria em claims deve seguir namespace com ponto para compatibilidade no Admin \(RED\)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/auth/claims.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/action:\s*'set_admin_claims'/);
  });
});
