import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}));

const SKIP_PATTERNS: RegExp[] = [
  /__tests__/,
  /\.test\./,
  /setupTests\.ts$/,
  /vite-env\.d\.ts$/,
];

const shouldSkip = (modulePath: string): boolean =>
  SKIP_PATTERNS.some((pattern) => pattern.test(modulePath));

describe('audit - admin module reach', () => {
  beforeAll(() => {
    if (!document.getElementById('root')) {
      const root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
    }
  });

  it('carrega modulos de producao do admin/shared sem erro de import', async () => {
    const srcModules = import.meta.glob('../**/*.{ts,tsx,js,jsx}');
    const sharedModules = import.meta.glob('../../shared/**/*.{ts,tsx,js,jsx}');

    const allModules = Object.entries({
      ...srcModules,
      ...sharedModules,
    }).filter(([modulePath]) => !shouldSkip(modulePath));

    const settled = await Promise.allSettled(
      allModules.map(async ([modulePath, loader]) => {
        await loader();
        return modulePath;
      })
    );

    const failures = settled
      .map((result, index) => ({ result, modulePath: allModules[index][0] }))
      .filter((entry) => entry.result.status === 'rejected')
      .map((entry) => {
        const reason = (entry.result as PromiseRejectedResult).reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        return `${entry.modulePath} :: ${message}`;
      });

    const imported = settled.filter((result) => result.status === 'fulfilled').length;

    expect(imported).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 120000);
});
