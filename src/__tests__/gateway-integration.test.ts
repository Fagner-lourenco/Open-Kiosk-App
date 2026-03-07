/**
 * Gateway Registry — Testes de Integração
 *
 * Verifica compatibilidade end-to-end entre:
 * - Gateway Registry (shared/config/gateways)
 * - Admin config persistence (updatePaymentGatewayConfig shape)
 * - Kiosk config loading (getPaymentConfig, normalizeProvider)
 * - Checkout branching (isPagBank logic)
 * - Validação de config (validatePaymentConfig)
 *
 * IMPORTANTE: estes testes NÃO fazem chamadas de rede.
 * Eles validam a compatibilidade de tipos e dados entre as camadas.
 */
// globals: true no vitest.config.ts — describe, it, expect disponíveis globalmente
import {
  GATEWAY_REGISTRY,
  getAvailableGateways,
  getGatewayById,
  isGatewaySelectable,
  getGatewayStatusBadge,
} from '../../shared/config/gateways';
import type { GatewayId, GatewayDefinition } from '../../shared/config/gateways/types';
import type { PaymentGatewayConfig, PaymentProvider } from '@/types/store';

// ============================================================================
// C1: Admin → Firestore → Kiosk (config round-trip)
// ============================================================================
describe('C1: Admin → Firestore → Kiosk config round-trip', () => {
  it('registry configFields produzem payload compatível com PaymentGatewayConfig.providers', () => {
    const mpDef = getGatewayById('mercado_pago')!;
    expect(mpDef).toBeDefined();
    expect(mpDef.firestoreKey).toBe('mercadopago');

    // Simular o que o Admin faz: preencher todos os configFields
    const providerData: Record<string, string> = {};
    mpDef.configFields.forEach((field) => {
      providerData[field.key] = `test_${field.key}`;
    });

    // Payload que o Admin grava no Firestore
    const firestorePayload: Partial<PaymentGatewayConfig> = {
      provider: 'mercado_pago',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      providers: {
        [mpDef.firestoreKey]: providerData,
      } as PaymentGatewayConfig['providers'],
    };

    // Verificar que o payload é lido corretamente pelo Kiosk
    const readBack = firestorePayload.providers?.mercadopago;
    expect(readBack).toBeDefined();
    expect(readBack?.userId).toBe('test_userId');
    expect(readBack?.externalPosId).toBe('test_externalPosId');
    expect(readBack?.storeId).toBe('test_storeId');
    expect(readBack?.terminalId).toBe('test_terminalId');
  });

  it('PagBank configFields produzem payload compatível', () => {
    const pbDef = getGatewayById('pagbank')!;
    expect(pbDef).toBeDefined();
    expect(pbDef.firestoreKey).toBe('pagbank');

    const providerData: Record<string, string> = {};
    pbDef.configFields.forEach((field) => {
      providerData[field.key] = `test_${field.key}`;
    });

    const firestorePayload: Partial<PaymentGatewayConfig> = {
      provider: 'pagbank',
      providers: {
        [pbDef.firestoreKey]: providerData,
      } as PaymentGatewayConfig['providers'],
    };

    const readBack = firestorePayload.providers?.pagbank;
    expect(readBack).toBeDefined();
    // clientId and merchantId have been REMOVED from PagBank configFields
    expect(readBack?.clientId).toBeUndefined();
    expect(readBack?.merchantId).toBeUndefined();
    expect(readBack?.publicKey).toBe('test_publicKey');
  });

  it('registry firestoreKeys mapeiam para chaves válidas de PaymentGatewayConfig.providers', () => {
    // Chaves válidas de providers no tipo TypeScript
    const validProviderKeys = ['pagbank', 'mercadopago'];

    // Todos os gateways selecionáveis (stable/beta) devem ter firestoreKey válida
    const selectableGateways = getAvailableGateways().filter(
      (gw) => gw.status !== 'coming_soon'
    );

    selectableGateways.forEach((gw) => {
      expect(validProviderKeys).toContain(gw.firestoreKey);
    });
  });

  it('alternância de gateways não perde dados de outros providers', () => {
    // Estado inicial: MP configurado
    const initialConfig: PaymentGatewayConfig = {
      provider: 'mercado_pago',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      providers: {
        mercadopago: { userId: '123', externalPosId: 'POS001', storeId: 'S1', terminalId: 'T1' },
        pagbank: { publicKey: 'pk123' },
      },
    };

    // Trocar para PagBank (merge parcial como o Admin faz)
    const merged: PaymentGatewayConfig = {
      ...initialConfig,
      provider: 'pagbank',
      providers: {
        ...initialConfig.providers,
      },
    };

    // Os dados do Mercado Pago NÃO devem sumir
    expect(merged.providers?.mercadopago?.userId).toBe('123');
    expect(merged.providers?.pagbank?.publicKey).toBe('pk123');
  });
});

