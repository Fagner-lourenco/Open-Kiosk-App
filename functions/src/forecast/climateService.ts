/**
 * ============================================================================
 * Climate Service — Integração com Open-Meteo (sem API key)
 * ============================================================================
 *
 * Endpoints:
 *   Forecast: https://api.open-meteo.com/v1/forecast
 *   Archive:  https://archive-api.open-meteo.com/v1/archive
 *
 * Rate limit: 10,000 req/dia (free tier)
 */

import * as admin from 'firebase-admin';

interface ClimateData {
    hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation: number[];
        relative_humidity_2m: number[];
        apparent_temperature: number[];
        cloud_cover?: number[];
        direct_radiation?: number[];
    };
    daily: {
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        // Add time property if it can exist in daily data
        time?: string[];
    };
    source: 'open_meteo' | 'cache';
}

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Busca previsão climática para as coordenadas e data do evento.
 * Retorna dados horários + diários.
 * Fallback para cache Firestore se API falhar.
 */
export async function fetchClimateForEvent(
    lat: number,
    lon: number,
    eventDate: string,
    forecastDays: number = 3,
): Promise<ClimateData> {
    const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cacheRef = admin.firestore()
        .collection('forecastCache')
        .doc('climate')
        .collection(cacheKey)
        .doc(eventDate);

    // Check cache first (valid for 6 hours)
    try {
        const cached = await cacheRef.get();
        if (cached.exists) {
            const data = cached.data();
            const cachedAt = data?.cachedAt?.toDate?.() || new Date(0);
            const ageMs = Date.now() - cachedAt.getTime();
            if (ageMs < 6 * 60 * 60 * 1000) {
                return { ...data?.climate, source: 'cache' } as ClimateData;
            }
        }
    } catch (e) {
        console.warn('[climateService] Cache read failed:', e);
    }

    // Fetch from Open-Meteo
    const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        hourly: 'temperature_2m,precipitation,relative_humidity_2m,apparent_temperature,cloud_cover,direct_radiation',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
        timezone: 'America/Sao_Paulo',
        forecast_days: forecastDays.toString(),
    });

    try {
        const response = await fetch(`${FORECAST_BASE}?${params}`);
        if (!response.ok) {
            throw new Error(`Open-Meteo returned ${response.status}`);
        }

        const json = await response.json();
        const climateData: ClimateData = {
            hourly: {
                time: json.hourly.time,
                temperature_2m: json.hourly.temperature_2m,
                precipitation: json.hourly.precipitation,
                relative_humidity_2m: json.hourly.relative_humidity_2m,
                apparent_temperature: json.hourly.apparent_temperature,
                cloud_cover: json.hourly.cloud_cover,
                direct_radiation: json.hourly.direct_radiation,
            },
            daily: {
                temperature_2m_max: json.daily.temperature_2m_max,
                temperature_2m_min: json.daily.temperature_2m_min,
                precipitation_sum: json.daily.precipitation_sum,
            },
            source: 'open_meteo',
        };

        // Cache the result
        try {
            await cacheRef.set({
                climate: climateData,
                cachedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (e) {
            console.warn('[climateService] Cache write failed:', e);
        }

        return climateData;
    } catch (error) {
        console.error('[climateService] Fetch failed:', error);

        // Fallback to cache (even if stale)
        try {
            const stale = await cacheRef.get();
            if (stale.exists) {
                return { ...stale.data()?.climate, source: 'cache' } as ClimateData;
            }
        } catch { /* empty */ }

        throw new Error('Failed to fetch climate data and no cache available');
    }
}

/**
 * Busca dados climáticos históricos (ERA5 reanalysis).
 * Útil para treinar modelo na Fase 2.
 */
export async function fetchHistoricalClimate(
    lat: number,
    lon: number,
    startDate: string,
    endDate: string,
): Promise<ClimateData> {
    const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        hourly: 'temperature_2m,precipitation,relative_humidity_2m,apparent_temperature,cloud_cover,direct_radiation',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
        timezone: 'America/Sao_Paulo',
        start_date: startDate,
        end_date: endDate,
    });

    const response = await fetch(`${ARCHIVE_BASE}?${params}`);
    if (!response.ok) {
        throw new Error(`Open-Meteo Archive returned ${response.status}`);
    }

    const json = await response.json();
    return {
        hourly: json.hourly,
        daily: json.daily,
        source: 'open_meteo',
    };
}

