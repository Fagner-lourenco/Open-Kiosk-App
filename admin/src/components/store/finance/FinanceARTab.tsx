/**
 * ============================================================================
 * FinanceARTab — Contas a Receber (Invoices)
 * ============================================================================
 *
 * CRUD completo de faturas com subcoleção de linhas (InvoiceLines).
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
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
  ArrowDownCircle,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  DollarSign,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import {
  useInvoices,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
  type CreateInvoiceLineInput,
} from '@/hooks/useInvoices';
import { useParties } from '@/hooks/useParties';
import type { Invoice, InvoiceStatus, InvoiceLine } from '@/types/finance';
import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Rascunho',
  issued: 'Emitida',
  partially_paid: 'Parcial',
  paid: 'Paga',
  overdue: 'Vencida',
  canceled: 'Cancelada',
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-100 text-blue-700',
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
// INVOICE DIALOG
// ============================================================================

function InvoiceDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
  parties,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateInvoiceInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: Invoice | null;
  parties: { id?: string; name: string }[];
}) {
  const [partyId, setPartyId] = useState(initialData?.partyId || '');
  const [status, setStatus] = useState<InvoiceStatus>(initialData?.status || 'draft');
  const [issueDate, setIssueDate] = useState(() =>
    initialData?.issueDate ? dateStr(toDateSafe(initialData.issueDate)) : dateStr(new Date()),
  );
  const [dueDate, setDueDate] = useState(() =>
    initialData?.dueDate ? dateStr(toDateSafe(initialData.dueDate)) : '',
  );

  const reset = () => { setPartyId(''); setStatus('draft'); setIssueDate(dateStr(new Date())); setDueDate(''); };

  const handleSubmit = async () => {
    if (!partyId || !dueDate) return;
    await onSubmit({
      partyId,
      status,
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Fatura' : 'Nova Fatura'}</DialogTitle>
          <DialogDescription>Fatura de contas a receber.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Parte (cliente/fornecedor) *</Label>
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
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!partyId || !dueDate || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// INVOICE LINE DIALOG
// ============================================================================

function InvoiceLineDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<CreateInvoiceLineInput, 'invoiceId'>) => Promise<unknown>;
  isPending: boolean;
}) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  const reset = () => { setDescription(''); setQty('1'); setUnitPrice(''); };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    await onSubmit({
      description: description.trim(),
      qty: parseInt(qty, 10) || 1,
      unitPrice: parseFloat(unitPrice) || 0,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Novo Item</DialogTitle>
          <DialogDescription>Adicione um item à fatura.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Serviço de evento" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Preço Unit. (R$)</Label>
              <Input type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency((parseInt(qty, 10) || 0) * (parseFloat(unitPrice) || 0))}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!description.trim() || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// INVOICE DETAIL DIALOG
// ============================================================================

function InvoiceDetailDialog({
  open,
  onOpenChange,
  invoice,
  partyName,
  franchiseId,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  partyName: string;
  franchiseId: string;
  storeId: string;
}) {
  const {
    fetchInvoiceLines,
    createInvoiceLine,
    isCreatingLine,
    deleteInvoiceLine,
    updateInvoice,
  } = useInvoices(franchiseId, storeId);

  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);

  const loadLines = useCallback(async (): Promise<InvoiceLine[]> => {
    if (!invoice?.id) return [];
    setLoadingLines(true);
    try {
      const data = await fetchInvoiceLines(invoice.id);
      setLines(data);
      return data;
    } finally {
      setLoadingLines(false);
    }
  }, [invoice?.id, fetchInvoiceLines]);

  useEffect(() => {
    if (open && invoice?.id) void loadLines();
  }, [open, invoice?.id, loadLines]);

  const linesTotal = lines.reduce((s, l) => s + l.total, 0);

  const syncTotals = useCallback(async (lines: InvoiceLine[]) => {
    if (!invoice?.id) return;
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const total = subtotal - (invoice.discounts || 0) + (invoice.fees || 0);
    await updateInvoice({
      invoiceId: invoice.id,
      subtotal,
      total,
      remaining: total - (invoice.paidTotal || 0),
    });
  }, [invoice, updateInvoice]);

  if (!invoice) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fatura #{invoice.id?.slice(-6).toUpperCase()}</DialogTitle>
            <DialogDescription>Detalhes e itens da fatura</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Parte:</span> {partyName}</div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[invoice.status]}`}>
                  {STATUS_LABELS[invoice.status]}
                </span>
              </div>
              <div><span className="text-muted-foreground">Emissão:</span> {toDateSafe(invoice.issueDate).toLocaleDateString('pt-BR')}</div>
              <div><span className="text-muted-foreground">Vencimento:</span> {toDateSafe(invoice.dueDate).toLocaleDateString('pt-BR')}</div>
              <div><span className="text-muted-foreground">Total:</span> {formatCurrency(invoice.total)}</div>
              <div><span className="text-muted-foreground">Pago:</span> {formatCurrency(invoice.paidTotal)} · Restante: {formatCurrency(invoice.remaining)}</div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">Itens</h4>
                <Button size="sm" variant="outline" onClick={() => setShowAddLine(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Item
                </Button>
              </div>
              {loadingLines ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum item.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">{line.description}</TableCell>
                          <TableCell className="text-right text-sm">{line.qty}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(line.unitPrice)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(line.total)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={async () => {
                                if (!invoice.id || !line.id) return;
                                await deleteInvoiceLine({ invoiceId: invoice.id, lineId: line.id });
                                const freshLines = await loadLines();
                                await syncTotals(freshLines);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end mt-3 font-bold text-sm">
                    Total: {formatCurrency(linesTotal)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceLineDialog
        open={showAddLine}
        onOpenChange={setShowAddLine}
        onSubmit={async (data) => {
          if (!invoice.id) return;
          await createInvoiceLine({ invoiceId: invoice.id, ...data });
          const freshLines = await loadLines();
          await syncTotals(freshLines);
        }}
        isPending={isCreatingLine}
      />
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceARTab({ franchiseId, storeId }: Props) {
  const {
    invoices,
    loadingInvoices,
    overdueInvoices,
    totalReceivable,
    totalReceived,
    createInvoice,
    isCreatingInvoice,
    updateInvoice,
    isUpdatingInvoice,
    deleteInvoice,
    isDeletingInvoice,
  } = useInvoices(franchiseId, storeId);

  const { activeParties } = useParties(franchiseId, storeId);

  const partyMap = useMemo(() => {
    const m = new Map<string, string>();
    activeParties.forEach((p) => { if (p.id) m.set(p.id, p.name); });
    return m;
  }, [activeParties]);

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Filter
  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (statusFilter !== 'all') result = result.filter((i) => i.status === statusFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (i) =>
          i.id?.toLowerCase().includes(term) ||
          partyMap.get(i.partyId)?.toLowerCase().includes(term),
      );
    }
    return result;
  }, [invoices, statusFilter, searchTerm, partyMap]);

  if (loadingInvoices) {
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
              <ArrowDownCircle className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{invoices.length}</p>
                <p className="text-xs text-muted-foreground">Total Faturas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalReceived)}</p>
                <p className="text-xs text-muted-foreground">Recebido</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalReceivable)}</p>
                <p className="text-xs text-muted-foreground">A Receber</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{overdueInvoices.length}</p>
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
              <CardTitle>Contas a Receber</CardTitle>
              <CardDescription>Faturas e recebíveis</CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />Nova Fatura
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por ID ou parte..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceStatus | 'all')}>
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

          {filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowDownCircle className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhuma fatura encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Parte</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Restante</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">#{inv.id?.slice(-6).toUpperCase()}</TableCell>
                    <TableCell className="font-medium text-sm">{partyMap.get(inv.partyId) || 'N/A'}</TableCell>
                    <TableCell className="text-sm">{toDateSafe(inv.dueDate).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right font-medium text-sm">{formatCurrency(inv.total)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(inv.remaining)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[inv.status]}`}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações da fatura" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingInvoice(inv)}>
                            <Eye className="h-4 w-4 mr-2" />Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingInvoice(inv)}>
                            <Edit className="h-4 w-4 mr-2" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeletingInvoice(inv)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <InvoiceDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSubmit={(d) => createInvoice(d)} isPending={isCreatingInvoice} parties={activeParties} />
      <InvoiceDialog
        open={!!editingInvoice}
        onOpenChange={(v) => { if (!v) setEditingInvoice(null); }}
        onSubmit={async (d) => {
          if (!editingInvoice?.id) return;
          const input: UpdateInvoiceInput = { invoiceId: editingInvoice.id, ...d };
          await updateInvoice(input);
          setEditingInvoice(null);
        }}
        isPending={isUpdatingInvoice}
        initialData={editingInvoice}
        parties={activeParties}
      />
      <InvoiceDetailDialog
        open={!!viewingInvoice}
        onOpenChange={(v) => { if (!v) setViewingInvoice(null); }}
        invoice={viewingInvoice}
        partyName={viewingInvoice ? partyMap.get(viewingInvoice.partyId) || 'N/A' : ''}
        franchiseId={franchiseId}
        storeId={storeId}
      />
      <AlertDialog open={!!deletingInvoice} onOpenChange={(v) => { if (!v) setDeletingInvoice(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a fatura <strong>#{deletingInvoice?.id?.slice(-6).toUpperCase()}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deletingInvoice?.id) await deleteInvoice(deletingInvoice.id); setDeletingInvoice(null); }}
              disabled={isDeletingInvoice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingInvoice && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
