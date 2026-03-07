/**
 * ============================================================================
 * Forecast Service — Integração admin ↔ Cloud Functions
 * ============================================================================
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import {
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    getDocs,
    doc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ForecastInput, ForecastResult } from '@/types/forecast';

// ─── Callable Functions ─────────────────────────────────────────────────────

const calculateForecastFn = httpsCallable(functions, 'calculateDemandForecast');
const fetchClimateFn = httpsCallable(functions, 'fetchClimate');

/**
 * Executa o motor de previsão via Cloud Function.
 */
export async function runForecast(input: ForecastInput): Promise<{
    result: ForecastResult;
    demographics?: any;
}> {
    const response = await calculateForecastFn({ input });
    const data = response.data as any;

    if (!data.success) {
        throw new Error(data.error || 'Erro ao calcular previsão');
    }

    return {
        result: data.result,
        demographics: data.demographics,
    };
}

/**
 * Busca dados climáticos para coordenadas e data.
 * Usado pelo botão "Buscar Clima" no simulador.
 */
export async function fetchClimateData(
    latitude: number,
    longitude: number,
    eventDate: string,
): Promise<{
    tempMax: number;
    tempMin: number;
    rainMm: number;
    avgHumidity: number;
    source: string;
}> {
    const response = await fetchClimateFn({ latitude, longitude, eventDate });
    const data = response.data as any;

    if (!data.success || !data.climate) {
        throw new Error('Dados climáticos não disponíveis');
    }

    return {
        ...data.climate,
        source: data.source,
    };
}

// ─── Firestore CRUD ─────────────────────────────────────────────────────────

/**
 * Salva uma previsão no Firestore.
 */
export async function saveForecast(
    franchiseId: string,
    storeId: string,
    input: ForecastInput,
    result: ForecastResult,
    userId: string,
): Promise<string> {
    const ref = collection(
        db,
        'franchises', franchiseId,
        'stores', storeId,
        'forecasts',
    );

    const docRef = await addDoc(ref, {
        input,
        result,
        createdAt: serverTimestamp(),
        createdBy: userId,
        actualResult: null,
    });

    return docRef.id;
}

/**
 * Lista previsões anteriores (últimas N).
 */
export async function listForecasts(
    franchiseId: string,
    storeId: string,
    maxResults: number = 20,
): Promise<Array<{
    id: string;
    input: ForecastInput;
    result: ForecastResult;
    createdAt: Date;
    actualResult?: { totalLiters: number; peakLph: number } | null;
}>> {
    const ref = collection(
        db,
        'franchises', franchiseId,
        'stores', storeId,
        'forecasts',
    );

    const q = query(ref, orderBy('createdAt', 'desc'), limit(maxResults));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
    })) as any;
}

/**
 * Atualiza o resultado real de uma previsão (para calibração).
 */
export async function updateActualResult(
    franchiseId: string,
    storeId: string,
    forecastId: string,
    actualResult: { totalLiters: number; peakLph: number },
): Promise<void> {
    const ref = doc(
        db,
        'franchises', franchiseId,
        'stores', storeId,
        'forecasts', forecastId,
    );

    await updateDoc(ref, {
        actualResult,
        updatedAt: serverTimestamp(),
    });
}
