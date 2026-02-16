import { describe, it, expect } from 'vitest';
import {
  maskName,
  getCustomerId,
  calcTotalMl,
  calcFavoriteDrink,
  generatePrizeCode,
} from '../ranking/helpers';

describe('Audit Functions - ranking helpers contracts', () => {
  it('getCustomerId deve priorizar identificacao numerica sem pontuacao', () => {
    const id = getCustomerId({ customerIdentification: '123.456.789-09', customerName: 'Teste' });
    expect(id).toBe('12345678909');
  });

  it('generatePrizeCode deve gerar codigo de 8 chars no charset permitido', () => {
    const code = generatePrizeCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it('maskName deve remover espacos extras para nome unico (RED)', () => {
    expect(maskName('   Joao   ')).toBe('Joao');
  });

  it('calcTotalMl nao deve contar item com quantity=0 (RED)', () => {
    const total = calcTotalMl([
      { title: 'IPA', mlPerUnit: 300, quantity: 0 },
    ] as any[]);

    expect(total).toBe(0);
  });

  it('calcFavoriteDrink deve ignorar item com quantity=0 (RED)', () => {
    const favorite = calcFavoriteDrink([
      { title: 'IPA - 300ml', mlPerUnit: 300, quantity: 0 },
      { title: 'Pilsen - 300ml', mlPerUnit: 300, quantity: 1 },
    ] as any[]);

    expect(favorite).toBe('Pilsen');
  });
});
