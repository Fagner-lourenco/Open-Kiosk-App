/**
 * ============================================================================
 * FinancePaymentsTab — Baixas / Pagamentos (AR/AP → Ledger)
 * ============================================================================
 *
 * CRUD de pagamentos vinculados a faturas, contas ou lançamentos avulsos.
 * Consome useFinPayments + useFinAccounts.
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
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Search,
  Trash2,
  Loader2,
  DollarSign,
  Wallet,
} from 'lucide-react';
import {
  useFinPayments,
  type CreateFinPaymentInput,
} from '@/hooks/useFinPayments';
import { useFinAccounts } from '@/hooks/useFinAccounts';
import { useAuth } from '@/context/AuthContext';
import type {
  FinPayment,
  FinPaymentDirection,
  FinPaymentTargetType,
  PaymentMethod,
} from '@/types/finance';
import { Timestamp } from 'firebase/firestore';
import { roundCurrency } from '@/utils/currency';

// ============================================================================
// CONSTANTS
// ============================================================================

const DIRECTION_LABELS: Record<FinPaymentDirection, string> = {
  in: 'Entrada',
  out: 'Saída',
};

const DIRECTION_COLORS: Record<FinPaymentDirection, string> = {
  in: 'bg-green-100 text-green-700',
  out: 'bg-red-100 text-red-600',
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  card: 'Cartão',
  cash: 'Dinheiro',
  transfer: 'Transferência',
};

const TARGET_LABELS: Record<FinPaymentTargetType, string> = {
  invoice: 'Fatura',
  bill: 'Conta',
  ledger: 'Avulso',
};

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

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(ts: Timestamp | undefined | null): string {
  const d = toDateSafe(ts);
  return d.toLocaleDateString('pt-BR');
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// PAYMENT DIALOG
// ============================================================================

function PaymentDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateFinPaymentInput) => Promise<unknown>;
  isPending: boolean;
  accounts: { id?: string; name: string }[];
}) {
  const [direction, setDirection] = useState<FinPaymentDirection>('out');
  const [date, setDate] = useState(dateStr(new Date()));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [accountId, setAccountId] = useState('');
  const [targetType, setTargetType] = useState<FinPaymentTargetType>('ledger');
  const [targetId, setTargetId] = useState('');
  const [notes, setNotes] = useState('');
  const { user } = useAuth();

  const reset = () => {
    setDirection('out');
    setDate(dateStr(new Date()));
    setAmount('');
    setMethod('pix');
    setAccountId('');
    setTargetType('ledger');
    setTargetId('');
    setNotes('');
  };

  const canSubmit =
    !!date && Number(amount) > 0 && !!accountId;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      direction,
      date: new Date(date),
      amount: roundCurrency(Number(amount)),
      method,
      accountId,
      targetType,
      targetId: targetId || '',
      notes: notes || undefined,
      createdBy: user?.uid || '',
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Pagamento</DialogTitle>
          <DialogDescription>Registre uma entrada ou saída financeira.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Direction */}
          <div className="space-y-2">
            <Label>Direção *</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as FinPaymentDirection)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Entrada (recebimento)</SelectItem>
                <SelectItem value="out">Saída (pagamento)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date + Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Method + Account */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Método *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conta *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id).map((a) => (
                    <SelectItem key={a.id} value={a.id as string}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Target type + ID */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vínculo</Label>
              <Select value={targetType} onValueChange={(v) => setTargetType(v as FinPaymentTargetType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TARGET_LABELS) as FinPaymentTargetType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TARGET_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID do Vínculo</Label>
              <Input
                placeholder="(opcional)"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Input
              placeholder="Nota opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !canSubmit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinancePaymentsTab({ franchiseId, storeId }: Props) {
  const {
    payments,
    loadingPayments,
    totalIn,
    totalOut,
    createPayment,
    isCreatingPayment,
    deletePayment,
    isDeletingPayment,
  } = useFinPayments(franchiseId, storeId);

  const { accounts } = useFinAccounts(franchiseId, storeId);

  const [search, setSearch] = useState('');
  const [filterDirection, setFilterDirection] = useState<'all' | FinPaymentDirection>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinPayment | null>(null);

  // ── Account name lookup ──────────────────────────────────────────────

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => { if (a.id) map.set(a.id, a.name); });
    return map;
  }, [accounts]);

  // ── Filtered list ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = payments;
    if (filterDirection !== 'all') {
      list = list.filter((p) => p.direction === filterDirection);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.notes || '').toLowerCase().includes(q) ||
          METHOD_LABELS[p.method].toLowerCase().includes(q) ||
          TARGET_LABELS[p.targetType].toLowerCase().includes(q) ||
          (accountMap.get(p.accountId) || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [payments, filterDirection, search, accountMap]);

  // ── Net balance ─────────────────────────────────────────────────────

  const net = roundCurrency(totalIn - totalOut);

  // ── Delete handler ──────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await deletePayment(deleteTarget.id);
    setDeleteTarget(null);
  };

  // ── Loading state ───────────────────────────────────────────────────

  if (loadingPayments) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entradas</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalIn)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saídas</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalOut)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Líquido</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(net)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pagamentos</CardTitle>
              <CardDescription>
                {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Pagamento
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nota, método, vínculo, conta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={filterDirection}
              onValueChange={(v) => setFilterDirection(v as 'all' | FinPaymentDirection)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="in">Entradas</SelectItem>
                <SelectItem value="out">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <DollarSign className="mb-2 h-10 w-10" />
              <p>Nenhum pagamento encontrado</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Direção</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DIRECTION_COLORS[payment.direction]}`}
                        >
                          {DIRECTION_LABELS[payment.direction]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{METHOD_LABELS[payment.method]}</TableCell>
                      <TableCell>
                        {accountMap.get(payment.accountId) || payment.accountId}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {TARGET_LABELS[payment.targetType]}
                        </span>
                        {payment.targetId && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({payment.targetId.slice(0, 8)}…)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {payment.notes || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir pagamento"
                          onClick={() => setDeleteTarget(payment)}
                          disabled={isDeletingPayment}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ──────────────────────────────────────────────── */}
      <PaymentDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={createPayment}
        isPending={isCreatingPayment}
        accounts={accounts}
      />

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O pagamento de{' '}
              <strong>{deleteTarget ? formatCurrency(deleteTarget.amount) : ''}</strong>{' '}
              ({deleteTarget ? DIRECTION_LABELS[deleteTarget.direction] : ''}) será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
