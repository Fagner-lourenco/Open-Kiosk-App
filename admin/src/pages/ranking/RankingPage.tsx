/**
 * ============================================================================
 * RankingPage — Central de Ranking, TV, Desafios & Prêmios (Admin)
 * ============================================================================
 * Rota: /ranking
 */

import { useState, useMemo } from 'react';
import {
  Trophy,
  Store,
  Calendar,
  Beer,
  DollarSign,
  ShoppingCart,
  Check,
  Radio,
  Crown,
  Medal,
  Droplets,
  Tv,
  Zap,
  Gift,
  Copy,
  ExternalLink,
  Users,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { useFranchise } from '@/context/FranchiseContext';
import { useCustomerRanking, formatDateYMD } from '@/hooks/useCustomerRanking';
import { useCopyClipboard } from '@/hooks/useCopyClipboard';
import { NoFranchiseSelected } from '@/components/common/NoFranchiseSelected';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RankingFilters } from '@/types/ranking';
import { RANKING_METRICS } from '@/types/ranking';
import { formatVolume } from '@/utils/formatVolume';

import { TvConfigTab, ChallengesTab, PrizesTab } from '@/pages/ranking/EventConfigPage';
import { DynamicPricingTab } from '@/pages/ranking/DynamicPricingTab';

// ============================================================================
// CONSTANTES
// ============================================================================

const MEDAL_STYLES = [
  {
    bg: 'bg-gradient-to-r from-yellow-400 to-amber-500',
    border: 'border-yellow-400/60',
    text: 'text-yellow-900',
    ring: 'ring-yellow-400/20',
    icon: Crown,
    label: '1º',
    badgeBg: 'bg-yellow-400',
  },
  {
    bg: 'bg-gradient-to-r from-slate-300 to-slate-400',
    border: 'border-slate-300/60',
    text: 'text-slate-800',
    ring: 'ring-slate-300/20',
    icon: Medal,
    label: '2º',
    badgeBg: 'bg-slate-300',
  },
  {
    bg: 'bg-gradient-to-r from-amber-600 to-amber-700',
    border: 'border-amber-600/60',
    text: 'text-amber-100',
    ring: 'ring-amber-600/20',
    icon: Medal,
    label: '3º',
    badgeBg: 'bg-amber-600',
  },
] as const;

