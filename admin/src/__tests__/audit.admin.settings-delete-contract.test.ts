import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - franchise delete contracts', () => {
  it('delete de franquia nao deve tratar invitations como subcollection local (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/settings/SettingsPage.tsx'),
      'utf8',
    );

    const subcollectionsBlock =
      source.match(/const subcollections = \[([\s\S]*?)\];/)?.[1] ?? '';
    const subcollections = Array.from(
      subcollectionsBlock.matchAll(/'([^']+)'/g),
      (match) => match[1],
    );

    expect(subcollections).toEqual(
      expect.arrayContaining(['stores', 'members', 'auditLogs']),
    );
    expect(subcollections).not.toContain('invitations');
  });
});
