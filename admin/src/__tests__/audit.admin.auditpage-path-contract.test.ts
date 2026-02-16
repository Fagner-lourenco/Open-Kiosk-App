import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - AuditPage path contracts', () => {
  it('AuditPage nao deve consultar collection global legada audit_logs (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/audit/AuditPage.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/collection\(db,\s*'audit_logs'\)/);
  });
});
