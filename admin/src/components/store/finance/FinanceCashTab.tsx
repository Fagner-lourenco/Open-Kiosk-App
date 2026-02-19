/**
 * ============================================================================
 * FinanceCashTab — Contas Bancárias + Extrato (Ledger)
 * ============================================================================
 *
 * Duas seções:
 *  1. Contas (FinAccount) — cards resumo + CRUD
 *  2. Extrato (LedgerEntry) — tabela + filtros + CRUD
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
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Wallet,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { useFinAccounts, type CreateFinAccountInput } from '@/hooks/useFinAccounts';
import {
  useLedger,
  type CreateLedgerEntryInput,
} from '@/hooks/useLedger';
import { useFinCategories } from '@/hooks/useFinCategories';
import { useParties } from '@/hooks/useParties';
import { useAuth } from '@/context/AuthContext';
import type {
  FinAccount,
  FinAccountType,
  LedgerEntry,
  LedgerDirection,
  LedgerStatus,
  PaymentMethod,
} from '@/types/finance';
import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  cash: 'Caixa',
  bank: 'Banco',
  pix: 'Pix',
  card_clearing: 'Maquininha',
};

const STATUS_LABELS: Record<LedgerStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  reconciled: 'Conciliado',
  canceled: 'Cancelado',
};

const STATUS_COLORS: Record<LedgerStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  reconciled: 'bg-blue-100 text-blue-700',
  canceled: 'bg-gray-100 text-gray-500',
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  card: 'Cartão',
  cash: 'Dinheiro',
  transfer: 'Transferência',
};

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
// ACCOUNT DIALOG
// ============================================================================

function AccountDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateFinAccountInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: FinAccount | null;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [type, setType] = useState<FinAccountType>(initialData?.type || 'bank');
  const [openingBalance, setOpeningBalance] = useState(
    initialData?.openingBalance?.toString() || '0',
  );

  const reset = () => { setName(''); setType('bank'); setOpeningBalance('0'); };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      type,
      openingBalance: parseFloat(openingBalance) || 0,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
          <DialogDescription>Conta bancária, caixa ou cartão.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Conta Bradesco" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as FinAccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// LEDGER ENTRY DIALOG
// ============================================================================

function LedgerDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  accounts,
  categories,
  parties,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateLedgerEntryInput) => Promise<unknown>;
  isPending: boolean;
  accounts: FinAccount[];
  categories: { id?: string; name: string; direction: string }[];
  parties: { id?: string; name: string }[];
  userId: string;
}) {
  const [direction, setDirection] = useState<LedgerDirection>('out');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [competenceDate, setCompetenceDate] = useState('');

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.direction === direction),
    [categories, direction],
  );

  const reset = () => {
    setDirection('out');
    setDescription('');
    setAmount('');
    setAccountId('');
    setCategoryId('');
    setPartyId('');
    setMethod('pix');
    setCompetenceDate('');
  };

  const handleSubmit = async () => {
    if (!description.trim() || !accountId || !categoryId || !competenceDate) return;
    await onSubmit({
      direction,
      description: description.trim(),
      amount: parseFloat(amount) || 0,
      accountId,
      categoryId,
      partyId: partyId || undefined,
      method,
      competenceDate: new Date(competenceDate),
      sourceType: 'manual',
      sourceId: `manual-${Date.now()}`,
      createdBy: userId,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Novo Lançamento</DialogTitle>
          <DialogDescription>Registre uma entrada ou saída.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={direction} onValueChange={(v) => { setDirection(v as LedgerDirection); setCategoryId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada</SelectItem>
                  <SelectItem value="out">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={competenceDate} onChange={(e) => setCompetenceDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Pagamento fornecedor X" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Método</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.filter((c) => c.id).map((c) => (
                    <SelectItem key={c.id} value={c.id as string}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Parte (opcional)</Label>
            <Select
              value={partyId || 'none'}
              onValueChange={(v) => setPartyId(v === 'none' ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {parties.filter((p) => p.id).map((p) => (
                  <SelectItem key={p.id} value={p.id as string}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || !accountId || !categoryId || !competenceDate || isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceCashTab({ franchiseId, storeId }: Props) {
  const {
    accounts,
    loadingAccounts,
    activeAccounts,
    createAccount,
    isCreatingAccount,
    updateAccount,
    isUpdatingAccount,
    deleteAccount,
    isDeletingAccount,
  } = useFinAccounts(franchiseId, storeId);

  const {
    entries,
    loadingEntries,
    totalIncome,
    totalExpenses,
    balance,
    pendingEntries,
    createEntry,
    isCreatingEntry,
    updateEntry,
    deleteEntry,
    isDeletingEntry,
  } = useLedger(franchiseId, storeId);

  const { activeCategories } = useFinCategories(franchiseId, storeId);
  const { activeParties } = useParties(franchiseId, storeId);
  const { user } = useAuth();

  // Build maps for display
  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => { if (a.id) m.set(a.id, a.name); });
    return m;
  }, [accounts]);

  // 🔧 FIX Audit-20260218: Calcular saldo corrente por conta (openingBalance + entradas - saídas)
  const accountBalances = useMemo(() => {
    const balances = new Map<string, number>();
    accounts.forEach((acc) => {
      balances.set(acc.id || '', acc.openingBalance || 0);
    });
    entries.forEach((e) => {
      const prev = balances.get(e.accountId) || 0;
      const amount = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0;
      if (e.direction === 'in') {
        balances.set(e.accountId, prev + amount);
      } else {
        balances.set(e.accountId, prev - amount);
      }
    });
    return balances;
  }, [accounts, entries]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    activeCategories.forEach((c) => { if (c.id) m.set(c.id, c.name); });
    return m;
  }, [activeCategories]);

  // State
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<FinAccount | null>(null);
  const [showLedgerDialog, setShowLedgerDialog] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<LedgerEntry | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dirFilter, setDirFilter] = useState<LedgerDirection | 'all'>('all');

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (dirFilter !== 'all') result = result.filter((e) => e.direction === dirFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((e) => e.description.toLowerCase().includes(term));
    }
    return result;
  }, [entries, dirFilter, searchTerm]);

  if (loadingAccounts || loadingEntries) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{activeAccounts.length}</p>
                <p className="text-xs text-muted-foreground">Contas Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalIncome)}</p>
                <p className="text-xs text-muted-foreground">Entradas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">Saídas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(balance)}</p>
                <p className="text-xs text-muted-foreground">Saldo</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Contas</CardTitle>
              <CardDescription>Contas bancárias, caixas e cartões</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAccountDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Conta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma conta cadastrada.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <Card key={acc.id} className="relative">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{acc.name}</p>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {ACCOUNT_TYPE_LABELS[acc.type]}
                        </Badge>
                        <p className="mt-2 text-xl font-bold">
                          {formatCurrency(accountBalances.get(acc.id || '') ?? acc.openingBalance)}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingAccount(acc)}>
                            <Edit className="h-4 w-4 mr-2" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingAccount(acc)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {acc.status === 'inactive' && (
                      <Badge variant="secondary" className="mt-2">Inativa</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ledger / Extrato */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Extrato</CardTitle>
              <CardDescription>
                Lançamentos financeiros ({entries.length} total
                {pendingEntries.length > 0 && ` · ${pendingEntries.length} pendentes`})
              </CardDescription>
            </div>
            <Button onClick={() => setShowLedgerDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Lançamento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar descrição..."
                className="pl-9"
              />
            </div>
            <Select value={dirFilter} onValueChange={(v) => setDirFilter(v as LedgerDirection | 'all')}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="in">Entradas</SelectItem>
                <SelectItem value="out">Saídas</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearchTerm(''); setDirFilter('all'); }}>
              Limpar Filtros
            </Button>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhum lançamento encontrado</p>
              <p className="text-sm">
                {entries.length === 0 ? 'Crie o primeiro lançamento.' : 'Ajuste os filtros.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">
                      {toDateSafe(entry.competenceDate).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">
                      {entry.description}
                    </TableCell>
                    <TableCell className="text-sm">
                      {accountMap.get(entry.accountId) || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {categoryMap.get(entry.categoryId) || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {METHOD_LABELS[entry.method]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.status]}`}>
                        {STATUS_LABELS[entry.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium text-sm ${entry.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                        {entry.direction === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {entry.status === 'pending' && (
                            <DropdownMenuItem
                              onClick={async () => {
                                if (!entry.id) return;
                                await updateEntry({ entryId: entry.id, status: 'paid' });
                              }}
                            >
                              Marcar como Pago
                            </DropdownMenuItem>
                          )}
                          {entry.status === 'paid' && (
                            <DropdownMenuItem
                              onClick={async () => {
                                if (!entry.id) return;
                                await updateEntry({ entryId: entry.id, status: 'reconciled' });
                              }}
                            >
                              Conciliar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingEntry(entry)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── DIALOGS ───────────────────────────────────────────────────── */}

      <AccountDialog
        open={showAccountDialog}
        onOpenChange={setShowAccountDialog}
        onSubmit={(data) => createAccount(data)}
        isPending={isCreatingAccount}
      />

      <AccountDialog
        open={!!editingAccount}
        onOpenChange={(v) => { if (!v) setEditingAccount(null); }}
        onSubmit={async (data) => {
          if (!editingAccount?.id) return;
          await updateAccount({ accountId: editingAccount.id, ...data });
          setEditingAccount(null);
        }}
        isPending={isUpdatingAccount}
        initialData={editingAccount}
      />

      <AlertDialog open={!!deletingAccount} onOpenChange={(v) => { if (!v) setDeletingAccount(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingAccount?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingAccount?.id) await deleteAccount(deletingAccount.id);
                setDeletingAccount(null);
              }}
              disabled={isDeletingAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAccount && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LedgerDialog
        open={showLedgerDialog}
        onOpenChange={setShowLedgerDialog}
        onSubmit={(data) => createEntry(data)}
        isPending={isCreatingEntry}
        accounts={activeAccounts}
        categories={activeCategories}
        parties={activeParties}
        userId={user?.uid || ''}
      />

      <AlertDialog open={!!deletingEntry} onOpenChange={(v) => { if (!v) setDeletingEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o lançamento{' '}
              <strong>{deletingEntry?.description}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingEntry?.id) await deleteEntry(deletingEntry.id);
                setDeletingEntry(null);
              }}
              disabled={isDeletingEntry}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingEntry && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
