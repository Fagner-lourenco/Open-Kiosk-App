/**
 * ============================================================================
 * FinanceAPTab — Contas a Pagar (Bills)
 * ============================================================================
 *
 * CRUD completo de contas a pagar.
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowUpCircle,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useBills, type CreateBillInput, type UpdateBillInput } from '@/hooks/useBills';
import { useParties } from '@/hooks/useParties';
import { useFinCategories } from '@/hooks/useFinCategories';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useLedger } from '@/hooks/useLedger';
import { useFinAccounts } from '@/hooks/useFinAccounts';
import { useAuth } from '@/context/AuthContext';
import type { Bill, BillStatus } from '@/types/finance';
import { Timestamp } from 'firebase/firestore';
import { parseLocalDate } from '@/utils/parseLocalDate';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_LABELS: Record<BillStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  partially_paid: 'Parcial',
  paid: 'Paga',
  overdue: 'Vencida',
  canceled: 'Cancelada',
};

const STATUS_COLORS: Record<BillStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-600',
  canceled: 'bg-gray-100 text-gray-500',
};

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

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// BILL DIALOG
// ============================================================================

function BillDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
  parties,
  categories,
  costCenters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateBillInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: Bill | null;
  parties: { id?: string; name: string }[];
  categories: { id?: string; name: string }[];
  costCenters: { id?: string; name: string }[];
}) {
  const [partyId, setPartyId] = useState(initialData?.partyId || '');
  const [status, setStatus] = useState<BillStatus>(initialData?.status || 'draft');
  const [issueDate, setIssueDate] = useState(() =>
    initialData?.issueDate ? dateStr(toDateSafe(initialData.issueDate)) : dateStr(new Date()),
  );
  const [dueDate, setDueDate] = useState(() =>
    initialData?.dueDate ? dateStr(toDateSafe(initialData.dueDate)) : '',
  );
  const [total, setTotal] = useState(initialData?.total?.toString() || '');
  const [categoryId, setCategoryId] = useState(initialData?.categoryId || '');
  const [costCenterId, setCostCenterId] = useState(initialData?.costCenterId || '');

  const reset = () => {
    setPartyId(''); setStatus('draft');
    setIssueDate(dateStr(new Date())); setDueDate('');
    setTotal(''); setCategoryId(''); setCostCenterId('');
  };

  const handleSubmit = async () => {
    if (!partyId || !dueDate || !categoryId) return;
    await onSubmit({
      partyId,
      status,
      issueDate: parseLocalDate(issueDate),
      dueDate: parseLocalDate(dueDate),
      total: parseFloat(total) || 0,
      categoryId,
      costCenterId: costCenterId || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}</DialogTitle>
          <DialogDescription>Registre uma obrigação de pagamento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fornecedor / Parte *</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {parties.filter((p) => p.id).map((p) => (
                  <SelectItem key={p.id} value={p.id as string}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Emissão</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as BillStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.id).map((c) => (
                    <SelectItem key={c.id} value={c.id as string}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Centro de Custo</Label>
              <Select
                value={costCenterId || 'none'}
                onValueChange={(v) => setCostCenterId(v === 'none' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {costCenters.filter((cc) => cc.id).map((cc) => (
                    <SelectItem key={cc.id} value={cc.id as string}>{cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!partyId || !dueDate || !categoryId || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceAPTab({ franchiseId, storeId }: Props) {
  const {
    bills,
    loadingBills,
    overdueBills,
    totalPayable,
    totalPaid,
    createBill,
    isCreatingBill,
    updateBill,
    isUpdatingBill,
    deleteBill,
    isDeletingBill,
  } = useBills(franchiseId, storeId);

  const { activeParties } = useParties(franchiseId, storeId);
  const { expenseCategories } = useFinCategories(franchiseId, storeId);
  const { activeCostCenters } = useCostCenters(franchiseId, storeId);
  // [FIX BUG-F02] Hooks para criar ledger entry ao marcar como paga
  const { createEntry } = useLedger(franchiseId, storeId);
  const { activeAccounts } = useFinAccounts(franchiseId, storeId);
  const { user } = useAuth();

  const partyMap = useMemo(() => {
    const m = new Map<string, string>();
    activeParties.forEach((p) => { if (p.id) m.set(p.id, p.name); });
    return m;
  }, [activeParties]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    expenseCategories.forEach((c) => { if (c.id) m.set(c.id, c.name); });
    return m;
  }, [expenseCategories]);

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);

  const filteredBills = useMemo(() => {
    let result = bills;
    if (statusFilter !== 'all') result = result.filter((b) => b.status === statusFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          b.id?.toLowerCase().includes(term) ||
          partyMap.get(b.partyId)?.toLowerCase().includes(term),
      );
    }
    return result;
  }, [bills, statusFilter, searchTerm, partyMap]);

  if (loadingBills) {
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
              <ArrowUpCircle className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{bills.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
                <p className="text-xs text-muted-foreground">Pago</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalPayable)}</p>
                <p className="text-xs text-muted-foreground">A Pagar</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{overdueBills.length}</p>
                <p className="text-xs text-muted-foreground">Vencidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Contas a Pagar</CardTitle>
              <CardDescription>Obrigações e pagamentos programados</CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />Nova Conta
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BillStatus | 'all')}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}>Limpar</Button>
          </div>

          {filteredBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowUpCircle className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhuma conta encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Restante</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-mono text-xs">#{bill.id?.slice(-6).toUpperCase()}</TableCell>
                    <TableCell className="font-medium text-sm">{partyMap.get(bill.partyId) || 'N/A'}</TableCell>
                    <TableCell className="text-sm">{categoryMap.get(bill.categoryId) || '—'}</TableCell>
                    <TableCell className="text-sm">{toDateSafe(bill.dueDate).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right font-medium text-sm">{formatCurrency(bill.total)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(bill.remaining)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[bill.status]}`}>
                        {STATUS_LABELS[bill.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações da conta" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingBill(bill)}>
                            <Edit className="h-4 w-4 mr-2" />Editar
                          </DropdownMenuItem>
                          {!['paid', 'canceled'].includes(bill.status) && (
                            <DropdownMenuItem
                              onClick={async () => {
                                if (!bill.id) return;
                                await updateBill({ billId: bill.id, status: 'paid', paidTotal: bill.total, remaining: 0 });
                                // [FIX BUG-F02] Criar lançamento no ledger ao marcar como paga
                                const defaultAccount = activeAccounts[0];
                                if (defaultAccount?.id) {
                                  try {
                                    await createEntry({
                                      direction: 'out',
                                      status: 'paid',
                                      competenceDate: new Date(),
                                      cashDate: new Date(),
                                      amount: bill.total,
                                      accountId: defaultAccount.id,
                                      categoryId: bill.categoryId || '',
                                      costCenterId: bill.costCenterId || undefined,
                                      partyId: bill.partyId || undefined,
                                      method: 'transfer',
                                      sourceType: 'bill',
                                      sourceId: bill.id,
                                      description: `Pgto conta a pagar #${bill.id.slice(0, 8)}`,
                                      createdBy: user?.uid || 'system',
                                    });
                                  } catch (err) {
                                    console.warn('[FinanceAPTab] Erro ao criar ledger entry:', err);
                                  }
                                }
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />Marcar como Paga
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeletingBill(bill)} className="text-destructive focus:text-destructive">
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

      {/* Dialogs */}
      <BillDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(d) => createBill(d)}
        isPending={isCreatingBill}
        parties={activeParties}
        categories={expenseCategories}
        costCenters={activeCostCenters}
      />
      <BillDialog
        open={!!editingBill}
        onOpenChange={(v) => { if (!v) setEditingBill(null); }}
        onSubmit={async (d) => {
          if (!editingBill?.id) return;
          const input: UpdateBillInput = { billId: editingBill.id, ...d };
          await updateBill(input);
          setEditingBill(null);
        }}
        isPending={isUpdatingBill}
        initialData={editingBill}
        parties={activeParties}
        categories={expenseCategories}
        costCenters={activeCostCenters}
      />
      <AlertDialog open={!!deletingBill} onOpenChange={(v) => { if (!v) setDeletingBill(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta a pagar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>#{deletingBill?.id?.slice(-6).toUpperCase()}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deletingBill?.id) await deleteBill(deletingBill.id); setDeletingBill(null); }}
              disabled={isDeletingBill}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingBill && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
