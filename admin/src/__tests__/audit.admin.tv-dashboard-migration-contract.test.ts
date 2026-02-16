import { readFileSync, existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function read(relativeToTestFile: string): string {
  return readFileSync(new URL(relativeToTestFile, import.meta.url), 'utf8');
}

describe('Audit Admin - tv dashboard migration contracts', () => {
  it('App mantém rota pública /ranking/display/:storeId apontando para TvDashboardPage', () => {
    const appSource = read('../App.tsx');

    expect(appSource).toContain('path="/ranking/display/:storeId"');
    expect(appSource).toContain('element={<TvDashboardPage />}');
  });

  it('TvDashboardPage usa hooks agregados e não consulta orders diretamente', () => {
    const pageSource = read('../pages/ranking/TvDashboardPage.tsx');

    expect(pageSource).toContain("from '@/hooks/useTvDashboard'");
    expect(pageSource).toContain("from '@/hooks/useTvRanking'");
    expect(pageSource).toContain("from '@/hooks/useTvChallenges'");
    expect(pageSource).toContain("from '@/hooks/useTvWinners'");
    expect(pageSource).not.toContain('ordersPath');
    expect(pageSource).not.toContain("from 'firebase/firestore'");
  });

  it('Geradores de link do telão mantêm query param franchise obrigatória', () => {
    const rankingPage = read('../pages/ranking/RankingPage.tsx');
    const eventConfigPage = read('../pages/ranking/EventConfigPage.tsx');

    expect(rankingPage).toContain('/ranking/display/${storeId}?franchise=${currentFranchise.id}');
    expect(eventConfigPage).toContain('/ranking/display/${storeId}?franchise=${franchiseId}');
  });

  it('Página legada RankingDisplayPage foi removida do Admin', () => {
    const legacyPath = new URL('../pages/ranking/RankingDisplayPage.tsx', import.meta.url);
    expect(existsSync(legacyPath)).toBe(false);
  });
});
