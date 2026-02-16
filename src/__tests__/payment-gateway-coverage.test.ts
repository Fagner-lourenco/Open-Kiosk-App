import { describe, it, expect, afterEach, vi } from 'vitest';

const DEFAULT_MP_ENV = {
  VITE_MP_MODE: 'sandbox',
  VITE_MP_ACCESS_TOKEN: 'APP_FALLBACK_ACCESS_TOKEN_1234567890',
  VITE_MP_ACCESS_TOKEN_SANDBOX: 'APP_SANDBOX_ACCESS_TOKEN_1234567890',
  VITE_MP_ACCESS_TOKEN_PRODUCTION: 'APP_PROD_ACCESS_TOKEN_1234567890',
  VITE_MP_USER_ID: 'user-default',
  VITE_MP_STORE_ID: 'store-default',
  VITE_MP_EXTERNAL_POS_ID: 'pos-default',
  VITE_MP_TERMINAL_ID: 'terminal-default',
};

async function loadMercadoPagoWithEnv(overrides: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...DEFAULT_MP_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return import('@/config/mercadopago');
}

async function loadPaymentGatewayWithEnv(overrides: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...DEFAULT_MP_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return import('@/config/paymentGateway');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('payment gateway coverage', () => {
  it('normaliza legacy store config e mantém compatibilidade', async () => {
    const { normalizePaymentGatewayConfigFromStore } = await import('@/config/paymentGateway');

    const normalized = normalizePaymentGatewayConfigFromStore({
      acceptCash: false,
      acceptPix: true,
      acceptCard: false,
      pixKey: 'pix-legacy',
      paymentGateway: {
        provider: 'mercadopago',
        mode: 'production',
        accessToken: 'legacy-token',
        externalPosId: 'legacy-pos',
      },
    });

    expect(normalized?.provider).toBe('mercado_pago');
    expect(normalized?.environment).toBe('production');
    expect(normalized?.enabledMethods.cash).toBe(false);
    expect(normalized?.enabledMethods.pix).toBe(true);
    expect(normalized?.enabledMethods.credit).toBe(false);
    expect(normalized?.pixKey).toBe('pix-legacy');
    expect(normalized?.providers?.mercadopago?.externalPosId).toBe('legacy-pos');
  });

  it('retorna null quando não há config legacy nem atual', async () => {
    const { normalizePaymentGatewayConfigFromStore } = await import('@/config/paymentGateway');
    expect(normalizePaymentGatewayConfigFromStore({})).toBeNull();
    expect(normalizePaymentGatewayConfigFromStore(null)).toBeNull();
  });

  it('aplica defaults quando apenas paymentGateway legado vazio existe', async () => {
    const { normalizePaymentGatewayConfigFromStore } = await import('@/config/paymentGateway');
    const normalized = normalizePaymentGatewayConfigFromStore({
      paymentGateway: {},
    });

    expect(normalized?.provider).toBe('mercado_pago');
    expect(normalized?.environment).toBe('sandbox');
    expect(normalized?.enabledMethods).toEqual({
      cash: true,
      pix: true,
      credit: true,
      debit: true,
    });
  });

  it('normaliza storeData com paymentGatewayConfig atual completo', async () => {
    const { normalizePaymentGatewayConfigFromStore } = await import('@/config/paymentGateway');
    const normalized = normalizePaymentGatewayConfigFromStore({
      paymentGatewayConfig: {
        provider: 'pagbank',
        environment: 'sandbox',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
        providers: {
          pagbank: { clientId: 'cid', merchantId: 'mid', publicKey: 'pk' },
          mercadopago: {
            userId: 'uid',
            storeId: 'sid',
            externalPosId: 'epos',
            terminalId: 'term',
          },
        },
      },
    });

    expect(normalized?.providers?.pagbank?.clientId).toBe('cid');
    expect(normalized?.providers?.pagbank?.merchantId).toBe('mid');
    expect(normalized?.providers?.pagbank?.publicKey).toBe('pk');
    expect(normalized?.providers?.mercadopago?.userId).toBe('uid');
  });

  it('resolve provider desconhecido para none e mantém source env', async () => {
    const { getPaymentConfig } = await import('@/config/paymentGateway');
    const config = getPaymentConfig({
      provider: 'unknown-provider' as never,
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      environment: 'sandbox',
    });

    expect(config.provider).toBe('none');
    expect(config.source).toBe('env');
  });

  it('valida provider none com warning e sem erro', async () => {
    const { validatePaymentConfig } = await import('@/config/paymentGateway');
    const result = validatePaymentConfig({
      provider: 'none',
      environment: 'sandbox',
      enabledMethods: { cash: false, pix: false, credit: false, debit: false },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('desativado'))).toBe(true);
  });

  it('valida erros de PagBank para pix/card', async () => {
    const { validatePaymentConfig, isPaymentConfigured } = await import('@/config/paymentGateway');

    const missing = validatePaymentConfig({
      provider: 'pagbank',
      environment: 'sandbox',
      enabledMethods: { cash: false, pix: true, credit: true, debit: false },
      providers: { pagbank: {} },
    });

    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.includes('Client ID'))).toBe(true);
    expect(missing.errors.some((e) => e.includes('Public Key'))).toBe(true);

    const configured = isPaymentConfigured({
      provider: 'pagbank',
      environment: 'sandbox',
      enabledMethods: { cash: false, pix: false, credit: true, debit: false },
      providers: { pagbank: { clientId: 'cid', publicKey: 'pk' } },
    });

    expect(configured).toBe(true);

    const noMethodErrors = validatePaymentConfig({
      provider: 'pagbank',
      environment: 'sandbox',
      enabledMethods: { cash: false, pix: false, credit: false, debit: false },
      providers: { pagbank: {} },
    });
    expect(noMethodErrors.errors).toEqual([]);
  });

  it('valida erros/warnings de Mercado Pago e modo inválido', async () => {
    const { validatePaymentConfig, getPaymentConfigSource } = await import('@/config/paymentGateway');

    const invalid = validatePaymentConfig({
      provider: 'mercado_pago',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      accessToken: 'short-token',
      externalPosId: '',
      userId: '',
      mode: 'invalid-mode' as never,
      terminalId: '',
      storeId: '',
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((e) => e.includes('Access Token'))).toBe(true);
    expect(invalid.errors.length).toBeGreaterThan(0);
    expect(Array.isArray(invalid.warnings)).toBe(true);

    expect(getPaymentConfigSource({ accessToken: 'firestore-token' } as never)).toBe('Configurado via Painel Admin');
    expect(getPaymentConfigSource(null)).toBe('Usando variáveis de ambiente');
  });

  it('valida presença de config mínima em Mercado Pago e PagBank', async () => {
    const { isPaymentConfigured } = await import('@/config/paymentGateway');

    expect(
      isPaymentConfigured({
        provider: 'mercado_pago',
        environment: 'sandbox',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
        accessToken: 'valid-access-token-with-enough-length',
        externalPosId: 'pos',
        userId: 'uid',
      })
    ).toBe(true);

    expect(
      isPaymentConfigured({
        provider: 'pagbank',
        environment: 'sandbox',
        enabledMethods: { cash: false, pix: true, credit: false, debit: false },
        providers: { pagbank: { clientId: 'cid-only' } },
      })
    ).toBe(true);

    expect(
      isPaymentConfigured({
        provider: 'pagbank',
        environment: 'sandbox',
        enabledMethods: { cash: false, pix: false, credit: false, debit: false },
        providers: { pagbank: {} },
      })
    ).toBe(true);
  });

  it('valida erros de MP quando env e payload estão vazios', async () => {
    const pg = await loadPaymentGatewayWithEnv({
      VITE_MP_ACCESS_TOKEN: '',
      VITE_MP_ACCESS_TOKEN_SANDBOX: '',
      VITE_MP_EXTERNAL_POS_ID: '',
      VITE_MP_USER_ID: '',
      VITE_MP_TERMINAL_ID: '',
      VITE_MP_STORE_ID: '',
    });

    const result = pg.validatePaymentConfig({
      provider: 'mercado_pago',
      enabledMethods: { cash: true, pix: true, credit: true, debit: true },
    } as never);

    expect(result.errors.some((e) => e.includes('Access Token'))).toBe(true);
    expect(result.errors.some((e) => e.includes('External POS ID'))).toBe(true);
    expect(result.errors.some((e) => e.includes('User ID'))).toBe(true);
    expect(result.warnings.some((e) => e.includes('Terminal ID'))).toBe(true);
    expect(result.warnings.some((e) => e.includes('Store ID'))).toBe(true);

    expect(
      pg.isPaymentConfigured({
        provider: 'mercado_pago',
        enabledMethods: { cash: true, pix: true, credit: true, debit: true },
      } as never),
    ).toBe(false);
  });
});

