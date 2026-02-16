/**
 * ============================================================================
 * FinanceOverviewTab — Dashboard Financeiro
 * ============================================================================
 *
 * KPIs, alertas, resumo de contas e fluxo de caixa.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  PieChart,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Loader2,
  Banknote,
} from 'lucide-react';
import { useFinAccounts } from '@/hooks/useFinAccounts';
import { useLedger } from '@/hooks/useLedger';
import { useInvoices } from '@/hooks/useInvoices';
import { useBills } from '@/hooks/useBills';
import { useParties } from '@/hooks/useParties';
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

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceOverviewTab({ franchiseId, storeId }: Props) {
  const { accounts, loadingAccounts, totalBalance } = useFinAccounts(franchiseId, storeId);
  const { entries, loadingEntries, totalIncome, totalExpenses, pendingEntries } = useLedger(franchiseId, storeId);
  const { invoices, loadingInvoices, totalReceivable, totalReceived, overdueInvoices } = useInvoices(franchiseId, storeId);
  const { bills, loadingBills, totalPayable, totalPaid, overdueBills } = useBills(franchiseId, storeId);
  const { activeParties } = useParties(franchiseId, storeId);

  const partyMap = useMemo(() => {
    const m = new Map<string, string>();
    activeParties.forEach((p) => { if (p.id) m.set(p.id, p.name); });
    return m;
  }, [activeParties]);

  const isLoading = loadingAccounts || loadingEntries || loadingInvoices || loadingBills;

  // ------ Computed data ------
  const netCashFlow = totalIncome - totalExpenses;
  const totalAlerts = overdueInvoices.length + overdueBills.length + pendingEntries.length;

  // Recent ledger entries (last 10)
  const recentEntries = useMemo(() => entries.slice(0, 10), [entries]);

  // Upcoming bills (next 7 days, not paid/canceled)
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

  // Overdue items sorted by how overdue
  const overdueItems = useMemo(() => {
    const items: { type: 'invoice' | 'bill'; id: string; party: string; amount: number; dueDate: Date }[] = [];
    overdueInvoices.forEach((inv) =>
      items.push({ type: 'invoice', id: inv.id || '', party: partyMap.get(inv.partyId) || 'N/A', amount: inv.remaining, dueDate: toDateSafe(inv.dueDate) }),
    );
    overdueBills.forEach((b) =>
      items.push({ type: 'bill', id: b.id || '', party: partyMap.get(b.partyId) || 'N/A', amount: b.remaining, dueDate: toDateSafe(b.dueDate) }),
    );
    items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return items.slice(0, 10);
  }, [overdueInvoices, overdueBills, partyMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2"><Wallet className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalBalance)}</p>
                <p className="text-xs text-muted-foreground">Saldo em Contas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2"><TrendingUp className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalIncome)}</p>
                <p className="text-xs text-muted-foreground">Receitas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2"><TrendingDown className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">Despesas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${netCashFlow >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <DollarSign className={`h-5 w-5 ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(netCashFlow)}
                </p>
                <p className="text-xs text-muted-foreground">Fluxo Líquido</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2"><ArrowDownCircle className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalReceivable)}</p>
                <p className="text-xs text-muted-foreground">A Receber</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2"><ArrowUpCircle className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalPayable)}</p>
                <p className="text-xs text-muted-foreground">A Pagar</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-100 p-2"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
              <div>
                <p className="text-2xl font-bold">{totalAlerts}</p>
                <p className="text-xs text-muted-foreground">Alertas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2"><Banknote className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-2xl font-bold">{accounts.length}</p>
                <p className="text-xs text-muted-foreground">Contas Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom grid: 3 panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overdue alerts */}
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
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item vencido!</p>
            ) : (
              <div className="space-y-2">
                {overdueItems.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.type === 'invoice' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {item.type === 'invoice' ? 'REC' : 'PAG'}
                      </span>
                      <span className="truncate max-w-[100px]">{item.party}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-red-600">{formatCurrency(item.amount)}</p>
                      <p className="text-[10px] text-muted-foreground">{item.dueDate.toLocaleDateString('pt-BR')}</p>
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
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento próximo.</p>
            ) : (
              <div className="space-y-2">
                {upcomingBills.map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div>
                      <p className="font-medium truncate max-w-[140px]">{partyMap.get(bill.partyId) || 'N/A'}</p>
                      <p className="text-[10px] text-muted-foreground">{toDateSafe(bill.dueDate).toLocaleDateString('pt-BR')}</p>
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
            <CardDescription>Lançamentos recentes no livro caixa</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum lançamento.</p>
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div>
                      <p className="font-medium truncate max-w-[140px]">{entry.description}</p>
                      <p className="text-[10px] text-muted-foreground">{toDateSafe(entry.competenceDate).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <p className={`font-medium ${entry.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.direction === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
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
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(totalReceived / (totalReceivable + totalReceived)) * 100}%` }}
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
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(totalPaid / (totalPayable + totalPaid)) * 100}%` }}
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
