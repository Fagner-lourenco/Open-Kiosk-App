import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Functions - ranking status/permission guards', () => {
  it('onOrderUpdatedRanking deve validar status elegivel mesmo quando customerName aparece (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ranking/rankingFunctions.ts'),
      'utf8'
    );

    // Contrato esperado: antes de agregar, deve existir gate explícito de status elegível
    // também no caminho nameAppeared, para não agregar pedidos cancelados/invalidos.
    const hasExplicitEligibleStatusGate =
      /if\s*\(\s*!\s*\[\s*'completed'\s*,\s*'paid_pending_dispense'\s*,\s*'dispensing'\s*\]\s*\.includes\(\s*after\.status\s*\)\s*\)\s*return;/.test(source);

    expect(hasExplicitEligibleStatusGate).toBe(true);
  });

  it('recalculateRanking30minNow deve negar membro inativo mesmo com role valido (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ranking/recalculate30minNow.ts'),
      'utf8'
    );

    // Contrato esperado: membership ativo (isActive=true) antes de autorizar role.
    const checksMemberActive = /isActive/.test(source);

    expect(checksMemberActive).toBe(true);
  });
});
