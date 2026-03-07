/**
 * ============================================================================
 * Demographic Service — Integração com IBGE Agregados (sem API key)
 * ============================================================================
 *
 * Endpoint: https://servicodados.ibge.gov.br/api/v3/agregados/
 * Tabela 6579, Variável 9324 = População residente estimada
 */

import * as admin from 'firebase-admin';

export interface DemographicData {
    municipalityCode: string;
    municipalityName: string;
    state: string;
    population: number;
    year: number;
    source: 'ibge' | 'cache';
}

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api';

/**
 * Busca população estimada de um município pelo código IBGE.
 * Cache anual no Firestore (dados mudam 1x/ano).
 */
export async function getPopulation(municipalityCode: string): Promise<DemographicData> {
    const cacheRef = admin.firestore()
        .collection('forecastCache')
        .doc('demographics')
        .collection('municipalities')
        .doc(municipalityCode);

    // Check cache (valid for 365 days)
    try {
        const cached = await cacheRef.get();
        if (cached.exists) {
            const data = cached.data() as DemographicData & { cachedAt: any };
            const cachedAt = data.cachedAt?.toDate?.() || new Date(0);
            const ageDays = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays < 365) {
                return { ...data, source: 'cache' };
            }
        }
    } catch (e) {
        console.warn('[demographicService] Cache read failed:', e);
    }

    // Fetch from IBGE API
    const url = `${IBGE_BASE}/v3/agregados/6579/periodos/-6/variaveis/9324?localidades=N6[${municipalityCode}]`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`IBGE API returned ${response.status}`);
        }

        const json = await response.json();
        const result = json[0];
        const series = result?.resultados?.[0]?.series?.[0];

        if (!series) {
            throw new Error('No data returned from IBGE');
        }

        // Get most recent year's data
        const years = Object.keys(series.serie).sort().reverse();
        const latestYear = years[0];
        const population = parseInt(series.serie[latestYear], 10);

        const nameMatch = series.localidade.nome.match(/^(.+)\s*\((\w+)\)$/);
        const municipalityName = nameMatch ? nameMatch[1].trim() : series.localidade.nome;
        const state = nameMatch ? nameMatch[2] : '';

        const data: DemographicData = {
            municipalityCode,
            municipalityName,
            state,
            population,
            year: parseInt(latestYear, 10),
            source: 'ibge',
        };

        // Cache
        try {
            await cacheRef.set({
                ...data,
                cachedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (e) {
            console.warn('[demographicService] Cache write failed:', e);
        }

        return data;
    } catch (error) {
        console.error('[demographicService] Fetch failed:', error);

        // Fallback to stale cache
        try {
            const stale = await cacheRef.get();
            if (stale.exists) {
                return { ...(stale.data() as DemographicData), source: 'cache' };
            }
        } catch { /* empty */ }

        throw new Error(`Failed to fetch demographics for ${municipalityCode}`);
    }
}

export async function searchMunicipality(
    name: string,
): Promise<Array<{ id: string; name: string; state: string }>> {
    const url = `${IBGE_BASE}/v1/localidades/municipios`;

    try {
        const response = await fetch(url);
        if (!response.ok) return [];

        const all = await response.json() as Array<{
            id: number;
            nome: string;
            microrregiao: { mesorregiao: { UF: { sigla: string } } };
        }>;

        const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return all
            .filter(m => m.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalized))
            .slice(0, 10)
            .map(m => ({
                id: m.id.toString(),
                name: m.nome,
                state: m.microrregiao.mesorregiao.UF.sigla,
            }));
    } catch {
        return [];
    }
}

/**
 * Reverse geocoding: lat/lon → código IBGE do município.
 * Usa Nominatim (OpenStreetMap) para encontrar o nome da cidade,
 * depois busca o código IBGE via API de Localidades.
 */