const METRIC_CONFIG = {
  totalMl: { label: 'Volume', icon: Droplets, color: 'text-blue-600' },
  totalSpent: { label: 'Total Gasto', icon: DollarSign, color: 'text-green-600' },
  orderCount: { label: 'Nº Pedidos', icon: ShoppingCart, color: 'text-purple-600' },
} as const;

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function RankingPage() {
  const { currentFranchise, stores } = useFranchise();

  const [selectedStore, setSelectedStore] = useState<string>('');
  const storeId = selectedStore || stores[0]?.id || '';
  const storeName = stores.find((s) => s.id === storeId)?.name || storeId;

  const today = formatDateYMD(new Date());
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [metric, setMetric] = useState<RankingFilters['metric']>('totalMl');
  const [limit, setLimit] = useState(10);

  const filters: RankingFilters = useMemo(
    () => ({ storeId, dateFrom, dateTo, metric, limit }),
    [storeId, dateFrom, dateTo, metric, limit]
  );

  const { ranking, isLoading, error, isRealTime, totalOrders, lastUpdated } =
    useCustomerRanking(currentFranchise?.id, filters);

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  const tvUrl = useMemo(() => {
    if (!storeId || !currentFranchise) return '';
    return `${window.location.origin}/ranking/display/${storeId}?franchise=${currentFranchise.id}`;
  }, [storeId, currentFranchise]);

  const { isCopied, copyToClipboard } = useCopyClipboard();

  const fmtVal = (value: number, m: RankingFilters['metric']) => {
    if (m === 'totalMl') return formatVolume(value);
    if (m === 'totalSpent') return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (m === 'orderCount') return `${value} pedido${value !== 1 ? 's' : ''}`;
    return String(value);
  };

  if (!currentFranchise) {
    return <NoFranchiseSelected description="Selecione uma franquia no menu lateral para ver o ranking" />;
  }

  const dateInputCls = 'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Ranking"
        description={storeName}
        actions={
          <div className="flex items-center gap-2">
            {isRealTime && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200 animate-pulse dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                <Radio className="h-3 w-3" />
                AO VIVO
              </span>
            )}
            {tvUrl && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyToClipboard(tvUrl)}>
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {isCopied ? 'Copiado!' : 'Link TV'}
              </Button>
            )}
            {tvUrl && (
              <Button variant="default" size="sm" className="gap-1.5" asChild>
                <a href={tvUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir Telão
                </a>
              </Button>
            )}
          </div>
        }
      />

      {/* ── Toolbar: Loja ── */}
      <Card className="border-dashed">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-1">
              <Store className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={storeId} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-full sm:w-[220px] h-9">
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs defaultValue="ranking" className="space-y-5">
        <TabsList className="h-auto p-1 bg-muted/50 border">
          <TabsTrigger value="ranking" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Trophy className="h-4 w-4" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="tv" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Tv className="h-4 w-4" />
            TV & Metas
          </TabsTrigger>
          <TabsTrigger value="challenges" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Zap className="h-4 w-4" />
            Desafios
          </TabsTrigger>
          <TabsTrigger value="prizes" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Gift className="h-4 w-4" />
            Prêmios
          </TabsTrigger>
          <TabsTrigger value="dynamic-pricing" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <TrendingUp className="h-4 w-4" />
            Preço Dinâmico
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab: Ranking ─── */}
        <TabsContent value="ranking" className="space-y-5">
          {/* Filtros em card */}
          <Card>
            <CardContent className="p-4">
              {/* Título dinâmico resumindo filtros ativos */}
              <p className="text-xs text-muted-foreground mb-3">
                Ranking por <strong>{METRIC_CONFIG[metric].label}</strong> —{' '}
                <strong>{dateFrom === dateTo ? dateFrom : `${dateFrom} a ${dateTo}`}</strong> —{' '}
                Top {limit}
              </p>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                {/* Período */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span title="Período do ranking"><Calendar className="h-4 w-4 text-muted-foreground shrink-0" /></span>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo} className={dateInputCls} title="Data inicial" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom} max={today} className={dateInputCls} title="Data final" />
                </div>

                <div className="hidden lg:block h-6 w-px bg-border" />

                {/* Métrica */}
                <div className="flex items-center gap-2">
                  <span title="Métrica de ordenação"><Beer className="h-4 w-4 text-muted-foreground shrink-0" /></span>
                  <Select value={metric} onValueChange={(v) => setMetric(v as RankingFilters['metric'])}>
                    <SelectTrigger className="w-[155px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RANKING_METRICS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Top N */}
                <div className="flex items-center gap-2">
                  <span title="Nº de posições exibidas"><TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" /></span>
                  <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                    <SelectTrigger className="w-[110px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Top 5</SelectItem>
                      <SelectItem value="10">Top 10</SelectItem>
                      <SelectItem value="20">Top 20</SelectItem>
                      <SelectItem value="50">Top 50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Mini-stats inline */}
                <div className="flex items-center gap-2 lg:ml-auto text-xs">
                  <span className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-muted-foreground" title="Clientes no ranking">
                    <Users className="h-3 w-3" />
                    {ranking.length}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-muted-foreground" title="Total de pedidos no período">
                    <ShoppingCart className="h-3 w-3" />
                    {totalOrders}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-muted-foreground" title="Última atualização">
                    <Clock className="h-3 w-3" />
                    {lastUpdated ? lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ranking Content */}
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-destructive text-center">{error}</p>
              </CardContent>
            </Card>
          ) : ranking.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Nenhum cliente no ranking</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Não há pedidos com dados de cliente para a loja <strong>{storeName}</strong> no período selecionado.
                  Ajuste as datas ou aguarde novos pedidos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {/* Top 3 */}
              <div className="grid gap-4 sm:grid-cols-3">
                {top3.map((entry, idx) => {
                  const style = MEDAL_STYLES[idx];
                  const Icon = style.icon;
                  const metricCfg = METRIC_CONFIG[metric];
                  const MetricIcon = metricCfg.icon;

                  return (
                    <Card key={entry.customerName + idx} className={`relative overflow-hidden border ${style.border} ring-2 ${style.ring}`}>
                      {/* Badge */}
                      <div className={`absolute top-3 right-3 ${style.bg} ${style.text} w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-sm`}>
                        {idx + 1}
                      </div>

                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-slate-400' : 'text-amber-600'}`} />
                          <CardTitle className="text-base truncate pr-10">{entry.customerName}</CardTitle>
                        </div>
                        <CardDescription className="flex items-center gap-1 mt-0.5">
                          <MetricIcon className={`h-3.5 w-3.5 ${metricCfg.color}`} />
                          <span className="font-semibold text-foreground">{fmtVal(entry[metric], metric)}</span>
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="pt-0 pb-4">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{entry.orderCount} pedidos</span>
                          <span className="truncate">{entry.favoriteDrink}</span>
                          <span>R$ {entry.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <span>Ticket: R$ {entry.orderCount > 0 ? (entry.totalSpent / entry.orderCount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Tabela 4º+ */}
              {rest.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {top3.length + 1}º — {ranking.length}º lugar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="overflow-x-auto -mx-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="pb-2 pl-6 pr-3 text-left font-medium text-muted-foreground w-12">#</th>
                            <th className="pb-2 pr-3 text-left font-medium text-muted-foreground">Cliente</th>
                            <th className="pb-2 pr-3 text-right font-medium text-muted-foreground">{METRIC_CONFIG[metric].label}</th>
                            <th className="pb-2 pr-3 text-right font-medium text-muted-foreground">Pedidos</th>
                            <th className="pb-2 pr-6 text-left font-medium text-muted-foreground hidden md:table-cell">Favorita</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rest.map((entry) => (
                            <tr key={entry.customerName + entry.position} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                              <td className="py-2.5 pl-6 pr-3 text-muted-foreground tabular-nums">{entry.position}º</td>
                              <td className="py-2.5 pr-3 font-medium">{entry.customerName}</td>
                              <td className="py-2.5 pr-3 text-right tabular-nums">{fmtVal(entry[metric], metric)}</td>
                              <td className="py-2.5 pr-3 text-right tabular-nums">{entry.orderCount}</td>
                              <td className="py-2.5 pr-6 text-muted-foreground truncate max-w-[200px] hidden md:table-cell">{entry.favoriteDrink}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab: TV & Metas ─── */}
        <TabsContent value="tv">
          {storeId && currentFranchise ? (
            <TvConfigTab franchiseId={currentFranchise.id} storeId={storeId} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Tv className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Selecione uma loja para configurar o telão.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab: Desafios ─── */}
        <TabsContent value="challenges">
          {storeId && currentFranchise ? (
            <ChallengesTab franchiseId={currentFranchise.id} storeId={storeId} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Selecione uma loja para gerenciar desafios.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab: Prêmios ─── */}
        <TabsContent value="prizes">
          {storeId && currentFranchise ? (
            <PrizesTab franchiseId={currentFranchise.id} storeId={storeId} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Gift className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Selecione uma loja para gerenciar prêmios.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab: Preço Dinâmico ─── */}
        <TabsContent value="dynamic-pricing">
          {storeId && currentFranchise ? (
            <DynamicPricingTab franchiseId={currentFranchise.id} storeId={storeId} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Selecione uma loja para configurar preço dinâmico.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