describe('mercadopago config coverage', () => {
  it('valida configuração obrigatória de EXTERNAL_POS_ID e USER_ID', async () => {
    const missingPos = await loadMercadoPagoWithEnv({ VITE_MP_EXTERNAL_POS_ID: '' });
    expect(() => missingPos.validateMercadoPagoConfig()).toThrow('EXTERNAL_POS_ID');

    const missingUser = await loadMercadoPagoWithEnv({
      VITE_MP_EXTERNAL_POS_ID: 'ok-pos',
      VITE_MP_USER_ID: '',
    });
    expect(() => missingUser.validateMercadoPagoConfig()).toThrow('USER_ID');

    const valid = await loadMercadoPagoWithEnv({
      VITE_MP_EXTERNAL_POS_ID: 'ok-pos',
      VITE_MP_USER_ID: 'ok-user',
    });
    expect(valid.validateMercadoPagoConfig()).toBe(true);
  });

  it('valida terminal point opcional e branch de production token', async () => {
    const noTerminal = await loadMercadoPagoWithEnv({
      VITE_MP_MODE: 'production',
      VITE_MP_TERMINAL_ID: '',
      VITE_MP_ACCESS_TOKEN_PRODUCTION: 'PROD_TOKEN_USED_FOR_BRANCH_12345',
    });

    expect(noTerminal.MERCADO_PAGO_CONFIG.MODE).toBe('production');
    expect(noTerminal.MERCADO_PAGO_CONFIG.ACCESS_TOKEN).toBe('PROD_TOKEN_USED_FOR_BRANCH_12345');
    expect(noTerminal.validatePointConfig().valid).toBe(false);

    const withTerminal = await loadMercadoPagoWithEnv({ VITE_MP_TERMINAL_ID: 'TERMINAL-XYZ' });
    const result = withTerminal.validatePointConfig();
    expect(result.valid).toBe(true);
    expect(result.terminalId).toBe('TERMINAL-XYZ');
  });

  it('cobre fallback de token em production e sandbox', async () => {
    const productionFallback = await loadMercadoPagoWithEnv({
      VITE_MP_MODE: 'production',
      VITE_MP_ACCESS_TOKEN_PRODUCTION: '',
      VITE_MP_ACCESS_TOKEN: 'GENERIC_TOKEN_PROD_FALLBACK',
    });
    expect(productionFallback.MERCADO_PAGO_CONFIG.ACCESS_TOKEN).toBe('GENERIC_TOKEN_PROD_FALLBACK');

    const sandboxFallback = await loadMercadoPagoWithEnv({
      VITE_MP_MODE: 'sandbox',
      VITE_MP_ACCESS_TOKEN_SANDBOX: '',
      VITE_MP_ACCESS_TOKEN: 'GENERIC_TOKEN_SANDBOX_FALLBACK',
    });
    expect(sandboxFallback.MERCADO_PAGO_CONFIG.ACCESS_TOKEN).toBe('GENERIC_TOKEN_SANDBOX_FALLBACK');
  });

  it('cobre fallbacks vazios de mode/user/expiration e token final vazio em production', async () => {
    const defaults = await loadMercadoPagoWithEnv({
      VITE_MP_MODE: '',
      VITE_MP_USER_ID: '',
      VITE_MP_POINT_EXPIRATION: '',
    });

    expect(defaults.MERCADO_PAGO_CONFIG.MODE).toBe('sandbox');
    expect(defaults.MERCADO_PAGO_CONFIG.USER_ID).toBe('');
    expect(defaults.MERCADO_PAGO_CONFIG.POINT_EXPIRATION_TIME).toBe('PT2M');

    const productionEmpty = await loadMercadoPagoWithEnv({
      VITE_MP_MODE: 'production',
      VITE_MP_ACCESS_TOKEN_PRODUCTION: '',
      VITE_MP_ACCESS_TOKEN: '',
    });

    expect(productionEmpty.MERCADO_PAGO_CONFIG.ACCESS_TOKEN).toBe('');
  });
});
