/**
 * ============================================================================
 * CommercialActivitiesTab — Atividades CRM (global)
 * ============================================================================
 *
 * Lista global de atividades (call, whatsapp, email, visit, task) de todos
 * os deals da loja. Summary cards + tabela + create dialog + delete confirm.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo, useCallback } from 'react';
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
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  CheckSquare,
  Plus,
  Search,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Activity as ActivityIcon,
} from 'lucide-react';
import {
  useActivities,
  type CreateActivityInput,
} from '@/hooks/useActivities';
import { useDeals } from '@/hooks/useDeals';
import type { Activity, ActivityType, ActivityStatus } from '@/types/commercial';
import { Timestamp } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_CONFIG: Record<ActivityType, { label: string; icon: LucideIcon; color: string }> = {
  call: { label: 'Ligação', icon: Phone, color: 'text-blue-600' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600' },
  email: { label: 'E-mail', icon: Mail, color: 'text-purple-600' },
  visit: { label: 'Visita', icon: MapPin, color: 'text-orange-600' },
  task: { label: 'Tarefa', icon: CheckSquare, color: 'text-gray-600' },
};

const STATUS_CONFIG: Record<ActivityStatus, { label: string; color: string }> = {
  open: { label: 'Aberta', color: 'bg-blue-100 text-blue-700' },
  done: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
  canceled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
};

// ============================================================================
// HELPERS
// ============================================================================

function toDateSafe(ts: Timestamp | undefined | null): Date {
  if (!ts) return new Date();
  return ts instanceof Timestamp ? ts.toDate() : new Date();
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(ts: Timestamp | undefined | null): string {
  return toDateSafe(ts).toLocaleDateString('pt-BR');
}

function isOverdue(activity: Activity & { dealId?: string }): boolean {
  if (activity.status !== 'open') return false;
  const due = activity.dueAt instanceof Timestamp ? activity.dueAt.toMillis() : 0;
  return due > 0 && due < Date.now();
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// CREATE DIALOG
// ============================================================================

function ActivityDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  deals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateActivityInput) => Promise<unknown>;
  isPending: boolean;
  deals: { id?: string; title: string }[];
}) {
  const [dealId, setDealId] = useState('');
  const [type, setType] = useState<ActivityType>('task');
  const [dueAt, setDueAt] = useState(dateStr(new Date()));
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setDealId('');
    setType('task');
    setDueAt(dateStr(new Date()));
    setSummary('');
    setNotes('');
  };

  const canSubmit = !!dealId && !!summary.trim() && !!dueAt;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      dealId,
      type,
      dueAt: new Date(dueAt),
      summary: summary.trim(),
      notes: notes.trim() || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Atividade</DialogTitle>
          <DialogDescription>Agendar ligação, visita, tarefa, etc.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Deal *</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger><SelectValue placeholder="Selecione o deal..." /></SelectTrigger>
              <SelectContent>
                {deals.filter((d) => d.id).map((d) => (
                  <SelectItem key={d.id} value={d.id as string}>{d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_CONFIG) as ActivityType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Resumo *</Label>
            <Input
              placeholder="Ex: Ligar para confirmar data do evento"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Input
              placeholder="Observações (opcional)"
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
            Criar Atividade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommercialActivitiesTab({ franchiseId, storeId }: Props) {
  const {
    activities,
    loadingActivities,
    openActivities,
    doneActivities,
    overdueActivities,
    createActivity,
    isCreatingActivity,
    updateActivity,
    isUpdatingActivity,
    deleteActivity,
    isDeletingActivity,
  } = useActivities(franchiseId, storeId);

  const { deals } = useDeals(franchiseId, storeId);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | ActivityType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | ActivityStatus>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(Activity & { dealId?: string }) | null>(null);

  // ── Deal name lookup ────────────────────────────────────────────────

  const dealMap = useMemo(() => {
    const map = new Map<string, string>();
    deals.forEach((d) => { if (d.id) map.set(d.id, d.title); });
    return map;
  }, [deals]);

  // ── Filtered list ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = activities as (Activity & { dealId?: string })[];
    if (filterType !== 'all') {
      list = list.filter((a) => a.type === filterType);
    }
    if (filterStatus !== 'all') {
      list = list.filter((a) => a.status === filterStatus);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.summary.toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q) ||
          (dealMap.get(a.dealId || '') || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [activities, filterType, filterStatus, search, dealMap]);

  // ── Quick status toggle ────────────────────────────────────────────

  const handleToggleDone = useCallback(async (activity: Activity & { dealId?: string }) => {
    if (!activity.id || !activity.dealId) return;
    if (activity.status === 'open') {
      await updateActivity({
        dealId: activity.dealId,
        activityId: activity.id,
        status: 'done',
        doneAt: new Date(),
      });
    } else if (activity.status === 'done') {
      await updateActivity({
        dealId: activity.dealId,
        activityId: activity.id,
        status: 'open',
      });
    }
  }, [updateActivity]);

  // ── Delete handler ─────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget?.id || !deleteTarget.dealId) return;
    await deleteActivity({ dealId: deleteTarget.dealId, activityId: deleteTarget.id });
    setDeleteTarget(null);
  };

  // ── Loading ────────────────────────────────────────────────────────

  if (loadingActivities) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abertas</CardTitle>
            <ActivityIcon className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openActivities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencidas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueActivities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{doneActivities.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Content Card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Atividades</CardTitle>
              <CardDescription>
                {filtered.length} atividade{filtered.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Atividade
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por resumo, nota, deal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as 'all' | ActivityType)}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos tipos</SelectItem>
                {(Object.keys(TYPE_CONFIG) as ActivityType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as 'all' | ActivityStatus)}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                {(Object.keys(STATUS_CONFIG) as ActivityStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ActivityIcon className="mb-2 h-10 w-10" />
              <p>Nenhuma atividade encontrada</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]" />
                    <TableHead>Tipo</TableHead>
                    <TableHead>Resumo</TableHead>
                    <TableHead>Deal</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((activity) => {
                    const typeConf = TYPE_CONFIG[activity.type];
                    const TypeIcon = typeConf.icon;
                    const overdue = isOverdue(activity);

                    return (
                      <TableRow key={`${activity.dealId}_${activity.id}`} className={overdue ? 'bg-red-50' : undefined}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleToggleDone(activity)}
                            disabled={isUpdatingActivity || activity.status === 'canceled'}
                            title={activity.status === 'done' ? 'Reabrir' : 'Marcar como concluída'}
                          >
                            {activity.status === 'done' ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <TypeIcon className={`h-4 w-4 ${typeConf.color}`} />
                            <span className="text-xs">{typeConf.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[250px] truncate">
                          {activity.summary}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dealMap.get(activity.dealId || '') || activity.dealId?.slice(0, 8) || '—'}
                        </TableCell>
                        <TableCell className={overdue ? 'text-red-600 font-medium' : ''}>
                          {formatDate(activity.dueAt)}
                          {overdue && <span className="ml-1 text-xs">(vencida)</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[activity.status].color}`}>
                            {STATUS_CONFIG[activity.status].label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(activity)}
                            disabled={isDeletingActivity}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ──────────────────────────────────────────── */}
      <ActivityDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={createActivity}
        isPending={isCreatingActivity}
        deals={deals}
      />

      {/* ── Delete Confirmation ────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a atividade <strong>"{deleteTarget?.summary}"</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingActivity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
