/**
 * ============================================================================
 * ForecastSimulator — Formulário interativo de previsão + resultados visuais
 * ============================================================================
 */

import React, { useState, useCallback } from 'react';
import {
    Users, Thermometer, CloudRain, MapPin, Zap,
    ChevronDown, ChevronUp, Loader2, Save,
    AlertTriangle, Info, Beer,
} from 'lucide-react';
import { useForecast } from '@/hooks/useForecast';
import type {
    ForecastInput,
    ForecastResult,
    EventCategory,
} from '@/types/forecast';
import { EVENT_CATEGORIES, RISK_LEVEL_CONFIG } from '@/types/forecast';

function getLocalDateYYYYMMDD(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ─── Default input values ───────────────────────────────────────────────────

const DEFAULT_INPUT: ForecastInput = {
    eventName: '',
    eventDate: getLocalDateYYYYMMDD(),
    eventCategory: 'festival',
    totalPeople: 200,
    choppAdoptionRate: [0.20, 0.40],
    durationHours: 6,
    peakDurationHours: 2,
    eventStartHour: 14,
    eventEndHour: 20,
    temperature: 25,
    rain: false,
    humidity: 60,
    exposure: 'covered',
    climateSource: 'manual',
    latitude: -23.55,
    longitude: -46.63,
    competition: 'none',
    distanceFromFlow: 5,
    visibility: 'high',
    numberOfTotems: 1,
    tapsPerTotem: 2,
    kegSizeLiters: 50,
    kegArrivalTemp: 8,
    coolingCapacityLph: 100,
};

// ─── Accordion Section Component ────────────────────────────────────────────

function Section({
    title, icon: Icon, children, defaultOpen = true,
}: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <Icon className="h-4 w-4 text-amber-500" />
                    {title}
                </span>
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {open && <div className="px-4 py-4 space-y-4">{children}</div>}
        </div>
    );
}

// ─── Form Field Components ──────────────────────────────────────────────────

function NumberField({
    label, value, onChange, min, max, step, unit, hint,
}: {
    label: string; value: number; onChange: (v: number) => void;
    min?: number; max?: number; step?: number; unit?: string; hint?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {label} {unit && <span className="text-gray-400">({unit})</span>}
            </label>
            <input
                type="number"
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                min={min}
                max={max}
                step={step || 1}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
    );
}

function SelectField({
    label, value, onChange, options,
}: {
    label: string; value: string; onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            >
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </div>
    );
}

// ─── Results Display ────────────────────────────────────────────────────────

