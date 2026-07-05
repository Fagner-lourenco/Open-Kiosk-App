/**
 * ============================================================================
 * FinanceOverviewTab — Dashboard Financeiro (Rich)
 * ============================================================================
 *
 * KPIs com StatCard, DateRangePicker, gráficos Recharts
 * (Receita vs Despesa diária + Fluxo acumulado),
 * painéis de vencidos, próximos pagamentos, últimos lançamentos,
 * resumo recebíveis/pagáveis.
 *
 * Usa EmptyState e FinanceDashboardSkeleton para UX consistente.
 *
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Banknote,
  PieChart,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import type { DateRange } from 'react-day-picker';
import { Timestamp } from 'firebase/firestore';
import { StatCard } from '@/components/ui/stat-card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/common/EmptyState';
import { FinanceDashboardSkeleton } from './FinanceDashboardSkeleton';
import { useFinAccounts, computeAccountBalances } from '@/hooks/useFinAccounts';
import { useLedger } from '@/hooks/useLedger';
import { useInvoices } from '@/hooks/useInvoices';
import { useBills } from '@/hooks/useBills';
import { useParties } from '@/hooks/useParties';
import { CHART_COLORS } from '@/constants/chart-colors';

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toDateSafe(ts: Timestamp | undefined | null): Date {
  if (!ts) return new Date();
  return ts instanceof Timestamp ? ts.toDate() : new Date();
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function isInRange(date: Date, from: Date | undefined, to: Date | undefined): boolean {
  if (!from) return true;
  const d = date.getTime();
  const start = new Date(from).setHours(0, 0, 0, 0);
  const end = to ? new Date(to).setHours(23, 59, 59, 999) : start + 86_400_000 - 1;
  return d >= start && d <= end;
}

// ============================================================================
// TYPES
// ============================================================================

interface DailyData {
  day: string;
  date: Date;
  income: number;
  expenses: number;
}

interface CumulativeData {
  day: string;
  balance: number;
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// DEFAULT RANGE: current month
// ============================================================================

function defaultRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

// ============================================================================
// CUSTOM TOOLTIP
// ============================================================================

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CurrTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-sm" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceOverviewTab({ franchiseId, storeId }: Props) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);

  const { accounts, loadingAccounts } = useFinAccounts(franchiseId, storeId);
  const { entries, loadingEntries, pendingEntries } = useLedger(franchiseId, storeId);

  // Saldo real: openingBalance + movimento efetivado do ledger (in/out paid/reconciled)
  const { totalBalance } = useMemo(
    () => computeAccountBalances(accounts, entries),
    [accounts, entries],
  );
  const { invoices, loadingInvoices, totalReceivable, totalReceived, overdueInvoices } = useInvoices(franchiseId, storeId);
  const { bills, loadingBills, totalPayable, totalPaid, overdueBills } = useBills(franchiseId, storeId);
  const { activeParties } = useParties(franchiseId, storeId);

  const partyMap = useMemo(() => {
    const m = new Map<string, string>();
    activeParties.forEach((p) => {
      if (p.id) m.set(p.id, p.name);
    });
    return m;
  }, [activeParties]);

  const isLoading = loadingAccounts || loadingEntries || loadingInvoices || loadingBills;

  // ── Filtered entries by date range ────────────────────────────────────
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const d = toDateSafe(e.competenceDate);
      return isInRange(d, dateRange?.from, dateRange?.to);
    });
  }, [entries, dateRange]);

  // ── Computed KPIs (within range) ──────────────────────────────────────
  const rangeIncome = useMemo(
    () =>
      filteredEntries
        .filter((e) => e.direction === 'in' && e.status !== 'canceled')
        .reduce((s, e) => s + e.amount, 0),
    [filteredEntries],
  );
  const rangeExpenses = useMemo(
    () =>
      filteredEntries
        .filter((e) => e.direction === 'out' && e.status !== 'canceled')
        .reduce((s, e) => s + e.amount, 0),
    [filteredEntries],
  );
  const netCashFlow = rangeIncome - rangeExpenses;
  const grossMargin = rangeIncome > 0 ? ((rangeIncome - rangeExpenses) / rangeIncome) * 100 : 0;

  const totalAlerts = overdueInvoices.length + overdueBills.length + pendingEntries.length;

  // ── Daily chart data ──────────────────────────────────────────────────
  const dailyData = useMemo<DailyData[]>(() => {
    const map = new Map<string, DailyData>();

    filteredEntries
      .filter((e) => e.status !== 'canceled')
      .forEach((e) => {
        const d = toDateSafe(e.competenceDate);
        const key = formatDay(d);
        let item = map.get(key);
        if (!item) {
          item = { day: key, date: d, income: 0, expenses: 0 };
          map.set(key, item);
        }
        if (e.direction === 'in') item.income += e.amount;
        else item.expenses += e.amount;
      });

    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredEntries]);

  // ── Cumulative flow data ──────────────────────────────────────────────
  const cumulativeData = useMemo<CumulativeData[]>(() => {
    let running = 0;
    return dailyData.map((d) => {
      running += d.income - d.expenses;
      return { day: d.day, balance: Math.round(running * 100) / 100 };
    });
  }, [dailyData]);

  // ── Recent ledger (within range, max 10) ──────────────────────────────
  const recentEntries = useMemo(() => filteredEntries.slice(0, 10), [filteredEntries]);

  // ── Upcoming bills (next 7 days, not paid/canceled) ───────────────────
  const upcomingBills = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return bills
      .filter((b) => {
        if (['paid', 'canceled'].includes(b.status)) return false;
        const due = toDateSafe(b.dueDate);
        return due >= now && due <= in7;
      })
      .slice(0, 5);
  }, [bills]);

  // ── Overdue items ─────────────────────────────────────────────────────
  const overdueItems = useMemo(() => {
    const items: { type: 'invoice' | 'bill'; id: string; party: string; amount: number; dueDate: Date }[] = [];
    overdueInvoices.forEach((inv) =>
      items.push({
        type: 'invoice',
        id: inv.id || '',
        party: partyMap.get(inv.partyId) || 'N/A',
        amount: inv.remaining,
        dueDate: toDateSafe(inv.dueDate),
      }),
    );
    overdueBills.forEach((b) =>
      items.push({
        type: 'bill',
        id: b.id || '',
        party: partyMap.get(b.partyId) || 'N/A',
        amount: b.remaining,
        dueDate: toDateSafe(b.dueDate),
      }),
    );
    items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return items.slice(0, 10);
  }, [overdueInvoices, overdueBills, partyMap]);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (isLoading) {
    return <FinanceDashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header + DateRangePicker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Dashboard Financeiro</h2>
          <p className="text-sm text-muted-foreground">Visão geral das finanças da loja</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Saldo em Contas"
          value={formatCurrency(totalBalance)}
          icon={Wallet}
          color="blue"
        />
        <StatCard
          title="Receitas"
          value={formatCurrency(rangeIncome)}
          icon={TrendingUp}
          color="green"
          trend={
            rangeIncome > 0
              ? {
                  value: Math.round(grossMargin * 10) / 10,
                  direction: grossMargin >= 0 ? 'up' : 'down',
                  label: `margem ${grossMargin.toFixed(1)}%`,
                }
              : undefined
          }
        />
        <StatCard
          title="Despesas (COGS)"
          value={formatCurrency(rangeExpenses)}
          icon={TrendingDown}
          color="red"
        />
        <StatCard
          title="Fluxo Líquido"
          value={formatCurrency(netCashFlow)}
          icon={DollarSign}
          color={netCashFlow >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expenses Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receita vs Despesa</CardTitle>
            <CardDescription>Comparativo diário no período selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyData.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Sem lançamentos no período"
                description="Não há dados para exibir no intervalo selecionado."
                className="py-8"
              />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)}
                    className="text-muted-foreground"
                  />
                  <RechartsTooltip content={<CurrTooltip />} />
                  <Bar dataKey="income" name="Receita" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Despesa" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cumulative Flow Area Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fluxo Acumulado</CardTitle>
            <CardDescription>Saldo acumulado (receita − despesa) ao longo do período</CardDescription>
          </CardHeader>
          <CardContent>
            {cumulativeData.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Sem dados acumulados"
                description="Não há lançamentos para calcular o fluxo no período."
                className="py-8"
              />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={cumulativeData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v}`)}
                    className="text-muted-foreground"
                  />
                  <RechartsTooltip content={<CurrTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Saldo"
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="A Receber" value={formatCurrency(totalReceivable)} icon={ArrowDownCircle} color="green" />
        <StatCard title="A Pagar" value={formatCurrency(totalPayable)} icon={ArrowUpCircle} color="yellow" />
        <StatCard
          title="Alertas"
          value={totalAlerts}
          icon={AlertTriangle}
          color={totalAlerts > 0 ? 'red' : 'default'}
        />
        <StatCard title="Contas Ativas" value={accounts.length} icon={Banknote} color="purple" />
      </div>

      {/* Bottom 3 panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overdue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Itens Vencidos
            </CardTitle>
            <CardDescription>Faturas e contas a pagar vencidas</CardDescription>
          </CardHeader>
          <CardContent>
            {overdueItems.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="Nenhum item vencido!" className="py-6" />
            ) : (
              <div className="space-y-2">
                {overdueItems.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center justify-between rounded-lg border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          item.type === 'invoice' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {item.type === 'invoice' ? 'REC' : 'PAG'}
                      </span>
                      <span className="truncate max-w-[100px]">{item.party}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-red-600">{formatCurrency(item.amount)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.dueDate.toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming bills */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpCircle className="h-4 w-4 text-orange-500" />
              Próximos Pagamentos
            </CardTitle>
            <CardDescription>Contas a pagar nos próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingBills.length === 0 ? (
              <EmptyState icon={ArrowUpCircle} title="Nenhum pagamento próximo" className="py-6" />
            ) : (
              <div className="space-y-2">
                {upcomingBills.map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div>
                      <p className="font-medium truncate max-w-[140px]">
                        {partyMap.get(bill.partyId) || 'N/A'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {toDateSafe(bill.dueDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <p className="font-medium">{formatCurrency(bill.remaining)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent ledger */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="h-4 w-4 text-blue-500" />
              Últimos Lançamentos
            </CardTitle>
            <CardDescription>Lançamentos recentes no período</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <EmptyState
                icon={PieChart}
                title="Nenhum lançamento"
                description="Sem dados no período selecionado."
                className="py-6"
              />
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div>
                      <p className="font-medium truncate max-w-[140px]">{entry.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {toDateSafe(entry.competenceDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <p
                      className={`font-medium ${entry.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {entry.direction === 'in' ? '+' : '-'}
                      {formatCurrency(entry.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receivable vs Payable summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo Recebíveis</CardTitle>
            <CardDescription>{invoices.length} faturas emitidas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recebido</span>
                <span className="font-medium text-green-600">{formatCurrency(totalReceived)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">A Receber</span>
                <span className="font-medium text-blue-600">{formatCurrency(totalReceivable)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vencidas</span>
                <span className="font-medium text-red-600">{overdueInvoices.length} fatura(s)</span>
              </div>
              {totalReceivable + totalReceived > 0 && (
                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{
                      width: `${(totalReceived / (totalReceivable + totalReceived)) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo Pagáveis</CardTitle>
            <CardDescription>{bills.length} contas registradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pago</span>
                <span className="font-medium text-green-600">{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">A Pagar</span>
                <span className="font-medium text-orange-600">{formatCurrency(totalPayable)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vencidas</span>
                <span className="font-medium text-red-600">{overdueBills.length} conta(s)</span>
              </div>
              {totalPayable + totalPaid > 0 && (
                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{
                      width: `${(totalPaid / (totalPayable + totalPaid)) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
