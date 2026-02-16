import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function extractUnique(source: string, pattern: RegExp): string[] {
  const values = Array.from(source.matchAll(pattern), (m) => m[1]);
  return Array.from(new Set(values));
}

describe('Audit Admin - action type contracts', () => {
  it('AuditActions, AuditAction union e AUDIT_ACTION_LABELS devem permanecer sincronizados (RED)', () => {
    const auditServiceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/auditService.ts'),
      'utf8',
    );
    const auditTypesSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/types/audit.ts'),
      'utf8',
    );

    const auditActionsBlock =
      auditServiceSource.match(/export const AuditActions = \{([\s\S]*?)\}\s+as const;/)?.[1] ?? '';
    const auditActionUnionBlock =
      auditTypesSource.match(/export type AuditAction =([\s\S]*?);/)?.[1] ?? '';
    const auditActionLabelsBlock =
      auditTypesSource.match(
        /export const AUDIT_ACTION_LABELS:[\s\S]*?=\s*\{([\s\S]*?)\};/,
      )?.[1] ?? '';

    const serviceActions = extractUnique(auditActionsBlock, /:\s*'([a-z0-9_.]+)'/g);
    const typeActions = extractUnique(auditActionUnionBlock, /\|\s*'([a-z0-9_.]+)'/g);
    const labelActions = extractUnique(auditActionLabelsBlock, /'([a-z0-9_.]+)'\s*:/g);

    const missingInTypeUnion = serviceActions.filter((action) => !typeActions.includes(action));
    const missingInLabels = serviceActions.filter((action) => !labelActions.includes(action));
    const staleTypeActions = typeActions.filter((action) => !serviceActions.includes(action));

    expect(missingInTypeUnion).toEqual([]);
    expect(missingInLabels).toEqual([]);
    expect(staleTypeActions).toEqual([]);
  });
});