export async function reverseGeocodeToIBGE(
    lat: number,
    lon: number,
): Promise<{ code: string; name: string; state: string } | null> {
    try {
        // Step 1: Nominatim reverse geocoding (free, 1 req/s)
        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR&zoom=10`;
        const geoResponse = await fetch(nominatimUrl, {
            headers: { 'User-Agent': 'OpenKiosk-ForecastEngine/1.0' },
        });

        if (!geoResponse.ok) return null;
        const geoData = await geoResponse.json();

        const cityName = geoData.address?.city
            || geoData.address?.town
            || geoData.address?.municipality
            || geoData.address?.county;
        const stateName = geoData.address?.state;

        if (!cityName) return null;

        // Step 2: Search IBGE for the municipality code
        const results = await searchMunicipality(cityName);
        if (results.length === 0) return null;

        // Try to match by state if available
        const stateAbbrev = stateName ? getStateAbbrev(stateName) : null;
        const match = stateAbbrev
            ? results.find(r => r.state === stateAbbrev) || results[0]
            : results[0];

        return { code: match.id, name: match.name, state: match.state };
    } catch (err) {
        console.warn('[demographicService] Reverse geocoding failed:', err);
        return null;
    }
}

/**
 * Multiplicador regional de consumo de cerveja per-capita por UF.
 *
 * Fonte: CervBrasil / IBGE SIDRA (produção + população).
 * Brasil médio = 70 L/ano per capita (adulto). Fator = 1.0 = média nacional.
 *
 * Regiões com cultura cervejeira mais forte (RS, SC, PR, SP, MG)
 * têm consumo acima da média; Norte e Nordeste abaixo.
 * Esses fatores modulam r_per_capita regional no engine.
 */
export const REGIONAL_BEER_FACTOR: Record<string, number> = {
    // Sul — tradição cervejeira forte (Oktoberfest, colonização alemã)
    RS: 1.15,
    SC: 1.20,
    PR: 1.10,
    // Sudeste — maior mercado absoluto
    SP: 1.05,
    RJ: 1.00,
    MG: 1.05,
    ES: 0.95,
    // Centro-Oeste
    DF: 1.10,  // Renda alta
    GO: 1.00,
    MT: 0.95,
    MS: 0.95,
    // Nordeste — clima quente mas menor renda
    BA: 0.90,
    PE: 0.90,
    CE: 0.85,
    MA: 0.80,
    PB: 0.85,
    PI: 0.80,
    RN: 0.85,
    AL: 0.85,
    SE: 0.85,
    // Norte — menor consumo per capita
    AM: 0.80,
    PA: 0.80,
    AC: 0.75,
    AP: 0.75,
    RO: 0.85,
    RR: 0.75,
    TO: 0.85,
};

/**
 * Multiplicador de Renda Per Capita por UF (Base: PNAD Contínua 2023 - IBGE).
 * Renda maior = maior ticket médio = maior adesão a produtos premium/Chopp Artesanal.
 * Média Nacional ~= 1.00
 */
export const INCOME_FACTOR_BY_STATE: Record<string, number> = {
    DF: 1.30, SP: 1.15, SC: 1.15, RS: 1.10, RJ: 1.10, PR: 1.05,
    MG: 1.00, ES: 1.00, MS: 1.00, MT: 1.00, GO: 0.95,
    RO: 0.90, TO: 0.85, AP: 0.85, RR: 0.85, PA: 0.80, AM: 0.80, AC: 0.80,
    RN: 0.85, CE: 0.85, PE: 0.85, PB: 0.80, SE: 0.80, AL: 0.80, BA: 0.80, PI: 0.75, MA: 0.75,
};

/**
 * Porcentagem média da população brasileira que é adulta (>= 18 anos).
 * Fonte: Censo Demográfico IBGE 2022.
 */
export const ADULT_POPULATION_RATIO = 0.76;

/**
 * Calcula fatores demográficos que influenciam a demanda.
 *
 * Retorna:
 *   - regionalFactor: ajuste composto (Cultura Cervejeira × Classe de Renda)
 *   - eventSaturation: razão evento / população adulta
 *   - adultPopulation: População endereçável
 *   - populationContext: contexto textual detalhado
 */
export function calculateDemographicFactors(
    demographics: DemographicData,
    eventSize: number,
): {
    regionalFactor: number;
    eventSaturation: number;
    saturationRisk: 'low' | 'medium' | 'high';
    populationContext: string;
    adultPopulation: number;
    baseCultFactor: number;
    baseIncomeFactor: number;
} {
    const baseCultFactor = REGIONAL_BEER_FACTOR[demographics.state] ?? 1.0;
    const baseIncomeFactor = INCOME_FACTOR_BY_STATE[demographics.state] ?? 1.0;

    // Fator Regional Composto: Cultura Local × Poder Aquisitivo
    const regionalFactor = Math.round((baseCultFactor * baseIncomeFactor) * 100) / 100;

    // Isolar público alvo real (>= 18 anos) para evitar diluição irreal por bebês/crianças
    const adultPopulation = Math.max(1, Math.round(demographics.population * ADULT_POPULATION_RATIO));

    // Event saturation: qual % dos adultos da cidade o evento representa
    const eventSaturation = adultPopulation > 0
        ? eventSize / adultPopulation
        : 0;

    // Categorizar risco de saturação (limites mais agressivos agora que isolamos os adultos)
    let saturationRisk: 'low' | 'medium' | 'high' = 'low';
    if (eventSaturation > 0.10) saturationRisk = 'high';     // > 10% da pop adulta da cidade!
    else if (eventSaturation > 0.03) saturationRisk = 'medium'; // > 3%

    // Contexto textual mais rico
    const totalPopK = Math.round(demographics.population / 1000);
    const adultPopK = Math.round(adultPopulation / 1000);
    const pctStr = (eventSaturation * 100).toFixed(1);
    const populationContext = `${demographics.municipalityName}/${demographics.state} ` +
        `(${totalPopK}k hab totais / ${adultPopK}k adultos) — evento = ${pctStr}% dos adultos`;

    return { regionalFactor, eventSaturation, saturationRisk, populationContext, adultPopulation, baseCultFactor, baseIncomeFactor };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStateAbbrev(stateName: string): string | null {
    const map: Record<string, string> = {
        'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amapá': 'AP',
        'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE', 'ceará': 'CE',
        'distrito federal': 'DF', 'espirito santo': 'ES', 'espírito santo': 'ES',
        'goias': 'GO', 'goiás': 'GO', 'maranhao': 'MA', 'maranhão': 'MA',
        'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
        'para': 'PA', 'pará': 'PA', 'paraiba': 'PB', 'paraíba': 'PB',
        'parana': 'PR', 'paraná': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
        'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
        'rio grande do sul': 'RS', 'rondonia': 'RO', 'rondônia': 'RO',
        'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
        'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
    };
    const normalized = stateName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return map[normalized] || null;
}

