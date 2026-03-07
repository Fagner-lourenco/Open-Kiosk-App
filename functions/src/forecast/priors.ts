/**
 * ============================================================================
 * Forecast Priors — Constantes calibradas com datasets reais
 * ============================================================================
 *
 * Fontes:
 *   - Beer Consumption SP (Kaggle, n=365) — regressão clima⇒consumo
 *   - Craft Beer Bar Sales (Kaggle, n=50,084) — curvas horárias
 *   - Draught Beer Quality Manual (Brewers Association) — parâmetros físicos
 *
 * Estes valores são PRIORS INICIAIS (Fase 0). Serão recalibrados
 * automaticamente na Fase 2 com dados reais do Open Kiosk.
 */

// ─── Climate Priors (Dataset A01: Beer SP) ──────────────────────────────────

export const CLIMATE_PRIORS = {
    /** Litros adicionais por +1°C (regressão linear, R²=0.33) */
    BETA_TEMP: 0.7949,
    /** Percentual por +1°C relativo à média */
    BETA_TEMP_PCT: 0.0313,
    /** R² da regressão temperatura→consumo */
    R_SQUARED: 0.3302,
    /** Boost de consumo em fins de semana */
    WEEKEND_BOOST: 0.2052,
    /** Penalidade de consumo sob chuva */
    RAIN_PENALTY: -0.0506,
    /** Temperatura de referência (média do dataset, °C) */
    TEMP_BASELINE: 21.2,
    /** Consumo médio na baseline (L/dia no dataset) */
    CONSUMPTION_BASELINE: 25.40,
} as const;

// ─── Hourly Curve Priors (Dataset A02: Craft Bar) ───────────────────────────

/**
 * Distribuição horária normalizada (soma ≈ 1.0).
 * Baseada em 50,084 transações reais (2020–2022).
 * Peak: 16:00–17:00 (34% das vendas em 2h).
 */
export const HOURLY_WEIGHTS: Record<number, number> = {
    10: 0.004,
    11: 0.008,
    12: 0.012,
    13: 0.018,
    14: 0.032,
    15: 0.062,
    16: 0.170,
    17: 0.170,
    18: 0.118,
    19: 0.102,
    20: 0.094,
    21: 0.064,
    22: 0.054,
    23: 0.032,
    0: 0.008,
    1: 0.004,
};

export const PEAK_HOURS = { start: 16, end: 17 };

// ─── Event Category Multipliers ─────────────────────────────────────────────

/**
 * Fator multiplicador de consumo por tipo de evento (r_E_base).
 * Valores são ranges [min, max] — centro usado como p50.
 * Baseados em literatura + heurística (não calibrados com dados próprios).
 */
export const EVENT_MULTIPLIERS: Record<string, [number, number]> = {
    festival: [0.25, 0.45],  // Alta adesão, clima festivo
    corporate: [0.10, 0.25],  // Baixa adesão, ambiente controlado
    sports: [0.30, 0.50],  // Muito alta adesão (esporte+cerveja)
    bar: [0.40, 0.65],  // Padrão taproom (auto-selecionado)
    wedding: [0.15, 0.35],  // Moderada, depende do perfil
    concert: [0.25, 0.45],  // Similar a festival
    fair: [0.10, 0.25],  // Famílias, menor adesão
    private_party: [0.30, 0.50],  // Alta, grupo motivado
};

/**
 * Consumo per-capita por hora por tipo de evento (L/h por bebedor ativo).
 *
 * CALIBRADO v0.4.0 — Fontes cruzadas (8 fontes, n > 3M clientes):
 *   - PourMyBev 2024 Impact Report: 1.24 L/sessão self-pour (3.1M customers)
 *   - Oktoberfest Blumenau 2024: 1.38 L/visitante (579k público)
 *   - Weezevent 2025 Barometer: 0.74 L/dia (200+ festivais EU)
 *   - Zig BR: R$120.65 gasto médio → ~1.5 L/bebedor (cerveja=77%)
 *   - Schützenfest 2024: 0.57 L/visitante (evento familiar)
 *
 * Mediana self-service: ~1.3 L/sessão → 1.3L / 4h = 0.33 L/h (base).
 * Ajustamos por contexto de evento (+/-25% do baseline).
 */
export const R_PER_CAPITA: Record<string, number> = {
    festival: 0.40,       // PourMyBev 1.24L + Blumenau 1.38L → ~1.6L/4h
    corporate: 0.25,      // Moderação corporativa
    sports: 0.50,         // +25% vs festival (esporte+cerveja)
    bar: 0.35,            // Self-pour direto: PourMyBev baseline
    wedding: 0.30,        // Social, moderado
    concert: 0.38,        // Weezevent 0.74L/dia
    fair: 0.22,           // Schützenfest 0.57L/visita
    private_party: 0.45,  // Grupo motivado, acima do baseline
};

/**
 * Limites do fator de temperatura para evitar extrapolação.
 * Sem dados abaixo de 10°C e acima de 36°C — regressão fica unreliable.
 */
export const TEMP_FACTOR_CLAMP = {
    min: 0.70,  // Nunca menos que -30% em frio extremo
    max: 1.50,  // Nunca mais que +50% em calor extremo
} as const;

// ─── Conversion / Attrition Factors ─────────────────────────────────────────

