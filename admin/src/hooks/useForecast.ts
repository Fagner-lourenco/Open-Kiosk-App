/**
 * ============================================================================
 * useForecast Hook — State management for demand forecasting
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import {
    runForecast,
    fetchClimateData,
    saveForecast,
    listForecasts,
    updateActualResult,
} from '@/services/forecastService';
import type { ForecastInput, ForecastResult } from '@/types/forecast';
import { useToast } from './useToast';
import { getErrorMessage } from '@/lib/errors';

interface UseForecastReturn {
    // State
    isCalculating: boolean;
    isLoadingClimate: boolean;
    isSaving: boolean;
    result: ForecastResult | null;
    error: string | null;

    // Actions
    calculate: (input: ForecastInput) => Promise<ForecastResult | null>;
    fetchClimate: (lat: number, lon: number, date: string) => Promise<{
        tempMax: number;
        tempMin: number;
        rainMm: number;
        avgHumidity: number;
    } | null>;
    save: (input: ForecastInput, result: ForecastResult) => Promise<string | null>;
    updateActual: (forecastId: string, actualResult: { totalLiters: number; peakLph: number }) => Promise<boolean>;
    loadHistory: (maxResults?: number) => Promise<any[]>;
    clearResult: () => void;
}

export function useForecast(preferredStoreId?: string): UseForecastReturn {
    const { currentFranchise, stores } = useFranchise();
    const { user } = useAuth();
    const { toast } = useToast();
    const selectedStore = useMemo(() => {
        if (preferredStoreId) {
            const preferredStore = stores.find((store) => store.id === preferredStoreId);
            if (preferredStore) return preferredStore;
        }
        const claimStoreId = user?.claims?.storeId;
        if (claimStoreId) {
            const claimStore = stores.find((store) => store.id === claimStoreId);
            if (claimStore) return claimStore;
        }
        return stores[0];
    }, [stores, user?.claims?.storeId, preferredStoreId]);

    const [isCalculating, setIsCalculating] = useState(false);
    const [isLoadingClimate, setIsLoadingClimate] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [result, setResult] = useState<ForecastResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const calculate = useCallback(async (input: ForecastInput): Promise<ForecastResult | null> => {
        setIsCalculating(true);
        setError(null);

        try {
            const response = await runForecast(input);
            setResult(response.result);
            return response.result;
        } catch (err: unknown) {
            const msg = getErrorMessage(err, 'Erro ao calcular previsão');
            setError(msg);
            toast.error('Erro', { description: msg });
            return null;
        } finally {
            setIsCalculating(false);
        }
    }, [toast]);

    const fetchClimate = useCallback(async (
        lat: number,
        lon: number,
        date: string,
    ) => {
        setIsLoadingClimate(true);
        try {
            const data = await fetchClimateData(lat, lon, date);
            toast.success('🌤️ Clima carregado', { description: `${data.tempMax}°C máx, ${data.rainMm}mm chuva` });
            return data;
        } catch (err: unknown) {
            toast.error('Erro ao buscar clima', { description: getErrorMessage(err) });
            return null;
        } finally {
            setIsLoadingClimate(false);
        }
    }, [toast]);

    const save = useCallback(async (
        input: ForecastInput,
        forecastResult: ForecastResult,
    ): Promise<string | null> => {
        if (!currentFranchise || !selectedStore || !user) {
            toast.error('Erro', { description: 'Selecione uma loja primeiro' });
            return null;
        }
        setIsSaving(true);
        try {
            const id = await saveForecast(
                currentFranchise.id,
                selectedStore.id,
                input,
                forecastResult,
                user.uid,
            );
            toast.success('✅ Previsão salva', { description: `ID: ${id.slice(0, 8)}...` });
            return id;
        } catch (err: unknown) {
            toast.error('Erro ao salvar', { description: getErrorMessage(err) });
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [currentFranchise, selectedStore, user, toast]);

    const loadHistory = useCallback(async (maxResults = 20) => {
        if (!currentFranchise || !selectedStore) return [];
        try {
            return await listForecasts(currentFranchise.id, selectedStore.id, maxResults);
        } catch (err: unknown) {
            toast.error('Erro ao carregar historico', {
                description: getErrorMessage(err, 'Falha ao carregar previsoes salvas'),
            });
            return [];
        }
    }, [currentFranchise, selectedStore, toast]);

    const updateActual = useCallback(async (
        forecastId: string,
        actualResult: { totalLiters: number; peakLph: number },
    ): Promise<boolean> => {
        if (!currentFranchise || !selectedStore) {
            toast.error('Erro', { description: 'Selecione uma loja primeiro' });
            return false;
        }
        try {
            await updateActualResult(
                currentFranchise.id,
                selectedStore.id,
                forecastId,
                actualResult,
            );
            toast.success('Resultado real salvo', {
                description: `Previsao ${forecastId.slice(0, 8)} atualizada`,
            });
            return true;
        } catch (err: unknown) {
            toast.error('Erro ao atualizar', { description: getErrorMessage(err, 'Falha ao atualizar resultado real') });
            return false;
        }
    }, [currentFranchise, selectedStore, toast]);

    const clearResult = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);

    return {
        isCalculating,
        isLoadingClimate,
        isSaving,
        result,
        error,
        calculate,
        fetchClimate,
        save,
        updateActual,
        loadHistory,
        clearResult,
    };
}
