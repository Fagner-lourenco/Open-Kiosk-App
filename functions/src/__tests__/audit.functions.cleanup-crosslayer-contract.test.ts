import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function extractStringLiterals(block: string): string[] {
  return Array.from(block.matchAll(/'([^']+)'/g), (m) => m[1]);
}

function extractTypeUnion(source: string, typeName: string): string[] {
  const block = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`))?.[1] ?? '';
  return extractStringLiterals(block);
}

describe('Audit Functions - store cleanup cross-layer contracts', () => {
  it('onDeleteStore deve cobrir subcollections de loja usadas por Admin/Kiosk (RED)', () => {
    const cleanupSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/cleanup/onDeleteStore.ts'),
      'utf8',
    );
    const adminPathResolver = fs.readFileSync(
      path.resolve(process.cwd(), '../admin/src/lib/pathResolver.ts'),
      'utf8',
    );
    const kioskPathResolver = fs.readFileSync(
      path.resolve(process.cwd(), '../src/lib/pathResolver.ts'),
      'utf8',
    );

    const cleanupBlock =
      cleanupSource.match(/const STORE_SUBCOLLECTIONS = \[([\s\S]*?)\] as const/)?.[1] ?? '';
    const cleanupCollections = extractStringLiterals(cleanupBlock);

    const adminCollections = extractTypeUnion(adminPathResolver, 'StoreSubcollection');
    const kioskCollections = extractTypeUnion(kioskPathResolver, 'StoreSubcollection');

    const expectedCollections = Array.from(new Set([...adminCollections, ...kioskCollections]));
    const missingInCleanup = expectedCollections.filter(
      (collection) => !cleanupCollections.includes(collection),
    );

    expect(missingInCleanup).toEqual([]);
  });
});
