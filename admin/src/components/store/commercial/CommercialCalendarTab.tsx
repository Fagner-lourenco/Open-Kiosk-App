/**
 * ============================================================================
 * CommercialCalendarTab — Agenda / Calendário CRM
 * ============================================================================
 *
 * Lista agrupada por data de todos os itens de agenda (eventos, tarefas,
 * lembretes, visitas). Filtragem por tipo/status + CRUD completo via Dialog.
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
  CalendarDays,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  CalendarCheck,
  Bell,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
} from 'lucide-react';
import {
  useCalendarItems,
  type CreateCalendarInput,
  type UpdateCalendarInput,
} from '@/hooks/useCalendarItems';
import type {
  CalendarItem,
  CalendarItemType,
  CalendarItemStatus,
} from '@/types/commercial';
import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_LABELS: Record<CalendarItemType, string> = {
  event: 'Evento',
  task: 'Tarefa',
  reminder: 'Lembrete',
  visit: 'Visita',
};

const TYPE_ICONS: Record<CalendarItemType, typeof CalendarDays> = {
  event: CalendarCheck,
  task: CheckCircle2,
  reminder: Bell,
  visit: MapPin,
};

const STATUS_LABELS: Record<CalendarItemStatus, string> = {
  tentative: 'Provisório',
  confirmed: 'Confirmado',
  canceled: 'Cancelado',
  done: 'Concluído',
};

const STATUS_COLORS: Record<CalendarItemStatus, string> = {
  tentative: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  canceled: 'bg-red-100 text-red-600',
  done: 'bg-green-100 text-green-700',
};

function toDateSafe(ts: Timestamp | undefined | null): Date {
  if (!ts) return new Date();
  return ts instanceof Timestamp ? ts.toDate() : new Date();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// CALENDAR ITEM DIALOG
// ============================================================================

function CalendarItemDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateCalendarInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: CalendarItem | null;
}) {
  const now = new Date();
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const initStart = initialData?.startAt ? toDateSafe(initialData.startAt) : null;
  const initEnd = initialData?.endAt ? toDateSafe(initialData.endAt) : null;

  const [title, setTitle] = useState(initialData?.title || '');
  const [type, setType] = useState<CalendarItemType>(initialData?.type || 'event');
  const [status, setStatus] = useState<CalendarItemStatus>(initialData?.status || 'tentative');
  const [allDay, setAllDay] = useState(initialData?.allDay || false);
  const [startDate, setStartDate] = useState(
    initStart
      ? `${initStart.getFullYear()}-${String(initStart.getMonth() + 1).padStart(2, '0')}-${String(initStart.getDate()).padStart(2, '0')}`
      : defaultDate
  );
  const [startTime, setStartTime] = useState(
    initStart ? `${String(initStart.getHours()).padStart(2, '0')}:${String(initStart.getMinutes()).padStart(2, '0')}` : defaultTime
  );
  const [endDate, setEndDate] = useState(
    initEnd
      ? `${initEnd.getFullYear()}-${String(initEnd.getMonth() + 1).padStart(2, '0')}-${String(initEnd.getDate()).padStart(2, '0')}`
      : ''
  );
  const [endTime, setEndTime] = useState(
    initEnd ? `${String(initEnd.getHours()).padStart(2, '0')}:${String(initEnd.getMinutes()).padStart(2, '0')}` : ''
  );

  const isEditing = !!initialData;

  const reset = () => {
    setTitle('');
    setType('event');
    setStatus('tentative');
    setAllDay(false);
    setStartDate(defaultDate);
    setStartTime(defaultTime);
    setEndDate('');
    setEndTime('');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !startDate) return;
    const startAt = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime || '00:00'}`);

    let endAt: Date | undefined;
    if (endDate) {
      endAt = allDay
        ? new Date(`${endDate}T23:59:59`)
        : new Date(`${endDate}T${endTime || '23:59'}`);
    }

    await onSubmit({
      type,
      title: title.trim(),
      startAt,
      endAt,
      allDay,
      status,
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Item' : 'Novo Item na Agenda'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Atualize os dados do item.' : 'Crie um novo evento, tarefa, lembrete ou visita.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reunião com cliente"
            />
          </div>

          {/* Tipo + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as CalendarItemType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CalendarItemStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dia inteiro */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="allDay">Dia inteiro</Label>
          </div>

          {/* Data/Hora início */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label>Hora Início</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Data/Hora fim */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label>Hora Fim</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !startDate || isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {isEditing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommercialCalendarTab({ franchiseId, storeId }: Props) {
  const {
    calendarItems,
    loadingCalendar,
    upcomingItems,
    todayItems,
    createCalendarItem,
    isCreatingCalendarItem,
    updateCalendarItem,
    isUpdatingCalendarItem,
    deleteCalendarItem,
    isDeletingCalendarItem,
  } = useCalendarItems(franchiseId, storeId);

  // ── Estado local ────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CalendarItemType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<CalendarItemStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CalendarItem | null>(null);

  // ── Filtragem ───────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = calendarItems;
    if (typeFilter !== 'all') {
      result = result.filter((i) => i.type === typeFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(term));
    }
    return result;
  }, [calendarItems, typeFilter, statusFilter, searchTerm]);

  // ── Agrupar por data ────────────────────────────────────────────────────
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>();
    for (const item of filteredItems) {
      const date = toDateSafe(item.startAt);
      const key = toDateKey(date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    // Sort keys
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loadingCalendar) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCreate = async (data: CreateCalendarInput) => {
    await createCalendarItem(data);
  };

  const handleEdit = async (data: CreateCalendarInput) => {
    if (!editingItem?.id) return;
    const input: UpdateCalendarInput = {
      itemId: editingItem.id,
      ...data,
    };
    await updateCalendarItem(input);
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (!deletingItem?.id) return;
    await deleteCalendarItem(deletingItem.id);
    setDeletingItem(null);
  };

  const handleToggleStatus = async (item: CalendarItem, newStatus: CalendarItemStatus) => {
    if (!item.id) return;
    await updateCalendarItem({ itemId: item.id, status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{calendarItems.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{todayItems.length}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{upcomingItems.length}</p>
                <p className="text-xs text-muted-foreground">Próximos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-2xl font-bold">
                  {calendarItems.filter((i) => i.status === 'canceled').length}
                </p>
                <p className="text-xs text-muted-foreground">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main List ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Agenda</CardTitle>
              <CardDescription>
                Eventos, tarefas, lembretes e visitas
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Filtros ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por título..."
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as CalendarItemType | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as CalendarItemStatus | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
            >
              Limpar Filtros
            </Button>
          </div>

          {/* ── Items agrupados por data ──────────────────────────────── */}
          {groupedByDate.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Nenhum item na agenda</p>
              <p className="text-sm">
                {calendarItems.length === 0
                  ? 'Crie seu primeiro evento ou tarefa.'
                  : 'Tente ajustar os filtros.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByDate.map(([dateKey, items]) => {
                const dateObj = new Date(dateKey + 'T12:00:00');
                const today = new Date();
                const isToday = dateObj.toDateString() === today.toDateString();
                return (
                  <div key={dateKey}>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        {formatDate(dateObj)}
                      </h3>
                      {isToday && (
                        <Badge variant="default" className="text-xs">
                          Hoje
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const TypeIcon = TYPE_ICONS[item.type];
                        const itemDate = toDateSafe(item.startAt);
                        return (
                          <Card key={item.id} className="hover:bg-muted/30 transition-colors">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <TypeIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                                  <div>
                                    <p className="font-medium text-sm">{item.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {!item.allDay && (
                                        <span className="text-xs text-muted-foreground">
                                          {formatTime(itemDate)}
                                        </span>
                                      )}
                                      {item.allDay && (
                                        <span className="text-xs text-muted-foreground">
                                          Dia inteiro
                                        </span>
                                      )}
                                      <Badge variant="outline" className="text-xs">
                                        {TYPE_LABELS[item.type]}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[item.status]}`}
                                  >
                                    {STATUS_LABELS[item.status]}
                                  </span>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => setEditingItem(item)}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Editar
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {item.status !== 'done' && (
                                        <DropdownMenuItem
                                          onClick={() => handleToggleStatus(item, 'done')}
                                        >
                                          <CheckCircle2 className="h-4 w-4 mr-2" />
                                          Marcar como concluído
                                        </DropdownMenuItem>
                                      )}
                                      {item.status !== 'confirmed' && (
                                        <DropdownMenuItem
                                          onClick={() => handleToggleStatus(item, 'confirmed')}
                                        >
                                          <CalendarCheck className="h-4 w-4 mr-2" />
                                          Confirmar
                                        </DropdownMenuItem>
                                      )}
                                      {item.status !== 'canceled' && (
                                        <DropdownMenuItem
                                          onClick={() => handleToggleStatus(item, 'canceled')}
                                        >
                                          <XCircle className="h-4 w-4 mr-2" />
                                          Cancelar
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => setDeletingItem(item)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ──────────────────────────────────────────────── */}
      <CalendarItemDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
        isPending={isCreatingCalendarItem}
      />

      {/* ── Edit Dialog ────────────────────────────────────────────────── */}
      <CalendarItemDialog
        open={!!editingItem}
        onOpenChange={(v) => {
          if (!v) setEditingItem(null);
        }}
        onSubmit={handleEdit}
        isPending={isUpdatingCalendarItem}
        initialData={editingItem}
      />

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(v) => {
          if (!v) setDeletingItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item da agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{' '}
              <strong>{deletingItem?.title}</strong>? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeletingCalendarItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCalendarItem && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
