/**
 * DemandForecastPage - main page for demand forecasting.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, History, Settings, SlidersHorizontal } from 'lucide-react';
import { useFranchise } from '@/context/FranchiseContext';
import { ForecastSimulator } from './ForecastSimulator';
import { ForecastHistory } from './ForecastHistory';
import { ForecastCalibration } from './ForecastCalibration';

const TABS = [
    { id: 'simulator', label: 'Simulador', icon: SlidersHorizontal },
    { id: 'history', label: 'Historico', icon: History },
    { id: 'calibration', label: 'Calibracao', icon: TrendingUp },
    { id: 'config', label: 'Configuracao', icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function DemandForecastPage() {
    const [activeTab, setActiveTab] = useState<TabId>('simulator');
    const { stores } = useFranchise();
    const [selectedStoreId, setSelectedStoreId] = useState('');

    useEffect(() => {
        if (stores.length === 0) {
            if (selectedStoreId) setSelectedStoreId('');
            return;
        }
        if (!selectedStoreId || !stores.some((store) => store.id === selectedStoreId)) {
            setSelectedStoreId(stores[0].id);
        }
    }, [stores, selectedStoreId]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="h-7 w-7 text-amber-500" />
                    Previsao de Demanda
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Estime a demanda de chopp para eventos e operacoes com base em clima, publico e hardware.
                </p>
            </div>

            <div className="max-w-sm">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Loja para simulacao e historico
                </label>
                <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                    {stores.length === 0 && <option value="">Nenhuma loja disponivel</option>}
                    {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                            {store.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                type="button"
                                className={`
                  flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-medium whitespace-nowrap
                  transition-colors duration-150
                  ${isActive
                                        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }
                `}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div>
                {activeTab === 'simulator' && <ForecastSimulator storeId={selectedStoreId || undefined} />}
                {activeTab === 'history' && <ForecastHistory storeId={selectedStoreId || undefined} />}
                {activeTab === 'calibration' && <ForecastCalibration />}
                {activeTab === 'config' && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Configuracao do Modelo</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Configuracoes avancadas e parametros do modelo serao disponibilizados na fase de auto-calibracao.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default DemandForecastPage;
