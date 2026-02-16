import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Functions - store cleanup contracts', () => {
  it('onDeleteStore deve limpar inventoryLogs para evitar dados orfaos (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/cleanup/onDeleteStore.ts'),
      'utf8',
    );

    const block = source.match(/const STORE_SUBCOLLECTIONS = \[([\s\S]*?)\] as const/)?.[1] ?? '';
    const declared = Array.from(block.matchAll(/'([^']+)'/g), (m) => m[1]);

    expect(declared).toContain('inventoryLogs');
  });
});
