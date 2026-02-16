import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Kiosk - pathResolver contracts', () => {
  it('GlobalCollection nao deve expor audit_logs legado (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/pathResolver.ts'),
      'utf8',
    );

    const globalCollectionType =
      source.match(/export type GlobalCollection =([\s\S]*?);/)?.[1] ?? '';
    const literals = Array.from(
      globalCollectionType.matchAll(/'([^']+)'/g),
      (match) => match[1],
    );

    expect(literals).not.toContain('audit_logs');
  });
});
