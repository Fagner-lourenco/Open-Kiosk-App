/**
 * ============================================================================
 * Forecast Types — Tipos para previsão de demanda de chopp
 * ============================================================================
 */

// ─── Event Categories ───────────────────────────────────────────────────────

export type EventCategory =
    | 'festival'
    | 'corporate'
    | 'sports'
    | 'bar'
    | 'wedding'
    | 'concert'
    | 'fair'
    | 'private_party';

export const EVENT_CATEGORIES: Array<{ value: EventCategory; label: string; icon: string }> = [
    { value: 'festival', label: 'Festival / Festa', icon: '🎉' },
    { value: 'corporate', label: 'Corporativo', icon: '🏢' },
    { value: 'sports', label: 'Esportivo', icon: '⚽' },
    { value: 'bar', label: 'Bar / Taproom', icon: '🍺' },
    { value: 'wedding', label: 'Casamento', icon: '💒' },
    { value: 'concert', label: 'Show / Concerto', icon: '🎵' },
    { value: 'fair', label: 'Feira / Exposição', icon: '🎪' },
    { value: 'private_party', label: 'Festa Privada', icon: '🥳' },
];

// ─── Forecast Input ─────────────────────────────────────────────────────────

/** Entrada do formulário de previsão */
export interface ForecastInput {
    // Evento
    eventName: string;
    eventDate: string;              // YYYY-MM-DD
    eventCategory: EventCategory;
    totalPeople: number;
    choppAdoptionRate: [number, number]; // [min, max] 0-1
    durationHours: number;
    peakDurationHours: number;
    eventStartHour: number;            // 0-23, hora de início do evento
    eventEndHour: number;              // 0-23, hora de fim do evento

    // Clima
    temperature: number;              // °C (T_max preferível, r=0.64)
    rain: boolean | number;           // mm ou boolean
    humidity?: number;                // %
    apparentTemperature?: number;     // °C (sensação térmica, Open-Meteo)
    exposure: 'sun_open' | 'covered' | 'indoor_ac';
    climateSource: 'manual' | 'open_meteo';

    // Localização (para APIs)
    latitude?: number;
    longitude?: number;
    municipalityCode?: string;        // Código IBGE

    // Logística
    competition: 'none' | 'light' | 'moderate' | 'heavy';
    distanceFromFlow: number;         // metros
    visibility: 'high' | 'medium' | 'low';

    // Hardware
    numberOfTotems: number;
    tapsPerTotem: number;             // default 2
    kegSizeLiters: 30 | 50;
    kegArrivalTemp: number;           // °C
    coolingCapacityLph: number;       // default 100
}

// ─── Forecast Result ────────────────────────────────────────────────────────

export type CalibrationStatus = 'uncalibrated' | 'literature' | 'dataset' | 'field_calibrated';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ForecastRecommendation {
    type: 'add_totems' | 'pre_chill' | 'peak_mode' | 'co2_check' | 'shade' | 'extra_kegs' | 'saturation';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details?: string;
}

/** Point on hourly demand/capacity curve */
export interface HourlyCurvePoint {
    hour: number;
    value: number; // L/h
}

/** Resultado completo da previsão */
export interface ForecastResult {
    id?: string;
    input?: ForecastInput;
    createdAt?: Date;
    storeId?: string;

    // Outputs
    totalLiters: { p10: number; p50: number; p90: number };
    peakLph: { p50: number; p95: number };
    peakWindow: { startHour: number; endHour: number };
    demandCurve: HourlyCurvePoint[];
    capacityCurve: HourlyCurvePoint[];

    // Risco
    riskLevel: RiskLevel;
    riskReasons: string[];
    deficitWindows: Array<{ hour: number; deficitLph: number }>;

    // Recomendações
    recommendations: ForecastRecommendation[];
    kegCount: { required: number; reserve: number; total: number };

    // Calibração
    modelVersion: string;
    parametersUsed: Record<string, {
        value: number;
        status: CalibrationStatus;
        source: string;
    }>;
}

// ─── Forecast Config ────────────────────────────────────────────────────────

export interface ForecastConfig {
    modelVersion: string;
    coordinates: { lat: number; lon: number };
    municipalityCode?: string;
    parameters: Record<string, {
        value: number;
        status: CalibrationStatus;
        source: string;
        updatedAt: Date;
    }>;
    autoCalibrate: boolean;
}

// ─── Climate API Response ───────────────────────────────────────────────────

export interface ClimateData {
    hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation: number[];
        relative_humidity_2m: number[];
        apparent_temperature?: number[];
    };
    daily?: {
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
    };
    source: 'open_meteo' | 'cache';
}

// ─── Demographic Data ───────────────────────────────────────────────────────

export interface DemographicData {
    municipalityCode: string;
    municipalityName: string;
    state: string;
    population: number;
    year: number;
    source: 'ibge' | 'cache';
}

// ─── Risk Level Helpers ─────────────────────────────────────────────────────

export const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; color: string; bgColor: string; icon: string }> = {
    low: { label: 'Baixo', color: 'text-green-700', bgColor: 'bg-green-100', icon: '✅' },
    medium: { label: 'Médio', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: '⚠️' },
    high: { label: 'Alto', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: '🔶' },
    critical: { label: 'Crítico', color: 'text-red-700', bgColor: 'bg-red-100', icon: '🔴' },
};
