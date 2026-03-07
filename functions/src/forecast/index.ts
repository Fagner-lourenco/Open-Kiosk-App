/**
 * Forecast Cloud Functions - callable endpoints used by admin.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { calculateForecast } from './forecastEngine';
import { fetchClimateForEvent, extractDayClimate, buildHourlyClimateMap } from './climateService';
import {
    getPopulation,
    reverseGeocodeToIBGE,
    calculateDemographicFactors,
} from './demographicService';

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function hasValidCoordinates(input: any): boolean {
    return isFiniteNumber(input?.latitude) && isFiniteNumber(input?.longitude);
}

function isValidDateOnly(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

function validateForecastInput(input: any): void {
    if (!input || typeof input !== 'object') {
        throw new HttpsError('invalid-argument', 'Input de previsao ausente');
    }

    if (!isFiniteNumber(input.totalPeople) || input.totalPeople <= 0) {
        throw new HttpsError('invalid-argument', 'totalPeople deve ser maior que zero');
    }

    if (typeof input.eventCategory !== 'string' || input.eventCategory.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'eventCategory e obrigatorio');
    }

    if (!isValidDateOnly(input.eventDate)) {
        throw new HttpsError('invalid-argument', 'eventDate invalido (esperado YYYY-MM-DD)');
    }

    if (!Array.isArray(input.choppAdoptionRate) || input.choppAdoptionRate.length !== 2) {
        throw new HttpsError('invalid-argument', 'choppAdoptionRate invalido');
    }
    const [adoptionMin, adoptionMax] = input.choppAdoptionRate;
    if (
        !isFiniteNumber(adoptionMin)
        || !isFiniteNumber(adoptionMax)
        || adoptionMin < 0
        || adoptionMax > 1
        || adoptionMin > adoptionMax
    ) {
        throw new HttpsError('invalid-argument', 'choppAdoptionRate deve estar entre 0 e 1 e min <= max');
    }

    if (!isFiniteNumber(input.durationHours) || input.durationHours <= 0 || input.durationHours > 24) {
        throw new HttpsError('invalid-argument', 'durationHours deve estar entre 1 e 24');
    }
    if (!isFiniteNumber(input.peakDurationHours) || input.peakDurationHours <= 0 || input.peakDurationHours > input.durationHours) {
        throw new HttpsError('invalid-argument', 'peakDurationHours deve ser > 0 e <= durationHours');
    }

    if (!isFiniteNumber(input.eventStartHour) || !isFiniteNumber(input.eventEndHour)) {
        throw new HttpsError('invalid-argument', 'eventStartHour e eventEndHour sao obrigatorios');
    }
    const eventStartHour = Math.floor(input.eventStartHour);
    const eventEndHour = Math.floor(input.eventEndHour);
    if (eventStartHour < 0 || eventStartHour > 23 || eventEndHour < 1 || eventEndHour > 24 || eventEndHour <= eventStartHour) {
        throw new HttpsError('invalid-argument', 'janela de evento invalida: eventEndHour deve ser maior que eventStartHour');
    }

    const rainIsValid = typeof input.rain === 'boolean' || isFiniteNumber(input.rain);
    if (!rainIsValid) {
        throw new HttpsError('invalid-argument', 'rain deve ser boolean ou numero');
    }
    if (isFiniteNumber(input.rain) && input.rain < 0) {
        throw new HttpsError('invalid-argument', 'rain (mm) nao pode ser negativo');
    }

    const climateSource = input.climateSource;
    if (climateSource !== 'manual' && climateSource !== 'open_meteo') {
        throw new HttpsError('invalid-argument', 'climateSource invalido');
    }
    if (!isFiniteNumber(input.temperature) && !(climateSource === 'open_meteo' && hasValidCoordinates(input))) {
        throw new HttpsError('invalid-argument', 'temperature e obrigatoria quando clima automatico nao estiver disponivel');
    }

    if (!isFiniteNumber(input.numberOfTotems) || input.numberOfTotems < 1) {
        throw new HttpsError('invalid-argument', 'numberOfTotems deve ser >= 1');
    }
    if (!isFiniteNumber(input.tapsPerTotem) || input.tapsPerTotem < 1) {
        throw new HttpsError('invalid-argument', 'tapsPerTotem deve ser >= 1');
    }
    if (!isFiniteNumber(input.coolingCapacityLph) || input.coolingCapacityLph <= 0) {
        throw new HttpsError('invalid-argument', 'coolingCapacityLph deve ser > 0');
    }
}

/**
 * callable: calculateDemandForecast
 * Receives ForecastInput, enriches with climate + demographics and runs engine.
 */
