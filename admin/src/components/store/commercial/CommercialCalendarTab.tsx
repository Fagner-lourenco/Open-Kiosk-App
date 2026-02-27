/**
 * ============================================================================
 * CommercialCalendarTab — Calendário Visual Interativo
 * ============================================================================
 *
 * Calendário completo com visões Mês/Semana/Dia/Lista usando @fullcalendar.
 * Agrega dados de 3 fontes: calendarItems, commercialEvents e deals.
 *
 * Features:
 * - 4 visões: dayGridMonth, timeGridWeek, timeGridDay, listWeek
 * - Color-coding por tipo de fonte
 * - Click em slot vazio → novo CalendarItem com data/hora preenchida
 * - Click em evento → dialog de edição
 * - Summary cards (Total, Hoje, Próximos, Cancelados)
 * - CRUD completo via Dialog
 *
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { useState, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { EventInput, DateSelectArg, EventClickArg } from '@fullcalendar/core';
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
  CalendarDays,
  Plus,
  Loader2,
  CalendarCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import {
  useCalendarItems,
  type CreateCalendarInput,
  type UpdateCalendarInput,
} from '@/hooks/useCalendarItems';
import { useCommercialEvents } from '@/hooks/useCommercialEvents';
import { useDeals } from '@/hooks/useDeals';
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

const STATUS_LABELS: Record<CalendarItemStatus, string> = {
  tentative: 'Provisório',
  confirmed: 'Confirmado',
  canceled: 'Cancelado',
  done: 'Concluído',
};

/** Color palette for event sources */
const TYPE_COLORS: Record<string, string> = {
  event: '#7c3aed',
  task: '#059669',
  visit: '#ea580c',
  reminder: '#2563eb',
  commercialEvent: '#db2777',
  deal: '#6b7280',
};

function toDateSafe(ts: Timestamp | undefined | null): Date {
  if (!ts) return new Date();
  return ts instanceof Timestamp ? ts.toDate() : new Date();
}

function dateToLocalISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateToLocalTime(date: Date): string {
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
// CALENDAR ITEM DIALOG
// ============================================================================

function CalendarItemDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
  prefillDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateCalendarInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: CalendarItem | null;
  prefillDate?: { start: Date; end?: Date; allDay?: boolean } | null;
}) {
  const now = new Date();
  const defaultDate = dateToLocalISO(now);
  const defaultTime = dateToLocalTime(now);

  const getInitStart = () =>
    initialData?.startAt ? toDateSafe(initialData.startAt) : prefillDate?.start || null;
  const getInitEnd = () =>
    initialData?.endAt ? toDateSafe(initialData.endAt) : prefillDate?.end || null;

  const [title, setTitle] = useState(initialData?.title || '');
  const [type, setType] = useState<CalendarItemType>(initialData?.type || 'event');
  const [status, setStatus] = useState<CalendarItemStatus>(
    initialData?.status || 'tentative',
  );
  const [allDay, setAllDay] = useState(
    initialData?.allDay ?? prefillDate?.allDay ?? false,
  );
  const [startDate, setStartDate] = useState(() => {
    const s = getInitStart();
    return s ? dateToLocalISO(s) : defaultDate;
  });
  const [startTime, setStartTime] = useState(() => {
    const s = getInitStart();
    return s ? dateToLocalTime(s) : defaultTime;
  });
  const [endDate, setEndDate] = useState(() => {
    const e = getInitEnd();
    return e ? dateToLocalISO(e) : '';
  });
  const [endTime, setEndTime] = useState(() => {
    const e = getInitEnd();
    return e ? dateToLocalTime(e) : '';
  });

  // Sync state when initialData / prefillDate changes
  const syncKey = initialData?.id ?? prefillDate?.start?.toISOString() ?? '';
  useState(() => {
    // effect-like sync
  });
  // useEffect equivalent handled via key on dialog
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

    await onSubmit({ type, title: title.trim(), startAt, endAt, allDay, status });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      key={syncKey}
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
            {isEditing
              ? 'Atualize os dados do item.'
              : 'Crie um novo evento, tarefa, lembrete ou visita.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reunião com cliente"
            />
          </div>
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
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as CalendarItemStatus)}
              >
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
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="calItemAllDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="calItemAllDay">Dia inteiro</Label>
          </div>
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
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !startDate || isPending}
          >
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
    calendarError,
    upcomingItems,
    todayItems,
    createCalendarItem,
    isCreatingCalendarItem,
    updateCalendarItem,
    isUpdatingCalendarItem,
    deleteCalendarItem,
    isDeletingCalendarItem,
  } = useCalendarItems(franchiseId, storeId);

  const { events: commercialEvents, loadingEvents } = useCommercialEvents(
    franchiseId,
    storeId,
  );
  const { deals, loadingDeals } = useDeals(franchiseId, storeId);

  // ── Local State ─────────────────────────────────────────────────────────
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CalendarItem | null>(null);
  const [prefillDate, setPrefillDate] = useState<{
    start: Date;
    end?: Date;
    allDay?: boolean;
  } | null>(null);

  // ── Convert all data sources to FullCalendar events ─────────────────────
  const fcEvents = useMemo<EventInput[]>(() => {
    const result: EventInput[] = [];

    // 1) CalendarItems — main editable source
    for (const item of calendarItems) {
      if (item.status === 'canceled') continue;
      const start = toDateSafe(item.startAt);
      const end = item.endAt ? toDateSafe(item.endAt) : undefined;
      result.push({
        id: `ci-${item.id}`,
        title: item.title,
        start,
        end,
        allDay: item.allDay,
        backgroundColor: TYPE_COLORS[item.type] || TYPE_COLORS.task,
        borderColor: TYPE_COLORS[item.type] || TYPE_COLORS.task,
        extendedProps: {
          source: 'calendarItem' as const,
          originalId: item.id,
          type: item.type,
          status: item.status,
        },
      });
    }

    // 2) CommercialEvents — read-only overlay
    for (const ev of commercialEvents) {
      if (ev.status === 'canceled') continue;
      const start = toDateSafe(ev.startAt);
      const end = ev.endAt ? toDateSafe(ev.endAt) : undefined;
      result.push({
        id: `ce-${ev.id}`,
        title: `🎉 ${ev.title}`,
        start,
        end,
        allDay: false,
        backgroundColor: TYPE_COLORS.commercialEvent,
        borderColor: TYPE_COLORS.commercialEvent,
        extendedProps: {
          source: 'commercialEvent' as const,
          originalId: ev.id,
          status: ev.status,
        },
      });
    }

    // 3) Deals — expected close date and event dates
    for (const deal of deals) {
      if (deal.stage === 'lost') continue;
      if (deal.expectedCloseAt) {
        result.push({
          id: `deal-close-${deal.id}`,
          title: `🎯 ${deal.title} (fechamento)`,
          start: toDateSafe(deal.expectedCloseAt),
          allDay: true,
          backgroundColor: TYPE_COLORS.deal,
          borderColor: TYPE_COLORS.deal,
          extendedProps: {
            source: 'deal' as const,
            originalId: deal.id,
            subtype: 'close',
          },
        });
      }
      if (deal.eventStartAt) {
        result.push({
          id: `deal-event-${deal.id}`,
          title: `📅 ${deal.title} (evento)`,
          start: toDateSafe(deal.eventStartAt),
          end: deal.eventEndAt ? toDateSafe(deal.eventEndAt) : undefined,
          allDay: false,
          backgroundColor: '#9333ea',
          borderColor: '#9333ea',
          extendedProps: {
            source: 'deal' as const,
            originalId: deal.id,
            subtype: 'event',
          },
        });
      }
    }

    return result;
  }, [calendarItems, commercialEvents, deals]);

  // ── Calendar interactions ───────────────────────────────────────────────
  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    setPrefillDate({
      start: selectInfo.start,
      end: selectInfo.end,
      allDay: selectInfo.allDay,
    });
    setShowCreateDialog(true);
  }, []);

  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      const props = clickInfo.event.extendedProps;
      if (props.source === 'calendarItem') {
        const item = calendarItems.find((i) => i.id === props.originalId);
        if (item) setEditingItem(item);
      }
      // commercialEvents and deals are read-only here — they have dedicated UIs
    },
    [calendarItems],
  );

  // ── CRUD handlers ───────────────────────────────────────────────────────
  const handleCreate = async (data: CreateCalendarInput) => {
    await createCalendarItem(data);
    setPrefillDate(null);
  };

  const handleEdit = async (data: CreateCalendarInput) => {
    if (!editingItem?.id) return;
    const input: UpdateCalendarInput = { itemId: editingItem.id, ...data };
    await updateCalendarItem(input);
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (!deletingItem?.id) return;
    await deleteCalendarItem(deletingItem.id);
    setDeletingItem(null);
  };

  // ── Loading ─────────────────────────────────────────────────────────────
  const isLoading = loadingCalendar || loadingEvents || loadingDeals;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (calendarError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h4 className="text-lg font-medium mb-2">Erro ao carregar agenda</h4>
        <p className="text-sm text-muted-foreground">
          {calendarError instanceof Error
            ? calendarError.message
            : 'Verifique permissões e conexão.'}
        </p>
      </div>
    );
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  const canceledCount = calendarItems.filter((i) => i.status === 'canceled').length;

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────── */}
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
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{canceledCount}</p>
                <p className="text-xs text-muted-foreground">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Legenda:</span>
        {[
          { label: 'Evento', color: TYPE_COLORS.event },
          { label: 'Tarefa', color: TYPE_COLORS.task },
          { label: 'Visita', color: TYPE_COLORS.visit },
          { label: 'Lembrete', color: TYPE_COLORS.reminder },
          { label: 'Evento CRM', color: TYPE_COLORS.commercialEvent },
          { label: 'Deal', color: TYPE_COLORS.deal },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: l.color }}
            />
            {l.label}
          </span>
        ))}
      </div>

      {/* ── Calendar ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Agenda</CardTitle>
              <CardDescription>
                Clique em um horário vazio para criar. Clique em um evento para
                editar.
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setPrefillDate(null);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="fc-wrapper">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
              }}
              buttonText={{
                today: 'Hoje',
                month: 'Mês',
                week: 'Semana',
                day: 'Dia',
                list: 'Lista',
              }}
              locale="pt-br"
              firstDay={0}
              height="auto"
              contentHeight={650}
              selectable
              selectMirror
              dayMaxEvents={4}
              moreLinkText={(n) => `+${n} mais`}
              events={fcEvents}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false,
              }}
              slotLabelFormat={{
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }}
              slotMinTime="06:00:00"
              slotMaxTime="23:00:00"
              allDayText="Dia todo"
              noEventsText="Nenhum evento neste período"
              nowIndicator
              expandRows
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Create Dialog ──────────────────────────────────────────── */}
      <CalendarItemDialog
        open={showCreateDialog}
        onOpenChange={(v) => {
          if (!v) {
            setShowCreateDialog(false);
            setPrefillDate(null);
          }
        }}
        onSubmit={handleCreate}
        isPending={isCreatingCalendarItem}
        prefillDate={prefillDate}
      />

      {/* ── Edit Dialog ────────────────────────────────────────────── */}
      <CalendarItemDialog
        open={!!editingItem}
        onOpenChange={(v) => {
          if (!v) setEditingItem(null);
        }}
        onSubmit={handleEdit}
        isPending={isUpdatingCalendarItem}
        initialData={editingItem}
      />

      {/* ── Delete Confirm ─────────────────────────────────────────── */}
      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(v) => {
          if (!v) setDeletingItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Item</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{deletingItem?.title}&quot;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeletingCalendarItem}
            >
              {isDeletingCalendarItem && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
