import { describe, expect, it } from 'vitest';
import { calculateForecast } from '../forecast/forecastEngine';
import { extractDayClimate } from '../forecast/climateService';

const baseInput = {
  eventName: 'Evento Teste',
  eventDate: '2026-03-06',
  eventCategory: 'festival',
  totalPeople: 200,
  choppAdoptionRate: [0.2, 0.4] as [number, number],
  durationHours: 6,
  peakDurationHours: 2,
  eventStartHour: 14,
  eventEndHour: 20,
  temperature: 25,
  rain: 0 as boolean | number,
  humidity: 60,
  exposure: 'covered' as const,
  climateSource: 'manual' as const,
  competition: 'none' as const,
  distanceFromFlow: 5,
  visibility: 'high' as const,
  numberOfTotems: 1,
  tapsPerTotem: 2,
  kegSizeLiters: 50 as const,
  kegArrivalTemp: 8,
  coolingCapacityLph: 100,
};

describe('forecast engine hardening', () => {
  it('aplica weekend boost corretamente para sabado vs sexta', () => {
    const friday = calculateForecast({
      ...baseInput,
      eventDate: '2026-03-06', // sexta
    });
    const saturday = calculateForecast({
      ...baseInput,
      eventDate: '2026-03-07', // sabado
    });

    expect(saturday.totalLiters.p50).toBeGreaterThan(friday.totalLiters.p50);
  });

  it('nao converte rain=false manual em chuva sazonal automaticamente', () => {
    const boolFalse = calculateForecast({
      ...baseInput,
      eventDate: '2026-01-15',
      rain: false,
      climateSource: 'manual',
    });
    const zeroMm = calculateForecast({
      ...baseInput,
      eventDate: '2026-01-15',
      rain: 0,
      climateSource: 'manual',
    });

    expect(boolFalse.totalLiters.p50).toBeCloseTo(zeroMm.totalLiters.p50, 5);
  });

  it('evita volume negativo quando totalPeople invalido for negativo', () => {
    const result = calculateForecast({
      ...baseInput,
      totalPeople: -50,
    });

    expect(result.totalLiters.p10).toBe(0);
    expect(result.totalLiters.p50).toBe(0);
    expect(result.totalLiters.p90).toBe(0);
  });
});

describe('climate extract hardening', () => {
  it('retorna null quando targetDate nao existe na janela retornada', () => {
    const climateData: any = {
      source: 'open_meteo',
      daily: {
        temperature_2m_max: [30, 31],
        temperature_2m_min: [20, 21],
        precipitation_sum: [0, 5],
      },
      hourly: {
        time: ['2026-03-06T00:00', '2026-03-06T01:00'],
        temperature_2m: [25, 26],
        precipitation: [0, 0],
        relative_humidity_2m: [70, 71],
        apparent_temperature: [25, 26],
      },
    };

    const day = extractDayClimate(climateData, '2030-01-01');
    expect(day).toBeNull();
  });
});
