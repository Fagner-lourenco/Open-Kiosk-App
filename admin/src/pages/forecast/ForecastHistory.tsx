/**
 * ForecastHistory - previous forecasts with predicted vs actual comparison.
 */

import { useEffect, useMemo, useState } from 'react';
import { History, Edit3, Loader2, Save, X } from 'lucide-react';
import { useForecast } from '@/hooks/useForecast';
import { RISK_LEVEL_CONFIG } from '@/types/forecast';
import type { RiskLevel } from '@/types/forecast';

interface ForecastEntry {
    id: string;
    input: { eventName?: string; eventDate?: string };
    result: { totalLiters?: { p50?: number }; riskLevel?: RiskLevel };
    createdAt: Date;
    actualResult?: { totalLiters: number; peakLph: number } | null;
}

export function ForecastHistory({ storeId }: { storeId?: string }) {
    const { loadHistory, updateActual } = useForecast(storeId);
    const [entries, setEntries] = useState<ForecastEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [actualTotalLiters, setActualTotalLiters] = useState('');
    const [actualPeakLph, setActualPeakLph] = useState('');
    const [isSavingActual, setIsSavingActual] = useState(false);

    useEffect(() => {
        setLoading(true);
        loadHistory(20)
            .then((data) => setEntries(data))
            .finally(() => setLoading(false));
    }, [loadHistory]);

    const parsedActual = useMemo(() => {
        const hasTotal = actualTotalLiters.trim() !== '';
        const hasPeak = actualPeakLph.trim() !== '';
        const total = Number(actualTotalLiters);
        const peak = Number(actualPeakLph);
        const totalOk = Number.isFinite(total) && total >= 0;
        const peakOk = Number.isFinite(peak) && peak >= 0;
        return {
            total,
            peak,
            isValid: hasTotal && hasPeak && totalOk && peakOk,
        };
    }, [actualTotalLiters, actualPeakLph]);

    function startEdit(entry: ForecastEntry) {
        setEditingId(entry.id);
        setActualTotalLiters(entry.actualResult?.totalLiters?.toString() ?? '');
        setActualPeakLph(entry.actualResult?.peakLph?.toString() ?? '');
    }

    function cancelEdit() {
        setEditingId(null);
        setActualTotalLiters('');
        setActualPeakLph('');
    }

    async function saveEdit(entryId: string) {
        if (!parsedActual.isValid) return;
        setIsSavingActual(true);
        const ok = await updateActual(entryId, {
            totalLiters: parsedActual.total,
            peakLph: parsedActual.peak,
        });
        if (ok) {
            setEntries((prev) => prev.map((entry) => (
                entry.id === entryId
                    ? {
                        ...entry,
                        actualResult: {
                            totalLiters: parsedActual.total,
                            peakLph: parsedActual.peak,
                        },
                    }
                    : entry
            )));
            cancelEdit();
        }
        setIsSavingActual(false);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700 text-center">
                <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                    Nenhuma previsao salva ainda.<br />
                    Use o Simulador para criar sua primeira previsao.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Evento</th>
                            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Data</th>
                            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-right">Previsto (L)</th>
                            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-right">Real (L)</th>
                            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-center">Erro</th>
                            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-center">Risco</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {entries.map((entry) => {
                            const riskKey = (entry.result?.riskLevel || 'low') as RiskLevel;
                            const risk = RISK_LEVEL_CONFIG[riskKey];
                            const predicted = entry.result?.totalLiters?.p50 || 0;
                            const actual = entry.actualResult?.totalLiters;
                            const errorPct = actual != null && predicted > 0
                                ? ((actual - predicted) / predicted * 100).toFixed(1)
                                : null;
                            const isEditing = editingId === entry.id;

                            return (
                                <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                                        {entry.input?.eventName || 'Sem nome'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                                        {entry.input?.eventDate || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400 font-medium">
                                        {Math.round(predicted)}L
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {isEditing ? (
                                            <div className="flex justify-end items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                                    placeholder="Litros"
                                                    value={actualTotalLiters}
                                                    onChange={(e) => setActualTotalLiters(e.target.value)}
                                                />
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                                    placeholder="Pico L/h"
                                                    value={actualPeakLph}
                                                    onChange={(e) => setActualPeakLph(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => saveEdit(entry.id)}
                                                    disabled={isSavingActual || !parsedActual.isValid}
                                                    className="text-green-600 hover:text-green-700 disabled:opacity-50"
                                                    aria-label="Salvar resultado real"
                                                >
                                                    {isSavingActual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEdit}
                                                    disabled={isSavingActual}
                                                    className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                                    aria-label="Cancelar edicao"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : actual != null ? (
                                            <div className="flex justify-end items-center gap-2">
                                                <span className="text-green-600 dark:text-green-400 font-medium">
                                                    {Math.round(actual)}L
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(entry)}
                                                    className="text-gray-400 hover:text-gray-600"
                                                    aria-label="Editar resultado real"
                                                >
                                                    <Edit3 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="text-gray-400 hover:text-gray-600 text-xs flex items-center gap-1 ml-auto"
                                                onClick={() => startEdit(entry)}
                                            >
                                                <Edit3 className="h-3 w-3" /> Inserir
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {errorPct != null ? (
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${Math.abs(Number(errorPct)) < 15
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {Number(errorPct) > 0 ? '+' : ''}{errorPct}%
                                            </span>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`text-xs font-medium ${risk.color}`}>
                                            {risk.icon} {risk.label}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
