/**
 * ============================================================================
 * StoreMaintenanceTab — Manutenção (Scheduling + Tracking)
 * ============================================================================
 *
 * Tab para agendar e acompanhar manutencoes:
 * - Alertas de manutencao atrasada/proxima
 * - Formulario para agendar nova manutencao
 * - Completar/cancelar manutencao existente
 * - Historico com filtros
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Plus,
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Calendar,
} from 'lucide-react';
import {
  useMaintenance,
  type MaintenanceType,
  type MaintenanceStatus,
  type CreateMaintenanceInput,
} from '@/hooks/useMaintenance';
import { useMaxTaps } from '@/hooks/useMaxTaps';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface StoreMaintenanceTabProps {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  cleaning: 'Limpeza',
  calibration: 'Calibração',
  repair: 'Reparo',
  inspection: 'Inspecao',
  other: 'Outro',
};

const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle }> = {
  scheduled: { label: 'Agendado', variant: 'secondary', icon: Clock },
  overdue: { label: 'Atrasado', variant: 'destructive', icon: AlertTriangle },
  completed: { label: 'Concluido', variant: 'default', icon: CheckCircle },
  canceled: { label: 'Cancelado', variant: 'outline', icon: XCircle },
};

function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const config = STATUS_CONFIG[status] || { label: status, variant: 'outline' as const, icon: Clock };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={cn(status === 'completed' && 'bg-green-600 hover:bg-green-700')}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

// ============================================================================
// SCHEDULE DIALOG
// ============================================================================

function ScheduleDialog({
  open,
  onOpenChange,
  tapIds,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tapIds: string[];
  onSubmit: (data: CreateMaintenanceInput) => Promise<unknown>;
  isPending: boolean;
}) {
  const [type, setType] = useState<MaintenanceType>('cleaning');
  const [tapId, setTapId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setType('cleaning');
    setTapId('');
    setScheduledDate('');
    setNotes('');
  };

  const handleSubmit = async () => {
    await onSubmit({
      type,
      tapId: tapId || undefined,
      scheduledAt: scheduledDate ? new Date(scheduledDate) : undefined,
      notes: notes || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar Manutenção</DialogTitle>
          <DialogDescription>Agende uma limpeza, calibração, reparo ou inspecao.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as MaintenanceType)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cleaning">Limpeza</SelectItem>
                <SelectItem value="calibration">Calibração</SelectItem>
                <SelectItem value="repair">Reparo</SelectItem>
                <SelectItem value="inspection">Inspecao</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Torneira (opcional)</Label>
            <Select value={tapId} onValueChange={setTapId}>
              <SelectTrigger>
                <SelectValue placeholder="Todas / Geral" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Geral (todas)</SelectItem>
                {tapIds.map((tapIdOption) => (
                  <SelectItem key={tapIdOption} value={tapIdOption}>
                    Torneira {Number(tapIdOption) + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data agendada</Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observacoes..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// COMPLETE DIALOG
// ============================================================================

function CompleteDialog({
  open,
  onOpenChange,
  logId,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logId: string;
  onSubmit: (input: { logId: string; durationMinutes?: number; notes?: string }) => Promise<unknown>;
  isPending: boolean;
}) {
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => { setDuration(''); setNotes(''); };

  const handleSubmit = async () => {
    await onSubmit({
      logId,
      durationMinutes: duration ? Number(duration) : undefined,
      notes: notes || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir Manutenção</DialogTitle>
          <DialogDescription>Registre a conclusao da manutencao.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Duração (minutos)</Label>
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Ex: 30"
            />
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observacoes da execucao..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoreMaintenanceTab({ franchiseId, storeId }: StoreMaintenanceTabProps) {
  const {
    logs,
    loadingLogs,
    overdueLogs,
    schedule,
    isScheduling,
    complete,
    isCompleting,
    cancel,
    isCanceling,
  } = useMaintenance(franchiseId, storeId);

  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [completeLogId, setCompleteLogId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceStatus>('all');

  const { tapIds } = useMaxTaps(franchiseId, storeId);

  const filteredLogs = statusFilter === 'all'
    ? logs
    : logs.filter((l) => l.status === statusFilter);

  const handleCancel = async (logId: string) => {
    try {
      await cancel(logId);
    } catch {
      // toast handled in hook
    }
  };

  if (loadingLogs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── OVERDUE ALERTS ─────────────────────────────────────────────── */}
      {overdueLogs.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-red-700 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Manutencoes Atrasadas ({overdueLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-2 bg-white rounded border border-red-200">
                <div>
                  <span className="text-sm font-medium">
                    {MAINTENANCE_TYPE_LABELS[log.type]}
                    {log.tapId && log.tapId !== 'all' ? ` — T${Number(log.tapId) + 1}` : ' — Geral'}
                  </span>
                  {log.scheduledAt && (
                    <span className="text-xs text-red-600 ml-2">
                      Agendado: {log.scheduledAt.toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setCompleteLogId(log.id)}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Completar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── SUMMARY CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{logs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Agendadas</p>
            <p className="text-2xl font-bold">
              {logs.filter((l) => l.status === 'scheduled').length}
            </p>
          </CardContent>
        </Card>
        <Card className={cn(overdueLogs.length > 0 && 'border-red-200')}>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-red-500">Atrasadas</p>
            <p className={cn('text-2xl font-bold', overdueLogs.length > 0 && 'text-red-600')}>
              {overdueLogs.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-green-600">Concluidas</p>
            <p className="text-2xl font-bold text-green-700">
              {logs.filter((l) => l.status === 'completed').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── MAINTENANCE LIST ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <Wrench className="h-5 w-5 mr-2" />
                Manutenção
              </CardTitle>
              <CardDescription>
                Historico de limpezas, calibracoes e reparos
              </CardDescription>
            </div>
            <Button onClick={() => setShowScheduleDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Agendar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter */}
          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="scheduled">Agendado</SelectItem>
                <SelectItem value="overdue">Atrasado</SelectItem>
                <SelectItem value="completed">Concluido</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>{logs.length === 0 ? 'Nenhuma manutencao registrada' : 'Nenhuma manutencao encontrada'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tap</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agendado</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-24">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {log.createdAt.toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {MAINTENANCE_TYPE_LABELS[log.type]}
                    </TableCell>
                    <TableCell>
                      {log.tapId && log.tapId !== 'all' ? (
                        <Badge variant="outline" className="text-xs">
                          T{Number(log.tapId) + 1}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Geral</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MaintenanceStatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.scheduledAt ? log.scheduledAt.toLocaleDateString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.durationMinutes ? `${log.durationMinutes}min` : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {log.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(log.status === 'scheduled' || log.status === 'overdue') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-green-600"
                              onClick={() => setCompleteLogId(log.id)}
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground"
                              onClick={() => handleCancel(log.id)}
                              disabled={isCanceling}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── DIALOGS ────────────────────────────────────────────────────── */}
      <ScheduleDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        tapIds={tapIds}
        onSubmit={schedule}
        isPending={isScheduling}
      />

      {completeLogId && (
        <CompleteDialog
          open={!!completeLogId}
          onOpenChange={(v) => { if (!v) setCompleteLogId(null); }}
          logId={completeLogId}
          onSubmit={complete}
          isPending={isCompleting}
        />
      )}
    </div>
  );
}
