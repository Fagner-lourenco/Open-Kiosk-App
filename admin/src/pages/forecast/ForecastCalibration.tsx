/**
 * ============================================================================
 * ForecastCalibration — Dashboard de status dos parâmetros do modelo
 * ============================================================================
 */

import {
    CheckCircle, AlertCircle, Database, BookOpen, Beaker,
} from 'lucide-react';

// Priors from the datasets — inline to avoid cross-workspace import
const MODEL_PARAMS = [
    {
        name: 'β_temp (Clima)',
        value: '+3.13%/°C',
        raw: 0.7949,
        status: 'dataset' as const,
        source: 'Beer Consumption SP (n=365, R²=0.33)',
        description: 'Aumento percentual de consumo por +1°C de temperatura máxima',
    },
    {
        name: 'Weekend Boost',
        value: '+20.5%',
        raw: 0.2052,
        status: 'dataset' as const,
        source: 'Beer Consumption SP (n=365)',
        description: 'Aumento de consumo em dias de fim de semana vs dia útil',
    },
    {
        name: 'Rain Penalty',
        value: '-5.1%',
        raw: -0.0506,
        status: 'dataset' as const,
        source: 'Beer Consumption SP (n=365)',
        description: 'Redução de consumo em dias com precipitação',
    },
    {
        name: 'Peak Hour',
        value: '16:00–17:00',
        raw: 16,
        status: 'dataset' as const,
        source: 'Craft Beer Bar Sales (n=50,084)',
        description: 'Horas de pico de transações (34% do total)',
    },
    {
        name: 'C_frio_nom',
        value: '100 L/h',
        raw: 100,
        status: 'field_calibrated' as const,
        source: 'Hardware glycol 20L (confirmado pelo operador)',
        description: 'Capacidade nominal de resfriamento por totem',
    },
    {
        name: 'n_taps',
        value: '2 / totem',
        raw: 2,
        status: 'field_calibrated' as const,
        source: 'Configuração do totem (confirmado)',
        description: 'Número de torneiras por totem',
    },
    {
        name: 'T_glycol',
        value: '-3.5°C',
        raw: -3.5,
        status: 'field_calibrated' as const,
        source: 'Sensor na linha (confirmado)',
        description: 'Temperatura operacional do glycol',
    },
    {
        name: 'f_pay',
        value: '0.95',
        raw: 0.95,
        status: 'field_calibrated' as const,
        source: 'PIX + cartão integrado (fricção mínima)',
        description: 'Fator de conversão do pagamento (1 = sem fricção)',
    },
    {
        name: 'V_tap',
        value: '~50 mL/s',
        raw: 50,
        status: 'literature' as const,
        source: 'Draught Beer Quality Manual (Brewers Assoc.) — a confirmar com fluxômetro',
        description: 'Vazão por torneira (será calibrado na Fase 1 com dados reais)',
    },
    {
        name: 'r_per_capita',
        value: '0.5 L/h',
        raw: 0.5,
        status: 'literature' as const,
        source: 'Literatura acadêmica (média de consumo ativo)',
        description: 'Consumo médio por hora por bebedor ativo de chopp',
    },
];

const STATUS_CONFIG = {
    uncalibrated: {
        icon: AlertCircle,
        label: 'Não calibrado',
        color: 'text-gray-400',
        bg: 'bg-gray-100 dark:bg-gray-800',
    },
    literature: {
        icon: BookOpen,
        label: 'Literatura',
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    dataset: {
        icon: Database,
        label: 'Dataset',
        color: 'text-purple-600 dark:text-purple-400',
        bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
    field_calibrated: {
        icon: CheckCircle,
        label: 'Campo',
        color: 'text-green-600 dark:text-green-400',
        bg: 'bg-green-50 dark:bg-green-900/20',
    },
};

export function ForecastCalibration() {
    const statsByStatus = {
        field_calibrated: MODEL_PARAMS.filter(p => (p.status as string) === 'field_calibrated').length,
        dataset: MODEL_PARAMS.filter(p => (p.status as string) === 'dataset').length,
        literature: MODEL_PARAMS.filter(p => (p.status as string) === 'literature').length,
        uncalibrated: MODEL_PARAMS.filter(p => (p.status as string) === 'uncalibrated').length,
    };

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const count = statsByStatus[key as keyof typeof statsByStatus] || 0;
                    return (
                        <div key={key} className={`rounded-xl p-4 ${cfg.bg} border border-opacity-20`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className={`h-4 w-4 ${cfg.color}`} />
                                <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${cfg.color}`}>{count}</div>
                            <div className="text-xs text-gray-400 mt-0.5">parâmetro{count !== 1 ? 's' : ''}</div>
                        </div>
                    );
                })}
            </div>

            {/* Parameters table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Beaker className="h-4 w-4 text-amber-500" />
                        Parâmetros do Modelo v0.4.2-math-pure
                    </h3>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {MODEL_PARAMS.map((param) => {
                        const cfg = STATUS_CONFIG[param.status];
                        const Icon = cfg.icon;

                        return (
                            <div key={param.name} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">{param.name}</span>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.color}`}>
                                                <Icon className="h-3 w-3" />
                                                {cfg.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{param.description}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">📎 {param.source}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">
                                            {param.value}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Calibration info */}
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700/50">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>📈 Fase 2 (auto-calibração):</strong> Quando houver ≥10 previsões com resultado real,
                    o sistema recalculará automaticamente β_temp, weekend_boost e rain_penalty
                    usando os dados próprios do Open Kiosk + clima histórico (Open-Meteo Archive).
                </p>
            </div>
        </div>
    );
}
