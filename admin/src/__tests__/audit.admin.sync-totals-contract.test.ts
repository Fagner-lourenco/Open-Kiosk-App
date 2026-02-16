import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(file: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
}

describe('Audit Admin - syncTotals contracts', () => {
  it('CommercialQuotesTab nao deve sincronizar total com estado stale apos loadLines (RED)', () => {
    const source = read('src/components/store/commercial/CommercialQuotesTab.tsx');

    expect(source).not.toMatch(/await\s+loadLines\(\);\s*await\s+syncTotals\(\);/);
  });

  it('FinanceARTab nao deve sincronizar total com estado stale apos loadLines (RED)', () => {
    const source = read('src/components/store/finance/FinanceARTab.tsx');

    expect(source).not.toMatch(/await\s+loadLines\(\);\s*await\s+syncTotals\(\);/);
  });

  it('syncTotals deve aceitar linhas frescas como argumento explicito (RED)', () => {
    const quoteSource = read('src/components/store/commercial/CommercialQuotesTab.tsx');
    const arSource = read('src/components/store/finance/FinanceARTab.tsx');

    expect(quoteSource).toMatch(/const\s+syncTotals\s*=\s*useCallback\(\s*async\s*\(\s*lines/);
    expect(arSource).toMatch(/const\s+syncTotals\s*=\s*useCallback\(\s*async\s*\(\s*lines/);
  });
});
