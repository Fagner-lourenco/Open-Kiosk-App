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

    expect(source).toContain('franchises/${currentFranchise.id}/stores');
    expect(subcollections).toEqual(
      expect.arrayContaining(['members', 'auditLogs']),
    );
    expect(subcollections).not.toContain('invitations');
    expect(source).toContain("collection(db, 'invitations')");
  });
});