export const calculateDemandForecast = onCall(
    { region: 'southamerica-east1', memory: '256MiB' },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Usuario nao autenticado');
        }

        const input = request.data?.input;
        validateForecastInput(input);

        try {
            if (input.climateSource === 'open_meteo' && hasValidCoordinates(input)) {
                const climate = await fetchClimateForEvent(
                    input.latitude,
                    input.longitude,
                    input.eventDate || new Date().toISOString().split('T')[0],
                );
                const dayClimate = extractDayClimate(climate, input.eventDate);
                if (!dayClimate) {
                    throw new HttpsError(
                        'failed-precondition',
                        'Data fora da janela retornada pelo Open-Meteo. Ajuste a data ou informe clima manual.',
                    );
                }

                input.temperature = dayClimate.tempMax;
                input.rain = dayClimate.rainMm;
                input.humidity = dayClimate.avgHumidity;

                const targetDate = input.eventDate || new Date().toISOString().split('T')[0];
                const startHour = input.eventStartHour ?? 10;
                const endHour = input.eventEndHour ?? Math.min(24, startHour + (input.durationHours || 4));
                const hourlyMap = buildHourlyClimateMap(climate, targetDate, startHour, endHour);
                if (hourlyMap) {
                    input.hourlyClimate = hourlyMap;
                }
            }

            let demographics = null;
            let demographicFactors = null;

            if (input.municipalityCode) {
                try {
                    demographics = await getPopulation(input.municipalityCode);
                } catch {
                    // non-critical
                }
            } else if (hasValidCoordinates(input)) {
                try {
                    const geo = await reverseGeocodeToIBGE(input.latitude, input.longitude);
                    if (geo) {
                        input.municipalityCode = geo.code;
                        demographics = await getPopulation(geo.code);
                    }
                } catch {
                    // non-critical
                }
            }

            if (demographics) {
                demographicFactors = calculateDemographicFactors(
                    demographics,
                    input.totalPeople,
                );
            }

            if (demographicFactors) {
                input.regionalFactor = demographicFactors.regionalFactor;
            }

            const result = calculateForecast(input);

            if (demographicFactors) {
                if (demographicFactors.saturationRisk === 'high') {
                    result.recommendations.push({
                        type: 'saturation',
                        severity: 'warning',
                        message: `Evento grande para a cidade (${demographicFactors.populationContext})`,
                        details: 'Eventos > 5% da populacao podem afetar logistica (transito, estacionamento, fornecimento)',
                    });
                } else if (demographicFactors.saturationRisk === 'medium') {
                    result.recommendations.push({
                        type: 'saturation',
                        severity: 'info',
                        message: `Contexto local: ${demographicFactors.populationContext} | Fator Renda: ${demographicFactors.baseIncomeFactor.toFixed(2)}x`,
                    });
                }
            }

            return {
                success: true,
                result,
                demographics: demographics ? {
                    municipalityName: demographics.municipalityName,
                    state: demographics.state,
                    population: demographics.population,
                    year: demographics.year,
                    source: demographics.source,
                    factors: demographicFactors,
                } : null,
                timestamp: new Date().toISOString(),
            };
        } catch (error: any) {
            if (error instanceof HttpsError) {
                throw error;
            }
            console.error('[forecast] Error:', error);
            throw new HttpsError('internal', error.message || 'Erro ao calcular previsao');
        }
    },
);

/**
 * callable: fetchClimate
 * Fetches weather data for the admin "Buscar Clima" button.
 */
export const fetchClimate = onCall(
    { region: 'southamerica-east1' },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Usuario nao autenticado');
        }

        const { latitude, longitude, eventDate } = request.data || {};
        if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
            throw new HttpsError('invalid-argument', 'latitude e longitude sao obrigatorios');
        }
        if (!isValidDateOnly(eventDate)) {
            throw new HttpsError('invalid-argument', 'eventDate invalido (esperado YYYY-MM-DD)');
        }

        try {
            const climate = await fetchClimateForEvent(latitude, longitude, eventDate);
            const dayClimate = extractDayClimate(climate, eventDate);
            if (!dayClimate) {
                throw new HttpsError(
                    'failed-precondition',
                    'Data fora da janela retornada pelo Open-Meteo.',
                );
            }

            return {
                success: true,
                climate: dayClimate,
                source: climate.source,
            };
        } catch (error: any) {
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', error.message || 'Erro ao buscar clima');
        }
    },
);
