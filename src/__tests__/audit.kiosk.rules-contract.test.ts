import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Audit Kiosk - contrato app vs firestore.rules', () => {
  it('rules de orders devem permitir campos usados no fluxo de dispense do Kiosk (RED)', () => {
    const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const salesSource = fs.readFileSync(path.resolve(process.cwd(), 'src/services/salesService.ts'), 'utf8');

    // Extrair bloco de orders especificamente (não products)
    const ordersBlock = rulesSource.match(/match \/orders\/\{orderId\}\s*\{([\s\S]*?)allow delete:/)?.[1] ?? '';
    const affectedKeysBlock =
      ordersBlock.match(/affectedKeys\(\)\s*[\r\n\s]*\.hasOnly\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    const allowedKeys = Array.from(affectedKeysBlock.matchAll(/'([^']+)'/g), (m) => m[1]);

    expect(salesSource).toMatch(/dispenseStatus/);
    expect(salesSource).toMatch(/dispensedAt/);
    expect(salesSource).toMatch(/completedAt/);

    const requiredByKioskDispenseFlow = ['dispenseStatus', 'dispensedAt', 'completedAt'];
    const missingInRules = requiredByKioskDispenseFlow.filter((k) => !allowedKeys.includes(k));

    expect(missingInRules).toEqual([]);
  });

  it('rules de orders devem permitir update por role usada no Kiosk (operator) (RED)', () => {
    const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const authServiceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/services/authService.ts'), 'utf8');

    expect(authServiceSource).toMatch(/role:\s*'operator'/);

    const updateRuleBlock =
      rulesSource.match(/match \/orders\/\{orderId\}\s*\{([\s\S]*?)allow delete:/)?.[1] ?? '';

    expect(updateRuleBlock).toMatch(/'operator'/);
  });

  it('fallback local de cancelamento PagBank nao pode depender de write cliente quando rules bloqueiam payments (RED)', () => {
    const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const paymentServiceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/paymentService.ts'),
      'utf8'
    );

    const hasLocalFallbackUpdate = /cancel_requested.*updateDoc|updateDoc\(paymentRef,\s*\{[\s\S]*cancelRequested/s.test(
      paymentServiceSource
    );
    const paymentsRuleBlock =
      rulesSource.match(/match \/payments\/\{paymentId\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    const deniesAllWrites = /allow write:\s*if\s*false;/.test(paymentsRuleBlock);

    expect(hasLocalFallbackUpdate && deniesAllWrites).toBe(false);
  });

  it('rules de orders devem ser compativeis com enrichOrderWithCustomerData do Kiosk (RED)', () => {
    const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const salesSource = fs.readFileSync(path.resolve(process.cwd(), 'src/services/salesService.ts'), 'utf8');

    // Extrair bloco de orders especificamente (não products)
    const ordersBlock = rulesSource.match(/match \/orders\/\{orderId\}\s*\{([\s\S]*?)allow delete:/)?.[1] ?? '';
    const affectedKeysBlock =
      ordersBlock.match(/affectedKeys\(\)\s*[\r\n\s]*\.hasOnly\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    const allowedKeys = Array.from(affectedKeysBlock.matchAll(/'([^']+)'/g), (m) => m[1]);

    expect(salesSource).toMatch(/enrichOrderWithCustomerData/);
    expect(salesSource).toMatch(/updateData\.customerName/);
    expect(salesSource).toMatch(/updateData\.gatewayPaymentId/);

    const fieldsUsedByEnrichment = [
      'customerName',
      'customerEmail',
      'customerIdentification',
      'gatewayProvider',
      'gatewayOrderId',
      'gatewayPaymentId',
      'mpOrderId',
      'mpPaymentId',
      'paymentMethodId',
      'paymentTypeId',
      'cardBrand',
      'cardLastDigits',
      'cardholderName',
      'installments',
      'dateApproved',
    ];

    const missingInRules = fieldsUsedByEnrichment.filter((k) => !allowedKeys.includes(k));
    expect(missingInRules).toEqual([]);
  });
});
