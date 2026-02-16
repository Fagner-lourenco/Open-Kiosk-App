import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Functions - ranking helper reuse contracts', () => {
  it('recalculate30minNow deve reutilizar helpers compartilhados para evitar drift (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ranking/recalculate30minNow.ts'),
      'utf8',
    );

    expect(source).toMatch(/from '\.\/helpers'|from "\.\/helpers"/);
  });

  it('recalculate30minNow nao deve manter implementacoes locais duplicadas de helper (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ranking/recalculate30minNow.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/function\s+maskName\s*\(/);
    expect(source).not.toMatch(/function\s+getCustomerId\s*\(/);
    expect(source).not.toMatch(/function\s+calcTotalMl\s*\(/);
    expect(source).not.toMatch(/function\s+calcFavoriteDrink\s*\(/);
  });
});