function ResultsPanel({ result }: { result: ForecastResult }) {
    const risk = RISK_LEVEL_CONFIG[result.riskLevel];

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Total Liters */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700/50">
                    <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Volume Total (p50)</div>
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                        {Math.round(result.totalLiters.p50)} L
                    </div>
                    <div className="text-xs text-amber-500 mt-1">
                        p10: {Math.round(result.totalLiters.p10)}L · p90: {Math.round(result.totalLiters.p90)}L
                    </div>
                </div>

                {/* Kegs */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-4 border border-blue-200 dark:border-blue-700/50">
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Barris</div>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                        {result.kegCount.total}
                    </div>
                    <div className="text-xs text-blue-500 mt-1">
                        {result.kegCount.required} base + {result.kegCount.reserve} reserva
                    </div>
                </div>

                {/* Peak */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-4 border border-purple-200 dark:border-purple-700/50">
                    <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Pico (p50)</div>
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">
                        {Math.round(result.peakLph.p50)} L/h
                    </div>
                    <div className="text-xs text-purple-500 mt-1">
                        {result.peakWindow.startHour}:00–{result.peakWindow.endHour}:00
                    </div>
                </div>

                {/* Risk */}
                <div className={`rounded-xl p-4 border ${risk.bgColor} border-opacity-50`}>
                    <div className={`text-xs font-medium ${risk.color}`}>Risco</div>
                    <div className={`text-2xl font-bold ${risk.color} mt-1`}>
                        {risk.icon} {risk.label}
                    </div>
                    {result.riskReasons.length > 0 && (
                        <div className="text-xs mt-1 opacity-70">{result.riskReasons[0]}</div>
                    )}
                </div>
            </div>

            {/* Demand vs Capacity Curve (simple text representation) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    📊 Curva λ(t) vs C_safe(t)
                </h3>
                <div className="space-y-1 font-mono text-xs">
                    {result.demandCurve.map((d) => {
                        const cap = result.capacityCurve.find(c => c.hour === d.hour)?.value || 0;
                        const maxVal = Math.max(cap, d.value, 1);
                        const demandBar = Math.round((d.value / maxVal) * 25);
                        const isDeficit = d.value > cap;

                        return (
                            <div key={d.hour} className="flex items-center gap-2">
                                <span className="w-12 text-gray-500">{d.hour}:00</span>
                                <div className="flex-1">
                                    <div className={`h-3 rounded-sm ${isDeficit ? 'bg-red-400' : 'bg-amber-400'}`}
                                        style={{ width: `${Math.max(demandBar * 4, 2)}%` }} />
                                </div>
                                <span className={`w-16 text-right ${isDeficit ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                    {d.value.toFixed(0)}L/h
                                </span>
                                <span className="w-2 text-gray-300">|</span>
                                <span className="w-16 text-right text-green-600">{cap.toFixed(0)}L/h</span>
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-400 rounded-sm inline-block" /> Demanda</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-400 rounded-sm inline-block" /> Déficit</span>
                    <span className="text-green-600">| Capacidade</span>
                </div>
            </div>

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                        💡 Recomendações
                    </h3>
                    <div className="space-y-2">
                        {result.recommendations.map((rec, i) => {
                            const icons = {
                                info: <Info className="h-4 w-4 text-blue-500" />,
                                warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
                                critical: <AlertTriangle className="h-4 w-4 text-red-500" />,
                            };

                            return (
                                <div key={i} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    {icons[rec.severity]}
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{rec.message}</p>
                                        {rec.details && (
                                            <p className="text-xs text-gray-500 mt-0.5">{rec.details}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Model info */}
            <div className="text-xs text-gray-400 text-center">
                Modelo: {result.modelVersion} | Parâmetros: {Object.keys(result.parametersUsed).length} calibrados
            </div>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ForecastSimulator({ storeId }: { storeId?: string }) {
    const [input, setInput] = useState<ForecastInput>(DEFAULT_INPUT);
    const { isCalculating, isLoadingClimate, isSaving, result, calculate, fetchClimate: doFetchClimate, save } = useForecast(storeId);

    const updateInput = useCallback(<K extends keyof ForecastInput>(key: K, value: ForecastInput[K]) => {
        setInput(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleCalculate = async () => {
        await calculate(input);
    };

    const handleSave = async () => {
        if (result) {
            await save(input, result);
        }
    };

    const handleFetchClimate = async () => {
        if (input.latitude == null || input.longitude == null) return;
        const data = await doFetchClimate(input.latitude, input.longitude, input.eventDate);
        if (data) {
            setInput(prev => ({
                ...prev,
                temperature: data.tempMax,
                rain: data.rainMm,
                humidity: data.avgHumidity,
                climateSource: 'open_meteo' as const,
            }));
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form */}
            <div className="space-y-4">
                {/* Event name */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome do Evento</label>
                    <input
                        type="text"
                        value={input.eventName}
                        onChange={e => updateInput('eventName', e.target.value)}
                        placeholder="Ex: Festival de Verão 2026"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                </div>

                {/* Section A — Evento e Público */}
                <Section title="Evento e Público" icon={Users}>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data</label>
                            <input
                                type="date"
                                value={input.eventDate}
                                onChange={e => updateInput('eventDate', e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                        <SelectField
                            label="Categoria"
                            value={input.eventCategory}
                            onChange={v => updateInput('eventCategory', v as EventCategory)}
                            options={EVENT_CATEGORIES.map(c => ({ value: c.value, label: `${c.icon} ${c.label}` }))}
                        />
                    </div>

                    <NumberField label="Público Total" value={input.totalPeople} onChange={v => updateInput('totalPeople', v)} min={10} max={50000} unit="pessoas" />

                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Adesão Mínima" value={input.choppAdoptionRate[0] * 100}
                            onChange={(v) => {
                                const nextMin = Math.max(0, Math.min(v / 100, input.choppAdoptionRate[1]));
                                updateInput('choppAdoptionRate', [nextMin, input.choppAdoptionRate[1]]);
                            }}
                            min={5} max={80} unit="%" hint="% do público que bebe chopp" />
                        <NumberField label="Adesão Máxima" value={input.choppAdoptionRate[1] * 100}
                            onChange={(v) => {
                                const nextMax = Math.min(1, Math.max(v / 100, input.choppAdoptionRate[0]));
                                updateInput('choppAdoptionRate', [input.choppAdoptionRate[0], nextMax]);
                            }}
                            min={10} max={90} unit="%" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Duração" value={input.durationHours} onChange={v => updateInput('durationHours', v)} min={1} max={24} unit="horas" />
                        <NumberField label="Pico estimado" value={input.peakDurationHours} onChange={v => updateInput('peakDurationHours', v)} min={1} max={8} unit="horas" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Hora Início" value={input.eventStartHour} onChange={v => {
                            updateInput('eventStartHour', v);
                            updateInput('eventEndHour', Math.min(24, v + input.durationHours));
                        }} min={0} max={23} hint="0–23" />
                        <NumberField label="Hora Fim" value={input.eventEndHour} onChange={v => updateInput('eventEndHour', v)} min={1} max={24} hint="1–24" />
                    </div>
                </Section>

                {/* Section B — Clima */}
                <Section title="Clima e Exposição" icon={Thermometer}>
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Temperatura" value={input.temperature} onChange={v => updateInput('temperature', v)} min={0} max={45} step={0.5} unit="°C" hint="Use T_max para melhor precisão" />
                        <NumberField label="Umidade" value={input.humidity || 60} onChange={v => updateInput('humidity', v)} min={10} max={100} unit="%" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Chuva</label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => updateInput('rain', !input.rain)}
                                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${input.rain
                                        ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                                        : 'bg-gray-100 border-gray-300 text-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
                                        }`}
                                >
                                    <CloudRain className="h-4 w-4 inline mr-1" />
                                    {input.rain ? 'Sim' : 'Não'}
                                </button>
                            </div>
                        </div>
                        <SelectField
                            label="Exposição"
                            value={input.exposure}
                            onChange={v => updateInput('exposure', v as ForecastInput['exposure'])}
                            options={[
                                { value: 'sun_open', label: '☀️ Sol aberto' },
                                { value: 'covered', label: '⛱️ Coberto' },
                                { value: 'indoor_ac', label: '❄️ Fechado c/ AC' },
                            ]}
                        />
                    </div>

                    {/* Fetch Climate button */}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                            <NumberField label="Latitude" value={input.latitude ?? -23.55} onChange={v => updateInput('latitude', v)} step={0.01} />
                            <NumberField label="Longitude" value={input.longitude ?? -46.63} onChange={v => updateInput('longitude', v)} step={0.01} />
                        </div>
                        <button
                            onClick={handleFetchClimate}
                            disabled={isLoadingClimate}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                            {isLoadingClimate ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                            Buscar Clima
                        </button>
                    </div>
                </Section>

                {/* Section C — Logística */}
                <Section title="Logística e Concorrência" icon={MapPin} defaultOpen={false}>
                    <SelectField label="Concorrência" value={input.competition}
                        onChange={v => updateInput('competition', v as ForecastInput['competition'])}
                        options={[
                            { value: 'none', label: 'Nenhuma' },
                            { value: 'light', label: 'Leve (1-2 opções)' },
                            { value: 'moderate', label: 'Moderada (3-5 opções)' },
                            { value: 'heavy', label: 'Pesada (muitas opções)' },
                        ]} />
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Distância do fluxo" value={input.distanceFromFlow}
                            onChange={v => updateInput('distanceFromFlow', v)} min={0} max={200} unit="m" />
                        <SelectField label="Visibilidade" value={input.visibility}
                            onChange={v => updateInput('visibility', v as ForecastInput['visibility'])}
                            options={[
                                { value: 'high', label: 'Alta (bem visível)' },
                                { value: 'medium', label: 'Média' },
                                { value: 'low', label: 'Baixa (escondido)' },
                            ]} />
                    </div>
                </Section>

                {/* Section D — Hardware */}
                <Section title="Hardware" icon={Zap} defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Nº de Totens" value={input.numberOfTotems}
                            onChange={v => updateInput('numberOfTotems', v)} min={1} max={20} />
                        <NumberField label="Torneiras/Totem" value={input.tapsPerTotem}
                            onChange={v => updateInput('tapsPerTotem', v)} min={1} max={6} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <SelectField label="Barril" value={String(input.kegSizeLiters)}
                            onChange={v => updateInput('kegSizeLiters', Number(v) as 30 | 50)}
                            options={[{ value: '30', label: '30L' }, { value: '50', label: '50L' }]} />
                        <NumberField label="Temp. chegada barril" value={input.kegArrivalTemp}
                            onChange={v => updateInput('kegArrivalTemp', v)} min={0} max={35} unit="°C" />
                    </div>
                    <NumberField label="Capacidade de resfriamento" value={input.coolingCapacityLph}
                        onChange={v => updateInput('coolingCapacityLph', v)} min={20} max={500} unit="L/h"
                        hint="Glycol 20L nominal = 100 L/h" />
                </Section>

                {/* Action buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleCalculate}
                        disabled={isCalculating}
                        className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-amber-200 dark:shadow-none"
                    >
                        {isCalculating ? (
                            <><Loader2 className="h-5 w-5 animate-spin" /> Calculando...</>
                        ) : (
                            <><Beer className="h-5 w-5" /> Calcular Previsão</>
                        )}
                    </button>
                    {result && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Salvar
                        </button>
                    )}
                </div>
            </div>

            {/* Right: Results */}
            <div>
                {result ? (
                    <ResultsPanel result={result} />
                ) : (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center min-h-[400px]">
                        <Beer className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                        <p className="text-gray-400 dark:text-gray-500 text-center">
                            Preencha os dados e clique em <strong className="text-amber-500">"Calcular Previsão"</strong><br />
                            para ver os resultados aqui.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