export const CONVERSION_FACTORS = {
    /** Fator de pagamento integrado (PIX + cartão) — fricção mínima */
    F_PAY: { min: 0.92, max: 0.98 },

    /** Penalidade por distância do fluxo principal */
    DISTANCE_PENALTY: {
        near: 1.0,     // < 10m
        medium: 0.85,  // 10-50m
        far: 0.65,     // > 50m
    },

    /** Impacto da concorrência */
    COMPETITION: {
        none: 1.0,
        light: 0.90,
        moderate: 0.75,
        heavy: 0.55,
    },

    /** Impacto da visibilidade */
    VISIBILITY: {
        high: 1.0,
        medium: 0.85,
        low: 0.70,
    },
} as const;

// ─── Physical Capacity Constants ────────────────────────────────────────────

export const HARDWARE_DEFAULTS = {
    /** Torneiras por totem (confirmado pelo usuário) */
    TAPS_PER_TOTEM: 2,
    /** Capacidade nominal de resfriamento glycol (L/h — confirmado) */
    COOLING_CAPACITY_LPH: 100,
    /** Temperatura do glycol (°C — confirmado) */
    T_GLYCOL: -3.5,
    /** Temperatura ideal de servir (°C — Brewers Association) */
    T_TARGET_SERVE: 2.5,
    /** Vazão prática típica por torneira com troca de copo (mL/s — ~1 oz/s) */
    V_TAP_MLS: 60,
    /** Consumo empírico de CO2 (g/L) incluindo purgas e perdas comuns (Brewers Association) */
    CO2_PER_LITER_G: 5.0,
    /** Tempo de troca de barril estimado (segundos) */
    KEG_SWAP_TIME_S: 120,
    /** Margem de segurança para degradação térmica sob carga.
     *  Indústria recomenda operar glycol a max 60% da capacidade nominal
     *  (beer-co.us, brausupply.com). 0.65 = conservador mas seguro. */
    THERMAL_SAFETY_MARGIN: 0.65,
} as const;

// ─── Exposure Adjustments ───────────────────────────────────────────────────

export const EXPOSURE_MULTIPLIERS = {
    sun_open: 1.15,   // Sol direto: +15% consumo, -10% capacidade frio
    covered: 1.0,     // Coberto: baseline
    indoor_ac: 0.90,  // AC: -10% consumo (mais confortável)
} as const;

export const EXPOSURE_COOLING_PENALTY = {
    sun_open: 0.80,   // Sol: glycol perde ~20% eficiência
    covered: 1.0,
    indoor_ac: 1.05,  // AC: glycol ganha ~5%
} as const;

// ─── Seasonal Climate Priors (Open-Meteo ERA5 — SP 2023, n=365) ─────────────

/**
 * Temperatura máxima média mensal em São Paulo (°C).
 * Fonte: Open-Meteo Archive API, lat=-23.55, lon=-46.63, ano 2023.
 * Usado para estimar w_clima quando o evento é em data futura
 * e não há previsão meteorológica disponível.
 */
export const MONTHLY_TMAX_SP: Record<number, number> = {
    1: 25.6,   // Janeiro (verão)
    2: 26.5,   // Fevereiro
    3: 26.9,   // Março
    4: 23.6,   // Abril (outono)
    5: 23.1,   // Maio
    6: 21.4,   // Junho (inverno)
    7: 22.2,   // Julho
    8: 24.3,   // Agosto
    9: 28.4,   // Setembro (primavera)
    10: 25.7,  // Outubro
    11: 28.1,  // Novembro
    12: 29.1,  // Dezembro (verão)
};

/**
 * Probabilidade de chuva por mês em SP (fração de dias com precip > 1mm).
 * Fonte: Open-Meteo ERA5 2023.
 * Usado para ajustar risco quando não há previsão meteorológica.
 */
export const MONTHLY_RAIN_PROB_SP: Record<number, number> = {
    1: 0.84,   // 26/31 dias — estação chuvosa forte
    2: 0.89,   // 25/28
    3: 0.55,   // 17/31
    4: 0.47,   // 14/30
    5: 0.13,   // 4/31 — estação seca
    6: 0.13,   // 4/30
    7: 0.13,   // 4/31
    8: 0.13,   // 4/31
    9: 0.27,   // 8/30 — transição
    10: 0.61,  // 19/31 — estação chuvosa
    11: 0.60,  // 18/30
    12: 0.42,  // 13/31
};

/**
 * Precipitação mensal acumulada em SP (mm).
 * Fonte: Open-Meteo ERA5 2023.
 */
export const MONTHLY_PRECIP_SP: Record<number, number> = {
    1: 208, 2: 244, 3: 182, 4: 113, 5: 49, 6: 29,
    7: 20, 8: 35, 9: 50, 10: 188, 11: 137, 12: 82,
};

/**
 * Distribuição de faixas de temperatura em SP (fração do ano).
 * Fonte: Open-Meteo ERA5 2023 (T_max).
 * Usado para gerar intervalos de confiança em previsões sazonais.
 */
export const TEMP_DISTRIBUTION_SP = {
    /** % do ano com T_max < 15°C */
    below15: 0.005,
    /** % do ano com T_max 15–20°C */
    range15_20: 0.090,
    /** % do ano com T_max 20–25°C */
    range20_25: 0.329,
    /** % do ano com T_max 25–30°C (moda) */
    range25_30: 0.452,
    /** % do ano com T_max 30–35°C */
    range30_35: 0.112,
    /** % do ano com T_max > 35°C */
    above35: 0.011,
} as const;

// ─── Model Meta ─────────────────────────────────────────────────────────────

export const MODEL_VERSION = '0.4.2-math-pure';
