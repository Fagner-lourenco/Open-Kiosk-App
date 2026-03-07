/**
 * ============================================================================
 * Forecast Engine — Motor de cálculo de previsão de demanda de chopp
 * ============================================================================
 *
 * 4 módulos:
 *   A) Demand Potential λ(t)     — público × adesão × clima × curva horária
 *   B) Conversion Attrition      — pagamento, distância, concorrência, visibilidade
 *   C) Safe Physical Capacity    — vazão, resfriamento, qualidade
 *   D) Decision & Recommendations — risco, alertas, nº barris
 *
 * @version 0.3.0 (7 critical fixes applied)
 */

import {
    CLIMATE_PRIORS,
    HOURLY_WEIGHTS,
    EVENT_MULTIPLIERS,
    R_PER_CAPITA,
    TEMP_FACTOR_CLAMP,
    CONVERSION_FACTORS,
    HARDWARE_DEFAULTS,
    EXPOSURE_MULTIPLIERS,
    EXPOSURE_COOLING_PENALTY,
    MONTHLY_TMAX_SP,
    MONTHLY_RAIN_PROB_SP,
    MODEL_VERSION,
} from './priors';

// ─── Types (inline for Cloud Functions — not importing from admin) ──────────

export interface ForecastInput {
    eventName: string;
    eventDate: string;
    eventCategory: string;
    totalPeople: number;
    choppAdoptionRate: [number, number];
    durationHours: number;
    peakDurationHours: number;
    eventStartHour: number;  // 0-23
    eventEndHour: number;    // 0-23
    temperature: number;
    rain: boolean | number;
    humidity?: number;
    apparentTemperature?: number;
    exposure: 'sun_open' | 'covered' | 'indoor_ac';
    climateSource: 'manual' | 'open_meteo';
    latitude?: number;
    longitude?: number;
    municipalityCode?: string;
    competition: 'none' | 'light' | 'moderate' | 'heavy';
    distanceFromFlow: number;
    visibility: 'high' | 'medium' | 'low';
    numberOfTotems: number;
    tapsPerTotem: number;
    kegSizeLiters: 30 | 50;
    kegArrivalTemp: number;
    coolingCapacityLph: number;
    regionalFactor?: number;
    hourlyClimate?: Record<number, HourlyClimateContext>;
}

export interface HourlyClimateContext {
    temperature: number;
    apparentTemperature: number;
    rain: number;
    humidity: number;
    cloudCover: number;
    directRadiation: number;
}

export interface HourlyCurvePoint {
    hour: number;
    value: number;
}