// ============================================================================
// C2: Mercado Pago Pix (iFndrink) — verificação de fluxo
// ============================================================================
describe('C2: Mercado Pago Pix flow validation', () => {
  it('getPaymentConfig resolve credenciais MP do env quando Firestore vazio', async () => {
    // Importação dinâmica para pegar os mocks do env
    const { getPaymentConfig } = await import('@/config/paymentGateway');

    const resolved = getPaymentConfig(null);
    // Deve usar env vars como fallback
    expect(resolved.source).toBe('env');
    // Provider default é mercado_pago quando null
    expect(resolved.provider).toBe('mercado_pago');
    // Access token vem do env (pode estar vazio em CI, mas existe)
    expect(typeof resolved.accessToken).toBe('string');
    expect(typeof resolved.externalPosId).toBe('string');
    expect(typeof resolved.userId).toBe('string');
  });

  it('getPaymentConfig prioriza Firestore sobre env', async () => {
    const { getPaymentConfig } = await import('@/config/paymentGateway');

    const firestoreConfig: PaymentGatewayConfig = {
      provider: 'mercado_pago',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      providers: {
        mercadopago: {
          userId: 'FIRESTORE_USER',
          externalPosId: 'FIRESTORE_POS',
          storeId: 'FIRESTORE_STORE',
          terminalId: 'FIRESTORE_TERM',
        },
      },
    };

    const resolved = getPaymentConfig(firestoreConfig);
    expect(resolved.userId).toBe('FIRESTORE_USER');
    expect(resolved.externalPosId).toBe('FIRESTORE_POS');
    expect(resolved.storeId).toBe('FIRESTORE_STORE');
    expect(resolved.terminalId).toBe('FIRESTORE_TERM');
  });

  it('normalizeProvider converte legado mercadopago → mercado_pago', async () => {
    const mod = await import('@/config/paymentGateway');
    // O normalize está exportado no módulo como parte do getPaymentConfig
    const config: PaymentGatewayConfig = {
      provider: 'mercadopago' as PaymentProvider,
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
    };
    const resolved = mod.getPaymentConfig(config);
    expect(resolved.provider).toBe('mercado_pago');
  });
});

