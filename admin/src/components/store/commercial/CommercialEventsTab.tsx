/**
 * ============================================================================
 * CommercialEventsTab — Gestão de Eventos Comerciais
 * ============================================================================
 *
 * CRUD completo de eventos comerciais (feiras, festas, ações) com controle
 * de orçamento via subcoleção budgetLines.
 * Segue o padrão: Summary Cards → Filtros → Table → Dialogs.
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
  PartyPopper,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  CalendarCheck2,
  DollarSign,
  Users,
  Eye,
} from 'lucide-react';
import {
  useCommercialEvents,
  type CreateEventInput,
  type UpdateEventInput,
  type CreateBudgetLineInput,
} from '@/hooks/useCommercialEvents';
import { useCustomers } from '@/hooks/useCustomers';
import type {
  CommercialEvent,
  CommercialEventStatus,
  LocationType,
  PricingModel,
  BudgetLine,
  BudgetLineType,
  PaidBy,
} from '@/types/commercial';
import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_LABELS: Record<CommercialEventStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  in_progress: 'Em andamento',
  done: 'Concluído',
  canceled: 'Cancelado',
};

const STATUS_COLORS: Record<CommercialEventStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  done: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-red-100 text-red-600',
};

const LOCATION_LABELS: Record<LocationType, string> = {
  on_site: 'No local',
  external: 'Externo',
};

const PRICING_LABELS: Record<PricingModel, string> = {
  per_liter: 'Por litro',
  per_hour: 'Por hora',
  package: 'Pacote',
};

const BUDGET_TYPE_LABELS: Record<BudgetLineType, string> = {
  staff: 'Equipe',
  transport: 'Transporte',
  beverage: 'Bebida',
  rental: 'Locação',
  fee: 'Taxa',
  discount: 'Desconto',
};

const PAID_BY_LABELS: Record<PaidBy, string> = {
  store: 'Loja',
  client: 'Cliente',
  split: 'Dividido',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toDateSafe(ts: Timestamp | undefined | null): Date {
  if (!ts) return new Date();
  return ts instanceof Timestamp ? ts.toDate() : new Date();
}

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// EVENT DIALOG — Create / Edit
// ============================================================================

function EventDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateEventInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: CommercialEvent | null;
  customers: { id?: string; name: string }[];
}) {
  const now = new Date();
  const initStart = initialData?.startAt ? toDateSafe(initialData.startAt) : null;
  const initEnd = initialData?.endAt ? toDateSafe(initialData.endAt) : null;

  const [title, setTitle] = useState(initialData?.title || '');
  const [customerId, setCustomerId] = useState(initialData?.customerId || '');
  const [status, setStatus] = useState<CommercialEventStatus>(initialData?.status || 'draft');
  const [locationType, setLocationType] = useState<LocationType>(initialData?.locationType || 'external');
  const [pricingModel, setPricingModel] = useState<PricingModel | ''>(initialData?.pricingModel || '');
  const [attendeesEstimate, setAttendeesEstimate] = useState(
    initialData?.attendeesEstimate?.toString() || ''
  );
  const [description, setDescription] = useState(initialData?.description || '');
  const [startDate, setStartDate] = useState(initStart ? toDateInput(initStart) : toDateInput(now));
  const [startTime, setStartTime] = useState(initStart ? toTimeInput(initStart) : toTimeInput(now));
  const [endDate, setEndDate] = useState(initEnd ? toDateInput(initEnd) : '');
  const [endTime, setEndTime] = useState(initEnd ? toTimeInput(initEnd) : '');

  const isEditing = !!initialData;

  const reset = () => {
    setTitle('');
    setCustomerId('');
    setStatus('draft');
    setLocationType('external');
    setPricingModel('');
    setAttendeesEstimate('');
    setDescription('');
    setStartDate(toDateInput(now));
    setStartTime(toTimeInput(now));
    setEndDate('');
    setEndTime('');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !customerId || !startDate) return;
    const startAt = new Date(`${startDate}T${startTime || '00:00'}`);
    let endAt: Date | undefined;
    if (endDate) {
      endAt = new Date(`${endDate}T${endTime || '23:59'}`);
    }
    await onSubmit({
      customerId,
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      locationType,
      pricingModel: pricingModel || undefined,
      startAt,
      endAt,
      attendeesEstimate: parseInt(attendeesEstimate, 10) || undefined,
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
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as informações do evento.'
              : 'Preencha os dados para criar um novo evento comercial.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Festa de lançamento"
            />
          </div>
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente..." />
              </SelectTrigger>
              <SelectContent>
                {customers.filter((c) => c.id).map((c) => (
                  <SelectItem key={c.id} value={c.id as string}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CommercialEventStatus)}>
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
              <Label>Local</Label>
              <Select value={locationType} onValueChange={(v) => setLocationType(v as LocationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LOCATION_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modelo de Preço</Label>
              <Select value={pricingModel} onValueChange={(v) => setPricingModel(v as PricingModel)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRICING_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora Início</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora Fim</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Estimativa de Convidados</Label>
            <Input
              value={attendeesEstimate}
              onChange={(e) => setAttendeesEstimate(e.target.value)}
              type="number"
              min="0"
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes do evento..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !customerId || !startDate || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {isEditing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// BUDGET LINE DIALOG
// ============================================================================

function BudgetLineDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<CreateBudgetLineInput, 'eventId'>) => Promise<unknown>;
  isPending: boolean;
}) {
  const [type, setType] = useState<BudgetLineType>('beverage');
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [paidBy, setPaidBy] = useState<PaidBy>('store');

  const reset = () => {
    setType('beverage');
    setQty('1');
    setUnitCost('');
    setPaidBy('store');
  };

  const handleSubmit = async () => {
    const q = parseInt(qty, 10) || 1;
    const u = parseFloat(unitCost) || 0;
    await onSubmit({ type, qty: q, unitCost: u, paidBy });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Nova Linha de Orçamento</DialogTitle>
          <DialogDescription>Adicione um item ao orçamento do evento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as BudgetLineType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(BUDGET_TYPE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Custo Unitário (R$)</Label>
              <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} type="number" min="0" step="0.01" placeholder="0,00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Pago por</Label>
            <Select value={paidBy} onValueChange={(v) => setPaidBy(v as PaidBy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAID_BY_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Total: {formatCurrency((parseInt(qty, 10) || 0) * (parseFloat(unitCost) || 0))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EVENT DETAIL DIALOG — view + budget lines
// ============================================================================

function EventDetailDialog({
  open,
  onOpenChange,
  event,
  customerName,
  franchiseId,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CommercialEvent | null;
  customerName: string;
  franchiseId: string;
  storeId: string;
}) {
  const {
    fetchBudgetLines,
    createBudgetLine,
    isCreatingBudgetLine,
    deleteBudgetLine,
  } = useCommercialEvents(franchiseId, storeId);

  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);

  const loadLines = useCallback(async () => {
    if (!event?.id) return;
    setLoadingLines(true);
    try {
      const lines = await fetchBudgetLines(event.id);
      setBudgetLines(lines);
    } finally {
      setLoadingLines(false);
    }
  }, [event?.id, fetchBudgetLines]);

  useEffect(() => {
    if (open && event?.id) {
      loadLines();
    }
  }, [open, event?.id, loadLines]);

  const totalBudget = budgetLines.reduce((s, l) => s + l.totalCost, 0);

  if (!event) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
            <DialogDescription>Detalhes e orçamento do evento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Event Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Cliente:</span> {customerName}</div>
              <div><span className="text-muted-foreground">Status:</span>{' '}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[event.status]}`}>
                  {STATUS_LABELS[event.status]}
                </span>
              </div>
              <div><span className="text-muted-foreground">Local:</span> {LOCATION_LABELS[event.locationType]}</div>
              {event.pricingModel && (
                <div><span className="text-muted-foreground">Preço:</span> {PRICING_LABELS[event.pricingModel]}</div>
              )}
              <div><span className="text-muted-foreground">Início:</span> {toDateSafe(event.startAt).toLocaleDateString('pt-BR')}</div>
              {event.endAt && <div><span className="text-muted-foreground">Fim:</span> {toDateSafe(event.endAt).toLocaleDateString('pt-BR')}</div>}
              {event.attendeesEstimate && (
                <div><span className="text-muted-foreground">Convidados:</span> ~{event.attendeesEstimate}</div>
              )}
            </div>
            {event.description && (
              <p className="text-sm text-muted-foreground">{event.description}</p>
            )}

            {/* Budget Lines */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">Orçamento</h4>
                <Button size="sm" variant="outline" onClick={() => setShowAddLine(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Linha
                </Button>
              </div>
              {loadingLines ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : budgetLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma linha de orçamento ainda.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Pago por</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">{BUDGET_TYPE_LABELS[line.type]}</TableCell>
                          <TableCell className="text-right text-sm">{line.qty}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(line.unitCost)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(line.totalCost)}</TableCell>
                          <TableCell className="text-sm">{PAID_BY_LABELS[line.paidBy]}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={async () => {
                                if (!event.id || !line.id) return;
                                await deleteBudgetLine({ eventId: event.id, lineId: line.id });
                                await loadLines();
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="text-right text-sm font-bold mt-2">
                    Total: {formatCurrency(totalBudget)}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BudgetLineDialog
        open={showAddLine}
        onOpenChange={setShowAddLine}
        onSubmit={async (data) => {
          if (!event.id) return;
          await createBudgetLine({ eventId: event.id, ...data });
          await loadLines();
        }}
        isPending={isCreatingBudgetLine}
      />
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommercialEventsTab({ franchiseId, storeId }: Props) {
  const {
    events,
    loadingEvents,
    activeEvents,
    upcomingEvents,
    createEvent,
    isCreatingEvent,
    updateEvent,
    isUpdatingEvent,
    deleteEvent,
    isDeletingEvent,
  } = useCommercialEvents(franchiseId, storeId);

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
  const [statusFilter, setStatusFilter] = useState<CommercialEventStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommercialEvent | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<CommercialEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CommercialEvent | null>(null);

  // Filter
  const filteredEvents = useMemo(() => {
    let result = events;
    if (statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          customerMap.get(e.customerId)?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [events, statusFilter, searchTerm, customerMap]);

  if (loadingEvents) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleCreate = async (data: CreateEventInput) => {
    await createEvent(data);
  };

  const handleEdit = async (data: CreateEventInput) => {
    if (!editingEvent?.id) return;
    const input: UpdateEventInput = { eventId: editingEvent.id, ...data };
    await updateEvent(input);
    setEditingEvent(null);
  };

  const handleDelete = async () => {
    if (!deletingEvent?.id) return;
    await deleteEvent(deletingEvent.id);
    setDeletingEvent(null);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{events.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{activeEvents.length}</p>
                <p className="text-xs text-muted-foreground">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{upcomingEvents.length}</p>
                <p className="text-xs text-muted-foreground">Próximos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">
                  {events.reduce((s, e) => s + (e.attendeesEstimate || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Convidados Est.</p>
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
              <CardTitle>Eventos Comerciais</CardTitle>
              <CardDescription>Feiras, festas e ações promocionais</CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Evento
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
                placeholder="Buscar por título ou cliente..."
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CommercialEventStatus | 'all')}>
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
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <PartyPopper className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhum evento encontrado</p>
              <p className="text-sm">
                {events.length === 0 ? 'Crie seu primeiro evento.' : 'Tente ajustar os filtros.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Convid.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-medium">{ev.title}</TableCell>
                    <TableCell className="text-sm">
                      {customerMap.get(ev.customerId) || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {toDateSafe(ev.startAt).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {LOCATION_LABELS[ev.locationType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ev.attendeesEstimate || '—'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[ev.status]}`}>
                        {STATUS_LABELS[ev.status]}
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
                          <DropdownMenuItem onClick={() => setViewingEvent(ev)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingEvent(ev)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingEvent(ev)}
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
      <EventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
        isPending={isCreatingEvent}
        customers={activeCustomers}
      />

      {/* Edit Dialog */}
      <EventDialog
        open={!!editingEvent}
        onOpenChange={(v) => { if (!v) setEditingEvent(null); }}
        onSubmit={handleEdit}
        isPending={isUpdatingEvent}
        initialData={editingEvent}
        customers={activeCustomers}
      />

      {/* Detail (with budget) */}
      <EventDetailDialog
        open={!!viewingEvent}
        onOpenChange={(v) => { if (!v) setViewingEvent(null); }}
        event={viewingEvent}
        customerName={viewingEvent ? customerMap.get(viewingEvent.customerId) || 'N/A' : ''}
        franchiseId={franchiseId}
        storeId={storeId}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingEvent} onOpenChange={(v) => { if (!v) setDeletingEvent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingEvent?.title}</strong>?
              As linhas de orçamento associadas também serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeletingEvent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingEvent && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