export interface ForecastRecommendation {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details?: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ForecastResult {
    totalLiters: { p10: number; p50: number; p90: number };
    peakLph: { p50: number; p95: number };
    peakWindow: { startHour: number; endHour: number };
    demandCurve: HourlyCurvePoint[];
    capacityCurve: HourlyCurvePoint[];
    riskLevel: RiskLevel;
    riskReasons: string[];
    deficitWindows: Array<{ hour: number; deficitLph: number }>;
    recommendations: ForecastRecommendation[];
    kegCount: { required: number; reserve: number; total: number };
    modelVersion: string;
    parametersUsed: Record<string, { value: number; status: string; source: string }>;
}

function parseEventDateParts(eventDate: string): { year: number; month: number; day: number } | null {
    if (typeof eventDate !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return { year, month, day };
}

function getEventMonth(eventDate: string): number {
    return parseEventDateParts(eventDate)?.month ?? 1;
}

function getEventDayOfWeek(eventDate: string): number {
    const parts = parseEventDateParts(eventDate);
    if (!parts) return new Date().getUTCDay();
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

// ============================================================================
// MODULE A: Demand Potential λ(t)
// ============================================================================

/**
 * Calcula w_clima — fator climático multiplicativo.
 *
 * Baseado em regressão linear: consumo = f(temperatura) do dataset Beer SP.
 * β_temp = +3.13%/°C (R²=0.33).
 */
function calculateClimateWeight(
    temperature: number,
    rain: boolean | number,
    isWeekend: boolean,
    exposure: string,
): number {
    // FIX #5: Temperature effect with clamping (avoids unreliable extrapolation)
    const tempDelta = temperature - CLIMATE_PRIORS.TEMP_BASELINE;
    const tempFactorRaw = 1 + (tempDelta * CLIMATE_PRIORS.BETA_TEMP_PCT);
    const tempFactor = Math.min(TEMP_FACTOR_CLAMP.max, Math.max(TEMP_FACTOR_CLAMP.min, tempFactorRaw));

    // FIX #6: Rain effect — proportional to mm instead of binary
    let rainFactor = 1.0;
    if (typeof rain === 'number' && rain > 0) {
        // Proportional: -0.5% per mm, capped at -20%
        rainFactor = Math.max(0.80, 1 - (rain * 0.005));
    } else if (rain === true) {
        // Binary fallback: use default -5.1%
        rainFactor = 1 + CLIMATE_PRIORS.RAIN_PENALTY;
    }

    // Weekend effect: +20.5%
    const weekendFactor = isWeekend ? (1 + CLIMATE_PRIORS.WEEKEND_BOOST) : 1.0;

    // Exposure effect
    const exposureFactor = EXPOSURE_MULTIPLIERS[exposure as keyof typeof EXPOSURE_MULTIPLIERS] ?? 1.0;

    return Math.max(0.3, tempFactor * rainFactor * weekendFactor * exposureFactor);
}

/**
 * Gera a curva de demanda horária λ(t) em L/h.
 *
 * λ(t) = P_chopp × r_per_capita × w_clima × normalized_hourly_weight(t)
 */
function calculateDemandCurve(input: ForecastInput): {
    curve: HourlyCurvePoint[];
    totalP50: number;
    totalP10: number;
    totalP90: number;
} {
    const { totalPeople, choppAdoptionRate, durationHours, temperature, rain, exposure } = input;
    const eventType = input.eventCategory;

    // FIX #2: Use explicit event hours from input instead of centering on 18h
    const proposedStart = Number.isFinite(input.eventStartHour)
        ? Math.floor(input.eventStartHour)
        : Math.max(10, 18 - Math.floor(durationHours / 2));
    const eventStart = Math.min(23, Math.max(0, proposedStart));
    const proposedEnd = Number.isFinite(input.eventEndHour)
        ? Math.floor(input.eventEndHour)
        : Math.min(24, eventStart + durationHours);
    const eventEnd = Math.min(24, Math.max(eventStart + 1, proposedEnd));
    const actualDuration = eventEnd - eventStart;

    // Weekend detection from event date
    const dayOfWeek = getEventDayOfWeek(input.eventDate);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // FIX #1: Use EVENT_MULTIPLIERS as default range when user doesn't override
    const eventMult = EVENT_MULTIPLIERS[eventType] || [0.20, 0.40];
    // If user left adoption at defaults (0.2/0.4), use event-specific multipliers
    const isDefaultAdoption = choppAdoptionRate[0] === 0.20 && choppAdoptionRate[1] === 0.40;
    const effectiveAdoption: [number, number] = isDefaultAdoption
        ? eventMult as [number, number]
        : choppAdoptionRate;

    const adoptionP50 = (effectiveAdoption[0] + effectiveAdoption[1]) / 2;
    const adoptionP10 = effectiveAdoption[0];
    const adoptionP90 = effectiveAdoption[1];

    // FIX #4: Per-capita consumption rate varies by event type
    // APPLLY REGIONAL FACTOR: Scales the per-capita baseline
    const rf = input.regionalFactor ?? 1.0;
    const rPerCapita = (R_PER_CAPITA[eventType] || 0.50) * rf;

    // Climate weight — use seasonal fallback if no specific temperature
    let effectiveTemp = temperature;
    let effectiveRain = rain;
    const eventMonth = getEventMonth(input.eventDate);

    // Seasonal fallback: if temperature is missing, use SP monthly average
    if (effectiveTemp === undefined || effectiveTemp === null) {
        effectiveTemp = MONTHLY_TMAX_SP[eventMonth] || CLIMATE_PRIORS.TEMP_BASELINE;
    }

    // Seasonal rain fallback only when rain is not provided.
    if (input.climateSource === 'manual' && (effectiveRain === undefined || effectiveRain === null)) {
        const rainProb = MONTHLY_RAIN_PROB_SP[eventMonth] || 0.3;
        effectiveRain = rainProb > 0.5;
    }

    const wClima = calculateClimateWeight(effectiveTemp, effectiveRain, isWeekend, exposure);

    // FIX #7: O wClima escala a demanda total (rPerCapita), não a adoção.
    // Limitar a adoção baseada no evento a 95% para não termos 110% do público bebendo chopp.
    const finalAdoptionP50 = Math.min(0.95, adoptionP50);
    const finalAdoptionP10 = Math.min(0.95, adoptionP10);
    const finalAdoptionP90 = Math.min(0.95, adoptionP90);

    // Pessoas ativas (que vão beber)
    const safeTotalPeople = Math.max(0, totalPeople);
    const pChoppP50 = safeTotalPeople * finalAdoptionP50;
    const pChoppP10 = safeTotalPeople * finalAdoptionP10;
    const pChoppP90 = safeTotalPeople * finalAdoptionP90;

    // Tempo máximo efetivo de permanência (evita consumo infinito em eventos muito longos)
    const maxDwellTimeHours = 4.0; // Pós-4h o ritmo de consumo por hora cai drasticamente
    const effectiveDrinkingDuration = Math.min(actualDuration, maxDwellTimeHours);

    // FIX #3: Flatten realistic peak to avoid massive spikes (PEAK_BOOST 1.5 -> 1.2)
    const curve: HourlyCurvePoint[] = [];
    let totalWeight = 0;
    const peakDuration = Math.min(input.peakDurationHours || 2, actualDuration);

    // Determine peak window center (using HOURLY_WEIGHTS to find natural peak)
    let bestPeakStart = eventStart;
    let bestPeakWeight = 0;
    for (let s = eventStart; s <= eventEnd - peakDuration; s++) {
        let windowWeight = 0;
        for (let h = s; h < s + peakDuration; h++) {
            windowWeight += HOURLY_WEIGHTS[h] || 0.01;
        }
        if (windowWeight > bestPeakWeight) {
            bestPeakWeight = windowWeight;
            bestPeakStart = s;
        }
    }

    // Build weights with softer peak boost
    const PEAK_BOOST = 1.2;
    for (let h = eventStart; h < eventEnd; h++) {
        const baseW = HOURLY_WEIGHTS[h] || 0.01;
        const isPeak = h >= bestPeakStart && h < bestPeakStart + peakDuration;
        const w = isPeak ? baseW * PEAK_BOOST : baseW;
        totalWeight += w;
    }

    let sumP50 = 0;
    let sumP10 = 0;
    let sumP90 = 0;

    for (let h = eventStart; h < eventEnd; h++) {
        const baseW = HOURLY_WEIGHTS[h] || 0.01;
        const isPeak = h >= bestPeakStart && h < bestPeakStart + peakDuration;
        const w = isPeak ? baseW * PEAK_BOOST : baseW;
        const normalizedW = w / totalWeight;

        // Phase 3: Dynamic Hourly Climate Weight (Apparent Temperature & Rain)
        let wClimaHour = wClima; // Base
        if (input.hourlyClimate && input.hourlyClimate[h]) {
            const hC = input.hourlyClimate[h];
            wClimaHour = calculateClimateWeight(hC.apparentTemperature, hC.rain, isWeekend, exposure);
        }

        // λ(t) = P_chopp * (r * wClima(t)) * normalized_weight * effective_dwell_time
        const lambdaP50 = pChoppP50 * (rPerCapita * wClimaHour) * normalizedW * effectiveDrinkingDuration;
        sumP50 += lambdaP50;
        curve.push({ hour: h, value: Math.round(lambdaP50 * 10) / 10 });

        sumP10 += pChoppP10 * (rPerCapita * wClimaHour) * normalizedW * effectiveDrinkingDuration;
        sumP90 += pChoppP90 * (rPerCapita * wClimaHour) * normalizedW * effectiveDrinkingDuration;
    }

    return {
        curve,
        totalP50: Math.round(sumP50 * 10) / 10,
        totalP10: Math.round(sumP10 * 10) / 10,
        totalP90: Math.round(sumP90 * 10) / 10,
    };
}

// ============================================================================
// MODULE B: Conversion / Attrition
// ============================================================================

/**
 * Aplica fatores de conversão/atrito sobre a demanda potencial.
 * λ_real(t) = λ(t) × p_conv
 */
function applyConversionAttrition(
    curve: HourlyCurvePoint[],
    input: ForecastInput,
): { curve: HourlyCurvePoint[]; conversionFactor: number } {
    // Payment factor (PIX + card integrated = low friction)
    const fPay = (CONVERSION_FACTORS.F_PAY.min + CONVERSION_FACTORS.F_PAY.max) / 2;

    // Distance factor
    let fDist: number = CONVERSION_FACTORS.DISTANCE_PENALTY.near;
    if (input.distanceFromFlow > 50) fDist = CONVERSION_FACTORS.DISTANCE_PENALTY.far;
    else if (input.distanceFromFlow > 10) fDist = CONVERSION_FACTORS.DISTANCE_PENALTY.medium;

    // Competition factor
    const fComp = CONVERSION_FACTORS.COMPETITION[input.competition] ?? 1.0;

    // Visibility factor
    const fVis = CONVERSION_FACTORS.VISIBILITY[input.visibility] ?? 1.0;

    const conversionFactor = fPay * fDist * fComp * fVis;

    const adjustedCurve = curve.map(point => ({
        hour: point.hour,
        value: Math.round(point.value * conversionFactor * 10) / 10,
    }));

    return { curve: adjustedCurve, conversionFactor };
}

// ============================================================================
// MODULE C: Safe Physical Capacity
// ============================================================================

/**
 * Calcula C_safe(t) — capacidade máxima segura por hora.
 *
 * C_safe = min(C_vazao, C_frio(t), C_qualidade)
 *
 * C_vazao = V_tap × n_taps × n_totems × 3600 / 1000
 * C_frio  = cooling_nom × thermal_margin × exposure_penalty
 * C_qualidade = C_frio (quality degrades when beer warms)
 */
function calculateSafeCapacity(
    input: ForecastInput,
    eventStart: number,
    eventEnd: number,
): HourlyCurvePoint[] {
    const nTotems = input.numberOfTotems;
    const tapsPerTotem = input.tapsPerTotem || HARDWARE_DEFAULTS.TAPS_PER_TOTEM;
    const totalTaps = nTotems * tapsPerTotem;

    // C_vazao — hydraulic flow capacity (FIX #2: Physical limits including glass swap)
    const vTapMls = HARDWARE_DEFAULTS.V_TAP_MLS; // ~60 mL/s (1 oz/s)
    const glassVolumeLiters = 0.3;
    const secondsToFill = (glassVolumeLiters * 1000) / vTapMls; // ~5.0s
    const glassSwapTimeS = 3.0; // 3s UX friction (screen, taking glass, replacing)

    // (3600s / tempo por copo) * volume_copo = L/h práticos
    const glassesPerHour = 3600 / (secondsToFill + glassSwapTimeS);
    const practicalTapCapacityLph = glassesPerHour * glassVolumeLiters; // ~135 L/h per tap
    const cVazao = practicalTapCapacityLph * totalTaps;

    // C_frio — cooling capacity base
    const coolingNom = input.coolingCapacityLph || HARDWARE_DEFAULTS.COOLING_CAPACITY_LPH;
    const thermalMargin = HARDWARE_DEFAULTS.THERMAL_SAFETY_MARGIN;

    // Build capacity curve (Phase 3: Models solar radiation degradation on hardware)
    const curve: HourlyCurvePoint[] = [];
    for (let h = eventStart; h < eventEnd; h++) {
        let exposurePenalty: number = EXPOSURE_COOLING_PENALTY[input.exposure] ?? 1.0;

        // Dynamic solar radiation penalty (only affects 'sun_open')
        if (input.hourlyClimate && input.hourlyClimate[h] && input.exposure === 'sun_open') {
            const hC = input.hourlyClimate[h];
            // Night time (no sun) = no degradation
            if (hC.directRadiation < 10) {
                exposurePenalty = 1.0;
            }
            // Overcast daytime (heavy clouds block direct sun)
            else if (hC.directRadiation < 100 && hC.cloudCover > 80) {
                exposurePenalty = Math.max(0.95, exposurePenalty);
            }
        }

        const cFrioTotal = coolingNom * thermalMargin * exposurePenalty * nTotems;
        const cSafe = Math.min(cVazao, cFrioTotal);

        curve.push({
            hour: h,
            value: Math.round(cSafe * 10) / 10,
        });
    }

    return curve;
}

// ============================================================================
// MODULE D: Decision & Recommendations
// ============================================================================

/**
 * Gera nível de risco, recomendações e contagem de barris.
 */
function generateDecisions(
    demandCurve: HourlyCurvePoint[],
    capacityCurve: HourlyCurvePoint[],
    totalLitersP50: number,
    totalLitersP90: number,
    input: ForecastInput,
): {
    riskLevel: RiskLevel;
    riskReasons: string[];
    deficitWindows: Array<{ hour: number; deficitLph: number }>;
    recommendations: ForecastRecommendation[];
    kegCount: { required: number; reserve: number; total: number };
    peakLph: { p50: number; p95: number };
    peakWindow: { startHour: number; endHour: number };
} {
    const recommendations: ForecastRecommendation[] = [];
    const riskReasons: string[] = [];
    const deficitWindows: Array<{ hour: number; deficitLph: number }> = [];

    // Find peak demand and capacity
    let peakDemand = 0;
    let peakHour = 0;
    let peakEndHour = 0;

    demandCurve.forEach(point => {
        if (point.value > peakDemand) {
            peakDemand = point.value;
            peakHour = point.hour;
        }
    });

    // Find peak window (hours above 80% of peak)
    const peakThreshold = peakDemand * 0.8;
    const peakHours = demandCurve.filter(p => p.value >= peakThreshold);
    peakEndHour = peakHours.length > 0
        ? Math.max(...peakHours.map(p => p.hour))
        : peakHour;

    // Detect deficit windows
    demandCurve.forEach(dPoint => {
        const cPoint = capacityCurve.find(c => c.hour === dPoint.hour);
        if (cPoint && dPoint.value > cPoint.value) {
            const deficit = dPoint.value - cPoint.value;
            deficitWindows.push({ hour: dPoint.hour, deficitLph: Math.round(deficit * 10) / 10 });
        }
    });

    // Calculate keg count
    const kegSize = input.kegSizeLiters || 50;
    const requiredKegs = Math.ceil(totalLitersP50 / kegSize);
    const reserveKegs = Math.ceil((totalLitersP90 - totalLitersP50) / kegSize) + 1;
    const totalKegs = requiredKegs + reserveKegs;

    // Determine risk level
    let riskLevel: RiskLevel = 'low';

    // Risk: capacity deficit
    if (deficitWindows.length > 0) {
        const maxDeficit = Math.max(...deficitWindows.map(d => d.deficitLph));
        const cSafe = capacityCurve[0]?.value || 100;
        const deficitRatio = maxDeficit / cSafe;

        if (deficitRatio > 0.5) {
            riskLevel = 'critical';
            riskReasons.push(`Déficit de ${Math.round(maxDeficit)}L/h (${Math.round(deficitRatio * 100)}% acima da capacidade)`);
        } else if (deficitRatio > 0.2) {
            riskLevel = 'high';
            riskReasons.push(`Déficit moderado de ${Math.round(maxDeficit)}L/h em ${deficitWindows.length} hora(s)`);
        } else {
            riskLevel = 'medium';
            riskReasons.push(`Déficit leve de ${Math.round(maxDeficit)}L/h detectado`);
        }

        // Recommendation: add totems
        // BUGFIX (v0.4.0): Use effective cooling capacity, not nominal
        const effectiveTotemCapacity = (input.coolingCapacityLph || 100) * HARDWARE_DEFAULTS.THERMAL_SAFETY_MARGIN * (EXPOSURE_COOLING_PENALTY[input.exposure as keyof typeof EXPOSURE_COOLING_PENALTY] ?? 1.0);
        const neededExtraTotems = Math.ceil(maxDeficit / effectiveTotemCapacity);

        recommendations.push({
            type: 'add_totems',
            severity: deficitRatio > 0.3 ? 'critical' : 'warning',
            message: `Adicionar ${neededExtraTotems} totem(s) para cobrir o pico`,
            details: `Demanda pico: ${Math.round(peakDemand)}L/h | Capacidade: ${Math.round(capacityCurve[0]?.value || 0)}L/h`,
        });
    }

    // Risk: high temperature + outdoor
    if (input.temperature > 30 && input.exposure === 'sun_open') {
        if (riskLevel === 'low') riskLevel = 'medium';
        riskReasons.push('Temperatura alta (>30°C) com exposição ao sol');
        recommendations.push({
            type: 'shade',
            severity: 'warning',
            message: 'Providenciar sombra para os totens',
            details: 'Sol direto reduz eficiência do glycol em ~20% e aumenta demanda em ~15%',
        });
    }

    // Risk: keg arrival temperature high
    if (input.kegArrivalTemp > 15) {
        recommendations.push({
            type: 'pre_chill',
            severity: input.kegArrivalTemp > 25 ? 'critical' : 'warning',
            message: `Pré-resfriar barris (chegam a ${input.kegArrivalTemp}°C, ideal: <8°C)`,
            details: `Tempo estimado de resfriamento: ~${Math.round((input.kegArrivalTemp - 3) * 2)} min por barril`,
        });
    }

    // CO2 check for large events
    if (totalLitersP90 > 200) {
        const co2RateKilo = HARDWARE_DEFAULTS.CO2_PER_LITER_G / 1000;
        recommendations.push({
            type: 'co2_check',
            severity: 'info',
            message: `Verificar cilindro de CO₂ (consumo estimado: ${Math.round(totalLitersP90 * co2RateKilo)}kg)`,
            details: `Regra: ${HARDWARE_DEFAULTS.CO2_PER_LITER_G}g CO₂/L (inclui purgas e pressão, ref: Brewers Association)`,
        });
    }

    // Extra kegs recommendation
    if (reserveKegs > 0) {
        recommendations.push({
            type: 'extra_kegs',
            severity: 'info',
            message: `Levar ${totalKegs} barris (${requiredKegs} base + ${reserveKegs} reserva)`,
            details: `Estimativa p50: ${Math.round(totalLitersP50)}L | p90: ${Math.round(totalLitersP90)}L`,
        });
    }

    // Seasonal rain risk (from Open-Meteo ERA5 SP 2023 data)
    const eventMonth = getEventMonth(input.eventDate);
    const monthlyRainProb = MONTHLY_RAIN_PROB_SP[eventMonth];
    if (monthlyRainProb && monthlyRainProb > 0.5 && input.exposure === 'sun_open') {
        recommendations.push({
            type: 'peak_mode',
            severity: 'warning',
            message: `Historicamente, o mês ${eventMonth} tem ${Math.round(monthlyRainProb * 100)}% de probabilidade de chuva (ref. Sudeste/Sul)`,
            details: 'Considere cobertura ou plano B para evento ao ar livre nesta época',
        });
    }

    return {
        riskLevel,
        riskReasons,
        deficitWindows,
        recommendations,
        kegCount: { required: requiredKegs, reserve: reserveKegs, total: totalKegs },
        peakLph: {
            p50: Math.round(peakDemand * 10) / 10,
            p95: Math.round(peakDemand * 1.3 * 10) / 10, // +30% for p95 estimate
        },
        peakWindow: { startHour: peakHour, endHour: peakEndHour },
    };
}

// ============================================================================
// MAIN: calculateForecast
// ============================================================================

/**
 * Função principal — executa os 4 módulos em sequência e retorna resultado.
 */
export function calculateForecast(input: ForecastInput): ForecastResult {
    // Module A: Demand curve
    const demand = calculateDemandCurve(input);

    // Module B: Apply conversion/attrition
    const { curve: realDemandCurve, conversionFactor } = applyConversionAttrition(demand.curve, input);

    // Adjust totals by conversion factor
    const totalP50 = Math.round(demand.totalP50 * conversionFactor * 10) / 10;
    const totalP10 = Math.round(demand.totalP10 * conversionFactor * 10) / 10;
    const totalP90 = Math.round(demand.totalP90 * conversionFactor * 10) / 10;

    // Module C: Capacity curve
    const eventStart = realDemandCurve[0]?.hour || 10;
    const eventEnd = (realDemandCurve[realDemandCurve.length - 1]?.hour || 22) + 1;
    const capacityCurve = calculateSafeCapacity(input, eventStart, eventEnd);

    // Module D: Decisions
    const decisions = generateDecisions(
        realDemandCurve,
        capacityCurve,
        totalP50,
        totalP90,
        input,
    );

    // Assemble result
    return {
        totalLiters: { p10: totalP10, p50: totalP50, p90: totalP90 },
        peakLph: decisions.peakLph,
        peakWindow: decisions.peakWindow,
        demandCurve: realDemandCurve,
        capacityCurve,
        riskLevel: decisions.riskLevel,
        riskReasons: decisions.riskReasons,
        deficitWindows: decisions.deficitWindows,
        recommendations: decisions.recommendations,
        kegCount: decisions.kegCount,
        modelVersion: MODEL_VERSION,
        parametersUsed: {
            beta_temp: { value: CLIMATE_PRIORS.BETA_TEMP_PCT, status: 'dataset', source: 'Beer SP (Kaggle, n=365)' },
            weekend_boost: { value: CLIMATE_PRIORS.WEEKEND_BOOST, status: 'dataset', source: 'Beer SP (Kaggle, n=365)' },
            rain_penalty: { value: CLIMATE_PRIORS.RAIN_PENALTY, status: 'dataset', source: 'Beer SP (Kaggle, n=365)' },
            f_pay: { value: (CONVERSION_FACTORS.F_PAY.min + CONVERSION_FACTORS.F_PAY.max) / 2, status: 'field_calibrated', source: 'Hardware config (PIX+card)' },
            cooling_lph: { value: input.coolingCapacityLph, status: 'field_calibrated', source: 'User input (glycol 20L)' },
            conversion_factor: { value: conversionFactor, status: 'uncalibrated', source: 'Heuristic composition' },
            regional_factor: { value: input.regionalFactor ?? 1.0, status: 'dataset', source: 'CervBrasil/IBGE' },
        },
    };
}