// ============================================================================
// C3: Mercado Pago POS/Point — verificação de configuração
// ============================================================================
describe('C3: Mercado Pago Point flow validation', () => {
  it('validatePaymentConfig exige accessToken, userId e externalPosId', async () => {
    const { validatePaymentConfig } = await import('@/config/paymentGateway');

    // Config sem credenciais
    const result = validatePaymentConfig({
      provider: 'mercado_pago',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
    });

    // Se env vars não estão definidas, deve ter erros
    // (em CI sem .env, accessToken será '')
    if (!import.meta.env.VITE_MP_ACCESS_TOKEN && !import.meta.env.VITE_MP_ACCESS_TOKEN_SANDBOX) {
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('terminalId não é obrigatório (warning, não erro)', async () => {
    const { validatePaymentConfig } = await import('@/config/paymentGateway');

    const result = validatePaymentConfig({
      provider: 'mercado_pago',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      accessToken: 'TEST_TOKEN_LONG_ENOUGH_12345',
      providers: {
        mercadopago: {
          userId: 'TEST_USER',
          externalPosId: 'TEST_POS',
        },
      },
    } as PaymentGatewayConfig);

    // Config deve ser válida (terminalId é opcional)
    expect(result.valid).toBe(true);
    // Se env var VITE_MP_TERMINAL_ID estiver vazia, haverá warning
    // Se preenchida, o fallback resolve e não gera warning
    // Ambos os cenários são válidos — o importante é que valid=true
    expect(result.errors.length).toBe(0);
  });
});

// ============================================================================
// C4: PagBank / Stone no checkout (sem crash)
// ============================================================================
describe('C4: PagBank/Stone checkout safety', () => {
  it('PagBank validatePaymentConfig does NOT require clientId for pix-only', async () => {
    const { validatePaymentConfig } = await import('@/config/paymentGateway');

    const result = validatePaymentConfig({
      provider: 'pagbank',
      environment: 'sandbox',
      enabledMethods: { cash: false, pix: true, credit: false, debit: false },
    });

    // PIX only — no client-side credentials needed (Bearer auth token is in functions/.env)
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.includes('Client ID'))).toBe(false);
  });

  it('Stone (ou qualquer provider desconhecido) é normalizado para none', async () => {
    const { getPaymentConfig } = await import('@/config/paymentGateway');

    const result = getPaymentConfig({
      provider: 'stone' as PaymentProvider,
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
    } as PaymentGatewayConfig);

    // Stone não é PaymentProvider válido → normalizado para 'none'
    expect(result.provider).toBe('none');
  });

  it('provider=none → isPaymentConfigured retorna false', async () => {
    const { isPaymentConfigured } = await import('@/config/paymentGateway');

    const result = isPaymentConfigured({
      provider: 'none',
      environment: 'sandbox',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
    });

    expect(result).toBe(false);
  });

  it('isPagBank logic funciona corretamente para cada provider', () => {
    // Simula a lógica de branching em Checkout.tsx L53
    const testCases: { provider: PaymentProvider; expected: boolean }[] = [
      { provider: 'mercado_pago', expected: false },
      { provider: 'pagbank', expected: true },
      { provider: 'none', expected: false },
    ];

    testCases.forEach(({ provider, expected }) => {
      const isPagBank = provider === 'pagbank';
      expect(isPagBank).toBe(expected);
    });
  });
});

// ============================================================================
// Gateway Registry integrity
// ============================================================================
describe('Gateway Registry integrity', () => {
  it('todos os gateways têm campos obrigatórios', () => {
    const gateways = getAvailableGateways();
    expect(gateways.length).toBeGreaterThanOrEqual(3);

    gateways.forEach((gw) => {
      expect(gw.id).toBeTruthy();
      expect(gw.displayName).toBeTruthy();
      expect(gw.description).toBeTruthy();
      expect(gw.firestoreKey).toBeTruthy();
      expect(gw.configFields).toBeDefined();
      expect(Array.isArray(gw.configFields)).toBe(true);
      expect(gw.status).toMatch(/^(stable|beta|coming_soon)$/);
    });
  });

  it('configFields têm chaves únicas dentro de cada gateway', () => {
    const gateways = getAvailableGateways();

    gateways.forEach((gw) => {
      const keys = gw.configFields.map((f) => f.key);
      const uniqueKeys = [...new Set(keys)];
      expect(keys.length).toBe(uniqueKeys.length);
    });
  });

  it('getGatewayStatusBadge retorna valores válidos para todos os status', () => {
    const statuses: GatewayDefinition['status'][] = ['stable', 'beta', 'coming_soon'];

    statuses.forEach((status) => {
      const badge = getGatewayStatusBadge(status);
      expect(badge.label).toBeTruthy();
      expect(['default', 'secondary', 'outline']).toContain(badge.variant);
    });
  });

  it('Stone não é selecionável (coming_soon)', () => {
    expect(isGatewaySelectable('stone')).toBe(false);
  });

  it('MP e PagBank são selecionáveis', () => {
    expect(isGatewaySelectable('mercado_pago')).toBe(true);
    expect(isGatewaySelectable('pagbank')).toBe(true);
  });

  it('GATEWAY_REGISTRY tem exatamente 3 entradas', () => {
    expect(Object.keys(GATEWAY_REGISTRY).length).toBe(3);
    expect(GATEWAY_REGISTRY['mercado_pago']).toBeDefined();
    expect(GATEWAY_REGISTRY['pagbank']).toBeDefined();
    expect(GATEWAY_REGISTRY['stone']).toBeDefined();
  });

  it('adminNotes do PagBank mencionam Auth Token e functions/.env', () => {
    const pb = getGatewayById('pagbank')!;
    const notesText = pb.adminNotes?.join(' ') || '';
    expect(notesText).toContain('Auth Token');
    expect(notesText).toContain('functions/.env');
  });

  it('adminNotes do Mercado Pago mencionam env var', () => {
    const mp = getGatewayById('mercado_pago')!;
    const notesText = mp.adminNotes?.join(' ') || '';
    expect(notesText).toContain('VITE_MP_ACCESS_TOKEN');
  });

  it('adminNotes do Stone mencionam em desenvolvimento', () => {
    const st = getGatewayById('stone')!;
    const notesText = st.adminNotes?.join(' ') || '';
    expect(notesText).toContain('desenvolvimento');
  });
});
