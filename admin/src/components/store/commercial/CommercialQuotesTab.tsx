/**
 * ============================================================================
 * CommercialQuotesTab — Propostas / Cotações CRM
 * ============================================================================
 *
 * CRUD completo de propostas comerciais com linhas (items).
 * Ver detalhes abre dialog que permite gerenciar as QuoteLines.
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
  FileText,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  DollarSign,
  Send,
  CheckCircle2,
  Eye,
  ClipboardList,
} from 'lucide-react';
import {
  useQuotes,
  type CreateQuoteInput,
  type UpdateQuoteInput,
  type CreateQuoteLineInput,
} from '@/hooks/useQuotes';
import { useCustomers } from '@/hooks/useCustomers';
import type {
  Quote,
  QuoteStatus,
  QuoteLine,
  QuoteLineType,
} from '@/types/commercial';
import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  accepted: 'Aceita',
  rejected: 'Rejeitada',
  expired: 'Expirada',
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  expired: 'bg-yellow-100 text-yellow-700',
};

const LINE_TYPE_LABELS: Record<QuoteLineType, string> = {
  keg: 'Barril',
  service: 'Serviço',
  transport: 'Transporte',
  staff: 'Equipe',
  package: 'Pacote',
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
// QUOTE DIALOG — Create / Edit
// ============================================================================

function QuoteDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateQuoteInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: Quote | null;
  customers: { id?: string; name: string }[];
}) {
  const [customerId, setCustomerId] = useState(initialData?.customerId || '');
  const [status, setStatus] = useState<QuoteStatus>(initialData?.status || 'draft');
  const [validUntil, setValidUntil] = useState(() => {
    if (initialData?.validUntil) {
      const d = toDateSafe(initialData.validUntil);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return '';
  });
  const [paymentTerms, setPaymentTerms] = useState(initialData?.paymentTerms || '');

  const isEditing = !!initialData;

  const reset = () => {
    setCustomerId('');
    setStatus('draft');
    setValidUntil('');
    setPaymentTerms('');
  };

  const handleSubmit = async () => {
    if (!customerId) return;
    await onSubmit({
      customerId,
      status,
      validUntil: validUntil ? new Date(`${validUntil}T23:59:59`) : undefined,
      paymentTerms: paymentTerms.trim() || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as informações da proposta.'
              : 'Crie uma nova proposta comercial.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id || ''}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Condições de Pagamento</Label>
            <Input
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Ex: 50% entrada + 50% no evento"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!customerId || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {isEditing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// QUOTE LINE DIALOG
// ============================================================================

function QuoteLineDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<CreateQuoteLineInput, 'quoteId'>) => Promise<unknown>;
  isPending: boolean;
}) {
  const [type, setType] = useState<QuoteLineType>('service');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  const reset = () => {
    setType('service');
    setDescription('');
    setQty('1');
    setUnitPrice('');
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    const q = parseInt(qty, 10) || 1;
    const u = parseFloat(unitPrice) || 0;
    await onSubmit({ type, description: description.trim(), qty: q, unitPrice: u });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Novo Item na Proposta</DialogTitle>
          <DialogDescription>Adicione um item à proposta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as QuoteLineType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LINE_TYPE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Barril Pilsen 50L"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Preço Unitário (R$)</Label>
              <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="0,00" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Total: {formatCurrency((parseInt(qty, 10) || 0) * (parseFloat(unitPrice) || 0))}
          </div>
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
// QUOTE DETAIL DIALOG — view + lines
// ============================================================================

function QuoteDetailDialog({
  open,
  onOpenChange,
  quote,
  customerName,
  franchiseId,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote | null;
  customerName: string;
  franchiseId: string;
  storeId: string;
}) {
  const {
    fetchQuoteLines,
    createQuoteLine,
    isCreatingLine,
    deleteQuoteLine,
    updateQuote,
  } = useQuotes(franchiseId, storeId);

  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);

  const loadLines = useCallback(async (): Promise<QuoteLine[]> => {
    if (!quote?.id) return [];
    setLoadingLines(true);
    try {
      const data = await fetchQuoteLines(quote.id);
      setLines(data);
      return data;
    } finally {
      setLoadingLines(false);
    }
  }, [quote?.id, fetchQuoteLines]);

  useEffect(() => {
    if (open && quote?.id) {
      void loadLines();
    }
  }, [open, quote?.id, loadLines]);

  const linesTotal = lines.reduce((s, l) => s + l.total, 0);

  // Sync totals back to quote when lines change
  const syncTotals = useCallback(async (lines: QuoteLine[]) => {
    if (!quote?.id) return;
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    await updateQuote({
      quoteId: quote.id,
      subtotal,
      total: subtotal - (quote.discounts || 0) + (quote.fees || 0),
    });
  }, [quote, updateQuote]);

  if (!quote) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proposta #{quote.id?.slice(-6).toUpperCase()}</DialogTitle>
            <DialogDescription>Detalhes e itens da proposta</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Quote info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Cliente:</span> {customerName}</div>
              <div><span className="text-muted-foreground">Status:</span>{' '}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[quote.status]}`}>
                  {STATUS_LABELS[quote.status]}
                </span>
              </div>
              {quote.validUntil && (
                <div><span className="text-muted-foreground">Validade:</span> {toDateSafe(quote.validUntil).toLocaleDateString('pt-BR')}</div>
              )}
              {quote.paymentTerms && (
                <div><span className="text-muted-foreground">Pagamento:</span> {quote.paymentTerms}</div>
              )}
              <div><span className="text-muted-foreground">Criada em:</span> {toDateSafe(quote.createdAt).toLocaleDateString('pt-BR')}</div>
            </div>

            {/* Lines */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">Itens da Proposta</h4>
                <Button size="sm" variant="outline" onClick={() => setShowAddLine(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Item
                </Button>
              </div>
              {loadingLines ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum item adicionado.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
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
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {LINE_TYPE_LABELS[line.type]}
                            </Badge>
                          </TableCell>
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
                                if (!quote.id || !line.id) return;
                                await deleteQuoteLine({ quoteId: quote.id, lineId: line.id });
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
                  <div className="flex justify-end gap-6 mt-3 text-sm">
                    {(quote.discounts || 0) > 0 && (
                      <span className="text-muted-foreground">
                        Descontos: -{formatCurrency(quote.discounts)}
                      </span>
                    )}
                    {(quote.fees || 0) > 0 && (
                      <span className="text-muted-foreground">
                        Taxas: +{formatCurrency(quote.fees)}
                      </span>
                    )}
                    <span className="font-bold">
                      Total: {formatCurrency(linesTotal - (quote.discounts || 0) + (quote.fees || 0))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <QuoteLineDialog
        open={showAddLine}
        onOpenChange={setShowAddLine}
        onSubmit={async (data) => {
          if (!quote.id) return;
          await createQuoteLine({ quoteId: quote.id, ...data });
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

export function CommercialQuotesTab({ franchiseId, storeId }: Props) {
  const {
    quotes,
    loadingQuotes,
    draftQuotes,
    sentQuotes,
    acceptedQuotes,
    totalAcceptedValue,
    createQuote,
    isCreatingQuote,
    updateQuote,
    isUpdatingQuote,
    deleteQuote,
    isDeletingQuote,
  } = useQuotes(franchiseId, storeId);

  const { activeCustomers } = useCustomers(franchiseId, storeId);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    activeCustomers.forEach((c) => {
      if (c.id) map.set(c.id, c.name);
    });
    return map;
  }, [activeCustomers]);

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [deletingQuote, setDeletingQuote] = useState<Quote | null>(null);
  const [viewingQuote, setViewingQuote] = useState<Quote | null>(null);

  // Filter
  const filteredQuotes = useMemo(() => {
    let result = quotes;
    if (statusFilter !== 'all') {
      result = result.filter((q) => q.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (q) =>
          q.id?.toLowerCase().includes(term) ||
          customerMap.get(q.customerId)?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [quotes, statusFilter, searchTerm, customerMap]);

  if (loadingQuotes) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleCreate = async (data: CreateQuoteInput) => {
    await createQuote(data);
  };

  const handleEdit = async (data: CreateQuoteInput) => {
    if (!editingQuote?.id) return;
    const input: UpdateQuoteInput = { quoteId: editingQuote.id, ...data };
    await updateQuote(input);
    setEditingQuote(null);
  };

  const handleDelete = async () => {
    if (!deletingQuote?.id) return;
    await deleteQuote(deletingQuote.id);
    setDeletingQuote(null);
  };

  const handleQuickStatus = async (quote: Quote, newStatus: QuoteStatus) => {
    if (!quote.id) return;
    await updateQuote({ quoteId: quote.id, status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{quotes.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-2xl font-bold">{draftQuotes.length}</p>
                <p className="text-xs text-muted-foreground">Rascunhos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold">{sentQuotes.length}</p>
                <p className="text-xs text-muted-foreground">Enviadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalAcceptedValue)}</p>
                <p className="text-xs text-muted-foreground">Aceitas ({acceptedQuotes.length})</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Propostas</CardTitle>
              <CardDescription>Cotações e propostas enviadas a clientes</CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Proposta
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
                placeholder="Buscar por ID ou cliente..."
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuoteStatus | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}>
              Limpar Filtros
            </Button>
          </div>

          {/* Table */}
          {filteredQuotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhuma proposta encontrada</p>
              <p className="text-sm">
                {quotes.length === 0 ? 'Crie sua primeira proposta.' : 'Tente ajustar os filtros.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">
                      #{q.id?.slice(-6).toUpperCase()}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {customerMap.get(q.customerId) || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {q.validUntil ? toDateSafe(q.validUntil).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {formatCurrency(q.total)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[q.status]}`}>
                        {STATUS_LABELS[q.status]}
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
                          <DropdownMenuItem onClick={() => setViewingQuote(q)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingQuote(q)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {q.status === 'draft' && (
                            <DropdownMenuItem onClick={() => handleQuickStatus(q, 'sent')}>
                              <Send className="h-4 w-4 mr-2" />
                              Marcar como Enviada
                            </DropdownMenuItem>
                          )}
                          {q.status === 'sent' && (
                            <DropdownMenuItem onClick={() => handleQuickStatus(q, 'accepted')}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Marcar como Aceita
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingQuote(q)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
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

      {/* Create Dialog */}
      <QuoteDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
        isPending={isCreatingQuote}
        customers={activeCustomers}
      />

      {/* Edit Dialog */}
      <QuoteDialog
        open={!!editingQuote}
        onOpenChange={(v) => { if (!v) setEditingQuote(null); }}
        onSubmit={handleEdit}
        isPending={isUpdatingQuote}
        initialData={editingQuote}
        customers={activeCustomers}
      />

      {/* Detail (with lines) */}
      <QuoteDetailDialog
        open={!!viewingQuote}
        onOpenChange={(v) => { if (!v) setViewingQuote(null); }}
        quote={viewingQuote}
        customerName={viewingQuote ? customerMap.get(viewingQuote.customerId) || 'N/A' : ''}
        franchiseId={franchiseId}
        storeId={storeId}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingQuote} onOpenChange={(v) => { if (!v) setDeletingQuote(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a proposta{' '}
              <strong>#{deletingQuote?.id?.slice(-6).toUpperCase()}</strong>?
              Os itens associados também serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeletingQuote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingQuote && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