/**
 * Extrai temperatura máxima e precipitação para uma data específica.
 * Helper para o formulário do admin.
 */
export function extractDayClimate(
    climate: ClimateData,
    targetDate: string,
): { tempMax: number; tempMin: number; rainMm: number; avgHumidity: number } | null {
    if (!climate.daily) return null;

    // FIX #3: Find correct day index by matching targetDate in time array
    // daily.time contains dates like "2026-03-04"
    const dateStr = targetDate; // YYYY-MM-DD

    // Try to find index using hourly times (which include dates)
    // Open-Meteo daily data may not include a 'time' field directly,
    // so we search hourly data for the date prefix
    let idx = -1;

    // If daily has a time array (newer Open-Meteo responses)
    if ((climate.daily as any).time) {
        const dailyTimes = (climate.daily as any).time as string[];
        idx = dailyTimes.findIndex(t => t === dateStr || t.startsWith(dateStr));
    }

    // Fallback: estimate index from hourly data
    if (idx < 0 && climate.hourly.time.length > 0) {
        const firstDate = climate.hourly.time[0].split('T')[0];
        const firstMs = new Date(firstDate).getTime();
        const targetMs = new Date(dateStr).getTime();
        const dayDiff = Math.round((targetMs - firstMs) / (24 * 60 * 60 * 1000));
        if (dayDiff >= 0 && dayDiff < climate.daily.temperature_2m_max.length) {
            idx = dayDiff;
        }
    }

    // If target date is out of the returned forecast window, fail explicitly.
    if (idx < 0) return null;

    // Calculate average humidity for the day
    const hourlyTimes = climate.hourly.time;
    const dayHumidities = hourlyTimes
        .map((t: string, i: number) => ({ time: t, humidity: climate.hourly.relative_humidity_2m[i] }))
        .filter((h: any) => h.time.startsWith(dateStr))
        .map((h: any) => h.humidity);

    const avgHumidity = dayHumidities.length > 0
        ? dayHumidities.reduce((a: number, b: number) => a + b, 0) / dayHumidities.length
        : 70;

    return {
        tempMax: climate.daily.temperature_2m_max[idx],
        tempMin: climate.daily.temperature_2m_min[idx],
        rainMm: climate.daily.precipitation_sum[idx],
        avgHumidity: Math.round(avgHumidity),
    };
}

export interface HourlyClimateContext {
    temperature: number;
    apparentTemperature: number;
    rain: number;
    humidity: number;
    cloudCover: number;
    directRadiation: number;
}

/**
 * Constrói um mapa de Clima Horário para varrer durante o loop de demanda (λ_t).
 */
export function buildHourlyClimateMap(
    climate: ClimateData,
    dateStr: string,
    startHour: number,
    endHour: number
): Record<number, HourlyClimateContext> | null {
    if (!climate.hourly || !climate.hourly.time || climate.hourly.time.length === 0) return null;

    // Find base index for 00:00 of the target date
    const startIdx = climate.hourly.time.findIndex(t => t.startsWith(dateStr));
    if (startIdx < 0) return null;

    const map: Record<number, HourlyClimateContext> = {};
    for (let h = startHour; h < endHour; h++) {
        const idx = startIdx + h;
        if (idx < climate.hourly.time.length) {
            map[h] = {
                temperature: climate.hourly.temperature_2m[idx],
                apparentTemperature: climate.hourly.apparent_temperature?.[idx] ?? climate.hourly.temperature_2m[idx],
                rain: climate.hourly.precipitation[idx],
                humidity: climate.hourly.relative_humidity_2m[idx],
                cloudCover: climate.hourly.cloud_cover?.[idx] ?? 50,
                directRadiation: climate.hourly.direct_radiation?.[idx] ?? 0,
            };
        }
    }
    return Object.keys(map).length > 0 ? map : null;
}
