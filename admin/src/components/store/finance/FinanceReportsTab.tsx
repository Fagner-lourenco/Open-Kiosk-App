/**
 * ============================================================================
 * FinanceReportsTab — Relatórios Financeiros
 * ============================================================================
 *
 * DRE simplificado, fluxo de caixa por período e margem.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  DollarSign,
  Loader2,
  BarChart3,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';
import { useLedger } from '@/hooks/useLedger';
import { useFinCategories } from '@/hooks/useFinCategories';
import { useFinAccounts } from '@/hooks/useFinAccounts';
import { Timestamp } from 'firebase/firestore';

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

function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

type ReportView = 'dre' | 'cashflow' | 'categories';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceReportsTab({ franchiseId, storeId }: Props) {
  const { entries, loadingEntries } = useLedger(franchiseId, storeId);
  const { categories, loadingCategories } = useFinCategories(franchiseId, storeId);
  const { loadingAccounts } = useFinAccounts(franchiseId, storeId);

  const [view, setView] = useState<ReportView>('dre');
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const isLoading = loadingEntries || loadingCategories || loadingAccounts;

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => { if (c.id) m.set(c.id, c.name); });
    return m;
  }, [categories]);

  // Filtered entries by period
  const filteredEntries = useMemo(() => {
    const start = periodStart + '-01';
    const endParts = periodEnd.split('-');
    const lastDay = new Date(parseInt(endParts[0]), parseInt(endParts[1]), 0).getDate();
    const end = `${periodEnd}-${lastDay}`;

    return entries.filter((e) => {
      const d = toDateSafe(e.competenceDate);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return ds >= start && ds <= end && e.status !== 'canceled';
    });
  }, [entries, periodStart, periodEnd]);

  // ------ DRE Data ------
  const dreData = useMemo(() => {
    const income = filteredEntries.filter((e) => e.direction === 'in');
    const expense = filteredEntries.filter((e) => e.direction === 'out');
    const totalIncome = income.reduce((s, e) => s + e.amount, 0);
    const totalExpense = expense.reduce((s, e) => s + e.amount, 0);
    const netResult = totalIncome - totalExpense;
    const margin = totalIncome > 0 ? (netResult / totalIncome) * 100 : 0;

    // Group by category
    const incomeByCat = new Map<string, number>();
    income.forEach((e) => {
      incomeByCat.set(e.categoryId, (incomeByCat.get(e.categoryId) || 0) + e.amount);
    });
    const expenseByCat = new Map<string, number>();
    expense.forEach((e) => {
      expenseByCat.set(e.categoryId, (expenseByCat.get(e.categoryId) || 0) + e.amount);
    });

    return { totalIncome, totalExpense, netResult, margin, incomeByCat, expenseByCat };
  }, [filteredEntries]);

  // ------ Cash Flow by Month ------
  const cashFlowData = useMemo(() => {
    const monthData = new Map<string, { income: number; expense: number }>();
    filteredEntries.forEach((e) => {
      const mk = getMonthKey(toDateSafe(e.competenceDate));
      const cur = monthData.get(mk) || { income: 0, expense: 0 };
      if (e.direction === 'in') cur.income += e.amount;
      else cur.expense += e.amount;
      monthData.set(mk, cur);
    });
    return Array.from(monthData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ month: k, ...v, net: v.income - v.expense }));
  }, [filteredEntries]);

  // ------ Category breakdown ------
  const categoryBreakdown = useMemo(() => {
    const data = new Map<string, { income: number; expense: number }>();
    filteredEntries.forEach((e) => {
      const cur = data.get(e.categoryId) || { income: 0, expense: 0 };
      if (e.direction === 'in') cur.income += e.amount;
      else cur.expense += e.amount;
      data.set(e.categoryId, cur);
    });
    return Array.from(data.entries())
      .map(([catId, v]) => ({ catId, name: categoryMap.get(catId) || catId, ...v, net: v.income - v.expense }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [filteredEntries, categoryMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Relatório</Label>
              <Select value={view} onValueChange={(v) => setView(v as ReportView)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dre">DRE Simplificado</SelectItem>
                  <SelectItem value="cashflow">Fluxo de Caixa Mensal</SelectItem>
                  <SelectItem value="categories">Análise por Categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="month" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <Input type="month" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredEntries.length} lançamento(s) no período
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DRE View */}
      {view === 'dre' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(dreData.totalIncome)}</p>
                    <p className="text-xs text-muted-foreground">Receita Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(dreData.totalExpense)}</p>
                    <p className="text-xs text-muted-foreground">Despesa Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DollarSign className={`h-5 w-5 ${dreData.netResult >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                  <div>
                    <p className={`text-xl font-bold ${dreData.netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(dreData.netResult)}
                    </p>
                    <p className="text-xs text-muted-foreground">Resultado Líquido</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className={`h-5 w-5 ${dreData.margin >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                  <div>
                    <p className={`text-xl font-bold ${dreData.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {dreData.margin.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Margem</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DRE Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">DRE — Demonstrativo de Resultados</CardTitle>
              <CardDescription>Resultado por categoria no período selecionado</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-green-50 font-medium">
                    <TableCell>RECEITAS</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(dreData.totalIncome)}</TableCell>
                  </TableRow>
                  {Array.from(dreData.incomeByCat.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([catId, amount]) => (
                      <TableRow key={`in-${catId}`}>
                        <TableCell className="pl-8 text-sm">{categoryMap.get(catId) || catId}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(amount)}</TableCell>
                      </TableRow>
                    ))}
                  <TableRow className="bg-red-50 font-medium">
                    <TableCell>DESPESAS</TableCell>
                    <TableCell className="text-right text-red-600">({formatCurrency(dreData.totalExpense)})</TableCell>
                  </TableRow>
                  {Array.from(dreData.expenseByCat.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([catId, amount]) => (
                      <TableRow key={`out-${catId}`}>
                        <TableCell className="pl-8 text-sm">{categoryMap.get(catId) || catId}</TableCell>
                        <TableCell className="text-right text-sm">({formatCurrency(amount)})</TableCell>
                      </TableRow>
                    ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>RESULTADO LÍQUIDO</TableCell>
                    <TableCell className={`text-right ${dreData.netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(dreData.netResult)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Cash Flow by month */}
      {view === 'cashflow' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Fluxo de Caixa Mensal
            </CardTitle>
            <CardDescription>Receitas vs Despesas por mês</CardDescription>
          </CardHeader>
          <CardContent>
            {cashFlowData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados para o período.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Receitas</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashFlowData.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{monthLabel(row.month)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(row.income)}</TableCell>
                        <TableCell className="text-right text-red-600">({formatCurrency(row.expense)})</TableCell>
                        <TableCell className={`text-right font-medium ${row.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(row.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(cashFlowData.reduce((s, r) => s + r.income, 0))}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ({formatCurrency(cashFlowData.reduce((s, r) => s + r.expense, 0))})
                      </TableCell>
                      <TableCell className={`text-right ${cashFlowData.reduce((s, r) => s + r.net, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(cashFlowData.reduce((s, r) => s + r.net, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                {/* Simple bar visualization */}
                <div className="mt-6 space-y-2">
                  {cashFlowData.map((row) => {
                    const max = Math.max(...cashFlowData.map((r) => Math.max(r.income, r.expense)));
                    return (
                      <div key={row.month} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{monthLabel(row.month)}</span>
                          <span className={row.net >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(row.net)}</span>
                        </div>
                        <div className="flex gap-1 h-4">
                          <div className="bg-green-400 rounded-sm" style={{ width: `${max > 0 ? (row.income / max) * 50 : 0}%` }} />
                          <div className="bg-red-400 rounded-sm" style={{ width: `${max > 0 ? (row.expense / max) * 50 : 0}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm" /> Receitas</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm" /> Despesas</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Category analysis */}
      {view === 'categories' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Análise por Categoria
            </CardTitle>
            <CardDescription>Receitas e despesas agrupadas por categoria</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados para o período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryBreakdown.map((row) => (
                    <TableRow key={row.catId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {row.income > 0 ? formatCurrency(row.income) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {row.expense > 0 ? `(${formatCurrency(row.expense)})` : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${row.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(row.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(categoryBreakdown.reduce((s, r) => s + r.income, 0))}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      ({formatCurrency(categoryBreakdown.reduce((s, r) => s + r.expense, 0))})
                    </TableCell>
                    <TableCell className={`text-right ${categoryBreakdown.reduce((s, r) => s + r.net, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(categoryBreakdown.reduce((s, r) => s + r.net, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
