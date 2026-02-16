import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - dashboard action mapping contracts', () => {
  it('Dashboard deve mapear chaves canonicas de acao de auditoria (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/dashboard/DashboardPage.tsx'),
      'utf8',
    );

    const actionLabelsBlock =
      source.match(/const actionLabels: Record<string, string> = \{([\s\S]*?)\};/)?.[1] ?? '';
    const keys = Array.from(actionLabelsBlock.matchAll(/'([^']+)'\s*:/g), (m) => m[1]);

    expect(keys).toEqual(
      expect.arrayContaining([
        'store.create',
        'store.update',
        'settings.update',
        'user.invite',
      ]),
    );

    expect(keys).not.toContain('store.created');
    expect(keys).not.toContain('store.updated');
    expect(keys).not.toContain('settings.updated');
  });
});
