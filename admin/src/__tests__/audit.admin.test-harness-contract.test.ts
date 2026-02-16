import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - test harness contracts', () => {
  it('harness de teste deve mockar FranchiseContext para hooks que dependem de useAudit', () => {
    const setupSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/setupTests.ts'),
      'utf8',
    );
    const testUtilsSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/__tests__/test-utils.tsx'),
      'utf8',
    );

    const combined = `${setupSource}\n${testUtilsSource}`;

    expect(combined).toMatch(/vi\.mock\(['"]@\/context\/FranchiseContext['"]/);
    expect(combined).toMatch(/useFranchise/);
  });
});
