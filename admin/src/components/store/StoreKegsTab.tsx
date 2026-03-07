/**
 * ============================================================================
 * StoreKegsTab — Barris (Kegs) + Tap Assignment
 * ============================================================================
 *
 * Tab completa para gerenciar barris de chopp:
 * - Listar barris com filtros e status badges
 * - Cadastrar novo barril
 * - Conectar/desconectar barril a torneira
 * - Marcar barril como devolvido/vazio
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Loader2,
  Plus,
  Search,
  Filter,
  X,
  MoreVertical,
  Link2,
  Unlink,
  Package,
  AlertTriangle,
  Beer,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useKegs, type CreateKegInput } from '@/hooks/useKegs';
import { useTapAssignments } from '@/hooks/useTapAssignments';
import { useTapsRealtime } from '@/hooks/useTapsRealtime';
import { cn } from '@/lib/utils';
import type { KegStatus } from '@shared/types/operations';

// ============================================================================
// TYPES
// ============================================================================

interface StoreKegsTabProps {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// STATUS BADGE HELPER
// ============================================================================

const KEG_STATUS_MAP: Record<KegStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  in_stock: { label: 'Estoque', variant: 'secondary' },
  tapped: { label: 'Ativo', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  depleted: { label: 'Vazio', variant: 'destructive' },
  returned: { label: 'Devolvido', variant: 'outline' },
};

function KegStatusBadge({ status }: { status: KegStatus }) {
  const config = KEG_STATUS_MAP[status] || { label: status, variant: 'outline' as const };
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}

// ============================================================================
// CREATE KEG DIALOG
// ============================================================================

function CreateKegDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Array<{ id: string; title: string }>;
  onSubmit: (data: CreateKegInput) => Promise<unknown>;
  isPending: boolean;
}) {
  const [productId, setProductId] = useState('');
  const [volumeMl, setVolumeMl] = useState(30000);
  const [batchCode, setBatchCode] = useState('');
  const [cost, setCost] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const reset = () => {
    setProductId('');
    setVolumeMl(30000);
    setBatchCode('');
    setCost('');
    setExpiresAt('');
  };

  const handleSubmit = async () => {
    if (!productId || volumeMl <= 0) return;
    await onSubmit({
      productId,
      volumeMl,
      batchCode: batchCode || undefined,
      cost: cost ? parseFloat(cost) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Barril</DialogTitle>
          <DialogDescription>Cadastre um novo barril de chopp no estoque.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Volume (ml) *</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                value={volumeMl}
                onChange={(e) => setVolumeMl(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">{(volumeMl / 1000).toFixed(0)}L</p>
            </div>
            <div className="space-y-2">
              <Label>Custo (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Lote</Label>
              <Input
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                placeholder="Ex: L2401"
              />
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!productId || volumeMl <= 0 || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// CONNECT TAP DIALOG
// ============================================================================

function ConnectTapDialog({
  open,
  onOpenChange,
  kegId,
  kegProductId,
  kegLabel,
  taps,
  getActiveAssignment,
  getProductTitle,
  onConnect,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kegId: string;
  kegProductId: string;
  kegLabel: string;
  taps: Array<{ tapId: string; status: string; currentKegId: string | null }>;
  getActiveAssignment: (tapId: string) => { kegId: string } | undefined;
  getProductTitle: (productId: string) => string;
  onConnect: (params: { tapId: string; kegId: string; productId: string }) => Promise<unknown>;
  isPending: boolean;
}) {
  const [selectedTapId, setSelectedTapId] = useState('');

  const selectedTapAssignment = selectedTapId ? getActiveAssignment(selectedTapId) : undefined;

  const handleConnect = async () => {
    if (!selectedTapId) return;
    await onConnect({ tapId: selectedTapId, kegId, productId: kegProductId });
    setSelectedTapId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSelectedTapId(''); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar a Torneira</DialogTitle>
          <DialogDescription>
            Conectar barril <strong>{kegLabel}</strong> ({getProductTitle(kegProductId)})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Torneira</Label>
            <Select value={selectedTapId} onValueChange={setSelectedTapId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a torneira..." />
              </SelectTrigger>
              <SelectContent>
                {taps.map((tap) => {
                  const assignment = getActiveAssignment(tap.tapId);
                  return (
                    <SelectItem key={tap.tapId} value={tap.tapId}>
                      Torneira {Number(tap.tapId) + 1}
                      {assignment ? ` (ocupada)` : ' (livre)'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedTapAssignment && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Torneira ocupada</span>
              </div>
              <p className="text-sm text-yellow-600 mt-1">
                O barril atual sera desconectado automaticamente e marcado como vazio.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setSelectedTapId(''); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleConnect} disabled={!selectedTapId || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoreKegsTab({ franchiseId, storeId }: StoreKegsTabProps) {
  // Hooks
  const {
    kegs,
    loadingKegs,
    products,
    inStockKegs,
    tappedKegs,
    getProductTitle,
    createKeg,
    isCreatingKeg,
    updateKegStatus,
    deleteKeg,
    isDeletingKeg,
  } = useKegs(franchiseId, storeId);

  // Real-time taps — shared source of truth for tap status
  const {
    taps: realtimeTaps,
    loading: loadingRealtimeTaps,
  } = useTapsRealtime(franchiseId, storeId);

  // Mutations only (connect/disconnect) — still need useTapAssignments for write operations
  const {
    connect,
    isConnecting,
    disconnect,
    isDisconnecting,
  } = useTapAssignments(franchiseId, storeId);

  // Local state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [connectKeg, setConnectKeg] = useState<{ kegId: string; productId: string; label: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KegStatus>('all');
  const [deletingKegId, setDeletingKegId] = useState<string | null>(null);

  // Derived
  const depletedKegs = kegs.filter((k) => k.status === 'depleted');
  const filteredKegs = kegs.filter((keg) => {
    const matchesSearch =
      getProductTitle(keg.productId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (keg.batchCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      keg.kegId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || keg.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDisconnect = async (tapId: string, reason: string) => {
    try {
      await disconnect({ tapId, reason });
    } catch {
      // toast already handled in hook
    }
  };

  const handleMarkReturned = (kegId: string) => {
    updateKegStatus({ kegId, status: 'returned' });
  };

  /** Derive which tap a keg is on, using real-time tap.currentKegId (canonical) */
  const getKegTapId = (kegId: string): string | undefined =>
    realtimeTaps.find((t) => t.currentKegId === kegId)?.tapId;

  const isLoading = loadingKegs || loadingRealtimeTaps;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── SUMMARY CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{kegs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-green-600">Ativos (Tap)</p>
            <p className="text-2xl font-bold text-green-700">{tappedKegs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Estoque</p>
            <p className="text-2xl font-bold">{inStockKegs.length}</p>
          </CardContent>
        </Card>
        <Card className={cn(depletedKegs.length > 0 && 'border-red-200')}>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Vazios</p>
            <p className={cn('text-2xl font-bold', depletedKegs.length > 0 && 'text-red-600')}>
              {depletedKegs.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── TAP STATUS CARDS ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Beer className="h-5 w-5 mr-2" />
            Torneiras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {realtimeTaps.map((tap) => {
              // Canonical: derive keg from tap.currentKegId (same source as OperationsTab)
              const keg = tap.currentKegId
                ? kegs.find((k) => k.kegId === tap.currentKegId)
                : null;
              const isActive = !!tap.currentKegId && !!keg;
              const isInconsistent = !!tap.currentKegId && !keg;
              const pctRemaining = keg ? Math.round((keg.remainingMl / keg.volumeMl) * 100) : 0;

              return (
                <div
                  key={tap.tapId}
                  className={cn(
                    'p-3 border rounded-lg',
                    isInconsistent ? 'border-yellow-400 bg-yellow-50' :
                    isActive ? 'border-green-200 bg-green-50' : 'border-border bg-muted'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">T{Number(tap.tapId) + 1}</span>
                    <Badge
                      variant={isActive ? 'default' : isInconsistent ? 'destructive' : 'secondary'}
                      className={cn(isActive && 'bg-green-600 hover:bg-green-700', 'text-xs')}
                    >
                      {isInconsistent ? 'Inconsistente' : isActive ? 'Ativo' : 'Livre'}
                    </Badge>
                  </div>
                  {isInconsistent && (
                    <div className="flex items-center gap-1 text-yellow-700 text-xs mb-1">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Barril {tap.currentKegId?.slice(0, 8)} nao encontrado</span>
                    </div>
                  )}
                  {keg ? (
                    <>
                      <p className="text-xs text-muted-foreground truncate">{getProductTitle(keg.productId)}</p>
                      <p className="text-xs text-muted-foreground">{keg.batchCode || keg.kegId.slice(0, 8)}</p>
                      <div className="mt-2">
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={cn(
                              'h-2 rounded-full transition-all',
                              pctRemaining > 30 ? 'bg-green-500' : pctRemaining > 15 ? 'bg-yellow-500' : 'bg-red-500'
                            )}
                            style={{ width: `${pctRemaining}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(keg.remainingMl / 1000).toFixed(1)}L / {(keg.volumeMl / 1000).toFixed(0)}L ({pctRemaining}%)
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => handleDisconnect(tap.tapId, 'manual')}
                        disabled={isDisconnecting}
                      >
                        <Unlink className="h-3 w-3 mr-1" />
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Sem barril</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── KEG LIST ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <Package className="h-5 w-5 mr-2" />
                Barris
              </CardTitle>
              <CardDescription>
                {kegs.length} barris cadastrados
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Barril
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por produto, lote..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="in_stock">Estoque</SelectItem>
                <SelectItem value="tapped">Ativo</SelectItem>
                <SelectItem value="depleted">Vazio</SelectItem>
                <SelectItem value="returned">Devolvido</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
              disabled={!searchTerm && statusFilter === 'all'}
            >
              <X className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </div>

          {/* Table */}
          {filteredKegs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>{kegs.length === 0 ? 'Nenhum barril cadastrado' : 'Nenhum barril encontrado'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Restante</TableHead>
                  <TableHead>Tap</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKegs.map((keg) => {
                  const pct = Math.round((keg.remainingMl / keg.volumeMl) * 100);
                  const tapId = getKegTapId(keg.kegId);
                  const isExpiring =
                    keg.expiresAt && keg.expiresAt.getTime() < Date.now() + 3 * 24 * 60 * 60 * 1000;

                  return (
                    <TableRow key={keg.kegId}>
                      <TableCell className="font-medium">
                        {getProductTitle(keg.productId)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {keg.batchCode || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(keg.volumeMl / 1000).toFixed(0)}L
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div
                              className={cn(
                                'h-1.5 rounded-full',
                                pct > 30 ? 'bg-green-500' : pct > 15 ? 'bg-yellow-500' : 'bg-red-500'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {(keg.remainingMl / 1000).toFixed(1)}L
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tapId != null ? (
                          <Badge variant="outline" className="text-xs">
                            T{Number(tapId) + 1}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <KegStatusBadge status={keg.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {keg.expiresAt ? (
                          <span className={cn(isExpiring && 'text-red-600 font-medium')}>
                            {keg.expiresAt.toLocaleDateString('pt-BR')}
                            {isExpiring && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {keg.status === 'in_stock' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConnectKeg({
                                    kegId: keg.kegId,
                                    productId: keg.productId,
                                    label: keg.batchCode || keg.kegId.slice(0, 8),
                                  })
                                }
                              >
                                <Link2 className="h-4 w-4 mr-2" />
                                Conectar a Torneira
                              </DropdownMenuItem>
                            )}
                            {keg.status === 'tapped' && tapId != null && (
                              <DropdownMenuItem
                                onClick={() => handleDisconnect(tapId, 'manual')}
                              >
                                <Unlink className="h-4 w-4 mr-2" />
                                Desconectar
                              </DropdownMenuItem>
                            )}
                            {(keg.status === 'depleted' || keg.status === 'in_stock') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleMarkReturned(keg.kegId)}>
                                  Marcar como Devolvido
                                </DropdownMenuItem>
                              </>
                            )}
                            {keg.status === 'returned' && (
                              <>
                                <DropdownMenuItem onClick={() => updateKegStatus({ kegId: keg.kegId, status: 'in_stock' })}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Voltar ao Estoque
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeletingKegId(keg.kegId)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir Barril
                                </DropdownMenuItem>
                              </>
                            )}
                            {keg.status === 'depleted' && (
                              <DropdownMenuItem onClick={() => updateKegStatus({ kegId: keg.kegId, status: 'in_stock' })}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Voltar ao Estoque
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      {/* ── DIALOGS ────────────────────────────────────────────────────── */}

      <CreateKegDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        products={products}
        onSubmit={createKeg}
        isPending={isCreatingKeg}
      />

      {/* ── Delete Confirmation Dialog ──────────────────────────── */}
      <AlertDialog open={!!deletingKegId} onOpenChange={(v) => { if (!v) setDeletingKegId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Barril</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este barril? O registro será removido permanentemente, incluindo todo o histórico de dispensação vinculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletingKegId) {
                  await deleteKeg(deletingKegId);
                  setDeletingKegId(null);
                }
              }}
              disabled={isDeletingKeg}
            >
              {isDeletingKeg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {connectKeg && (
        <ConnectTapDialog
          open={!!connectKeg}
          onOpenChange={(v) => { if (!v) setConnectKeg(null); }}
          kegId={connectKeg.kegId}
          kegProductId={connectKeg.productId}
          kegLabel={connectKeg.label}
          taps={realtimeTaps.map((t) => ({
            tapId: t.tapId,
            status: t.status,
            currentKegId: t.currentKegId,
          }))}
          getActiveAssignment={(tapId) => {
            // Derive from canonical tap.currentKegId (not tapAssignments)
            const tap = realtimeTaps.find((t) => t.tapId === tapId);
            return tap?.currentKegId ? { kegId: tap.currentKegId } : undefined;
          }}
          getProductTitle={getProductTitle}
          onConnect={connect}
          isPending={isConnecting}
        />
      )}
    </div>
  );
}
