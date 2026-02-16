import { describe, expect, it, vi } from 'vitest';

describe('audit - admin uncovered module reach', () => {
  it('importa modulos de producao ainda descobertos sem erro', async () => {
    vi.resetModules();
    vi.unmock('@/context/AuthContext');
    vi.unmock('@/hooks/useToast');
    vi.unmock('@/lib/firebase');

    const modules = [
      '../context/AuthContext.tsx',
      '../hooks/useToast.ts',
      '../lib/firebase.ts',
      '../setupTests.ts',
    ] as const;

    const settled = await Promise.allSettled(modules.map((modulePath) => import(modulePath)));

    const failures = settled
      .map((result, index) => ({ result, modulePath: modules[index] }))
      .filter((entry) => entry.result.status === 'rejected')
      .map((entry) => {
        const reason = (entry.result as PromiseRejectedResult).reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        return `${entry.modulePath} :: ${message}`;
      });

    expect(failures).toEqual([]);
  });
});
