/**
 * ============================================================================
 * StoreWastageTab — Perdas (Wastage Tracking + KPIs)
 * ============================================================================
 *
 * Tab para registrar e monitorar perdas de chopp:
 * - KPI cards (total ml, eventos, por tipo)
 * - Formulario para registrar nova perda
 * - Lista de eventos com filtro por tipo
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
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
  AlertTriangle,
  Droplets,
  TrendingDown,
  Hash,
} from 'lucide-react';
import { useWastage, type WastageType, type CreateWastageInput } from '@/hooks/useWastage';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

interface StoreWastageTabProps {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WASTAGE_TYPE_MAP: Record<WastageType, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  foam: { label: 'Espuma', variant: 'secondary' },
  purge: { label: 'Purga', variant: 'outline' },
  spill: { label: 'Derrame', variant: 'destructive' },
  other: { label: 'Outro', variant: 'outline' },
  auto: { label: 'Automatico', variant: 'default' },
};

function WastageTypeBadge({ type }: { type: WastageType }) {
  const config = WASTAGE_TYPE_MAP[type] || { label: type, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
  return `${Math.round(ml)}ml`;
}

// ============================================================================
// CREATE WASTAGE DIALOG
// ============================================================================

function CreateWastageDialog({
  open,
  onOpenChange,
  taps,
  getKegForTap,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taps: string[];
  getKegForTap: (tapId: string) => { kegId: string; batchCode: string } | null;
  onSubmit: (data: CreateWastageInput) => Promise<unknown>;
  isPending: boolean;
}) {
  const [type, setType] = useState<WastageType>('foam');
  const [tapId, setTapId] = useState('');
  const [mlLost, setMlLost] = useState('');
  const [reason, setReason] = useState('');

  const selectedKeg = tapId ? getKegForTap(tapId) : null;

  const reset = () => {
    setType('foam');
    setTapId('');
    setMlLost('');
    setReason('');
  };

  const handleSubmit = async () => {
    if (!tapId || !mlLost || Number(mlLost) <= 0) return;
    await onSubmit({
      type,
      tapId,
      kegId: selectedKeg?.kegId || null,
      mlLost: Number(mlLost),
      reason: reason || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Perda</DialogTitle>
          <DialogDescription>Registre uma perda de chopp (espuma, purga, derrame, etc).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as WastageType)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de perda..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="foam">Espuma</SelectItem>
                <SelectItem value="purge">Purga de linha</SelectItem>
                <SelectItem value="spill">Derrame</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Torneira *</Label>
            <Select value={tapId} onValueChange={setTapId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a torneira..." />
              </SelectTrigger>
              <SelectContent>
                {taps.map((t) => {
                  const keg = getKegForTap(t);
                  return (
                    <SelectItem key={t} value={t}>
                      Torneira {Number(t) + 1}
                      {keg ? ` (${keg.batchCode || keg.kegId.slice(0, 8)})` : ' (sem barril)'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedKeg && (
            <div className="p-2 bg-gray-50 rounded text-xs text-gray-600">
              Barril: {selectedKeg.batchCode || selectedKeg.kegId.slice(0, 8)}
            </div>
          )}

          <div className="space-y-2">
            <Label>Quantidade (ml) *</Label>
            <Input
              type="number"
              min={1}
              step={50}
              value={mlLost}
              onChange={(e) => setMlLost(e.target.value)}
              placeholder="Ex: 500"
            />
          </div>

          <div className="space-y-2">
            <Label>Motivo / Observacao</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo da perda..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!tapId || !mlLost || Number(mlLost) <= 0 || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
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

export function StoreWastageTab({ franchiseId, storeId }: StoreWastageTabProps) {
  const {
    events,
    loadingEvents,
    kpis,
    getKegForTap,
    createWastage,
    isCreating,
  } = useWastage(franchiseId, storeId);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | WastageType>('all');

  const { data: maxTaps = 4 } = useQuery({
    queryKey: ['store-max-taps', franchiseId, storeId],
    queryFn: async () => {
      const storeRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
      const storeSnapshot = await getDoc(storeRef);

      if (!storeSnapshot.exists()) return 4;

      const data = storeSnapshot.data() as Record<string, unknown>;
      const settings = (data.settings as Record<string, unknown> | undefined) || {};
      const explicitMaxTaps = Number(data.maxTaps);
      const settingsMaxTaps = Number(settings.maxTaps);
      const configuredTapCount = Array.isArray(data.taps) ? data.taps.length : 0;

      const candidates = [explicitMaxTaps, settingsMaxTaps, configuredTapCount, 4];
      const resolvedTapCount = candidates.find((value) => Number.isFinite(value) && value > 0) ?? 4;

      return Math.min(32, Math.max(1, Math.trunc(resolvedTapCount)));
    },
    enabled: !!franchiseId && !!storeId,
  });

  const tapIds = useMemo(
    () => Array.from({ length: maxTaps }, (_, index) => String(index)),
    [maxTaps],
  );

  const filteredEvents = typeFilter === 'all'
    ? events
    : events.filter((e) => e.type === typeFilter);

  if (loadingEvents) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── KPI CARDS (last 30 days) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={cn(kpis.totalMl > 0 && 'border-red-200')}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Droplets className="h-4 w-4 text-red-500" />
              <p className="text-sm text-gray-500">Total Perdido</p>
            </div>
            <p className={cn('text-2xl font-bold', kpis.totalMl > 0 && 'text-red-600')}>
              {formatMl(kpis.totalMl)}
            </p>
            <p className="text-xs text-gray-400">Ultimos 30 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="h-4 w-4 text-gray-500" />
              <p className="text-sm text-gray-500">Eventos</p>
            </div>
            <p className="text-2xl font-bold">{kpis.totalEvents}</p>
            <p className="text-xs text-gray-400">Ultimos 30 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-yellow-500" />
              <p className="text-sm text-gray-500">Espuma</p>
            </div>
            <p className="text-2xl font-bold">
              {formatMl(kpis.byType['foam']?.ml || 0)}
            </p>
            <p className="text-xs text-gray-400">{kpis.byType['foam']?.count || 0} eventos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <p className="text-sm text-gray-500">Derrame</p>
            </div>
            <p className="text-2xl font-bold">
              {formatMl(kpis.byType['spill']?.ml || 0)}
            </p>
            <p className="text-xs text-gray-400">{kpis.byType['spill']?.count || 0} eventos</p>
          </CardContent>
        </Card>
      </div>

      {/* ── EVENTS LIST ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Perdas
              </CardTitle>
              <CardDescription>
                {events.length} eventos registrados
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Registrar Perda
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter */}
          <div className="flex gap-4">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="foam">Espuma</SelectItem>
                <SelectItem value="purge">Purga</SelectItem>
                <SelectItem value="spill">Derrame</SelectItem>
                <SelectItem value="auto">Automatico</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>{events.length === 0 ? 'Nenhuma perda registrada' : 'Nenhuma perda encontrada'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tap</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm">
                      {event.createdAt.toLocaleDateString('pt-BR')}{' '}
                      <span className="text-gray-400">
                        {event.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <WastageTypeBadge type={event.type} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        T{Number(event.tapId) + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-red-600">
                      {formatMl(event.mlLost)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {event.source === 'auto' ? 'Sistema' : 'Manual'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                      {event.reason || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── DIALOG ────────────────────────────────────────────────────────── */}
      <CreateWastageDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        taps={tapIds}
        getKegForTap={getKegForTap}
        onSubmit={createWastage}
        isPending={isCreating}
      />
    </div>
  );
}
