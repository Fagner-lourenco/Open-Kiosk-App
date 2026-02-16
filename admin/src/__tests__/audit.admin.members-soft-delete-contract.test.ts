import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Admin - member removal contracts', () => {
  it('fluxo de remocao de membro deve manter soft-delete consistente (RED)', () => {
    const userServiceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/userService.ts'),
      'utf8',
    );
    const teamPageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/team/TeamPage.tsx'),
      'utf8',
    );
    const usersPageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/users/UsersPage.tsx'),
      'utf8',
    );
    const userDetailPageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/users/UserDetailPage.tsx'),
      'utf8',
    );

    expect(userServiceSource).toMatch(/updateDoc\(memberRef,\s*\{\s*isActive:\s*false/s);

    expect(teamPageSource).not.toMatch(
      /deleteDoc\(doc\(db,\s*'franchises',\s*currentFranchise\.id,\s*'members'/,
    );
    expect(usersPageSource).not.toMatch(
      /deleteDoc\(doc\(db,\s*'franchises',\s*currentFranchise\.id,\s*'members'/,
    );
    expect(userDetailPageSource).not.toMatch(
      /deleteDoc\(doc\(db,\s*'franchises',\s*currentFranchise\.id,\s*'members'/,
    );
  });
});
