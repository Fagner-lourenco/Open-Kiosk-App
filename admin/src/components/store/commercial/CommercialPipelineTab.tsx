/**
 * ============================================================================
 * CommercialPipelineTab — Kanban de Negociações (Pipeline CRM)
 * ============================================================================
 *
 * Board com colunas por estágio: Lead → Qualificação → Proposta → Negociação → Ganho/Perdido
 * Move-se o deal entre colunas via dropdown (sem drag-and-drop externo).
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo, useEffect } from 'react';
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
  Kanban,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  ArrowRight,
  Loader2,
  DollarSign,
  TrendingUp,
  Target,
  User,
} from 'lucide-react';
import { useDeals, type CreateDealInput, type UpdateDealInput } from '@/hooks/useDeals';
import { useCustomers } from '@/hooks/useCustomers';
import type { Deal, DealStage } from '@/types/commercial';
import { DEAL_STAGES, DEAL_STAGE_LABELS } from '@/types/commercial';

// ============================================================================
// CONSTANTS
// ============================================================================

const STAGE_COLORS: Record<DealStage, string> = {
  lead: 'border-t-blue-400',
  qualify: 'border-t-cyan-400',
  proposal: 'border-t-yellow-400',
  negotiation: 'border-t-orange-400',
  won: 'border-t-green-500',
  lost: 'border-t-red-400',
};

const STAGE_BG: Record<DealStage, string> = {
  lead: 'bg-blue-50',
  qualify: 'bg-cyan-50',
  proposal: 'bg-yellow-50',
  negotiation: 'bg-orange-50',
  won: 'bg-green-50',
  lost: 'bg-red-50',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// DEAL DIALOG — Create / Edit
// ============================================================================

function DealDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateDealInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: Deal | null;
  customers: { id?: string; name: string }[];
}) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [customerId, setCustomerId] = useState(initialData?.customerId || '');
  const [stage, setStage] = useState<DealStage>(initialData?.stage || 'lead');
  const [valueEstimate, setValueEstimate] = useState(
    initialData?.valueEstimate?.toString() || ''
  );
  const [probability, setProbability] = useState(
    initialData?.probability?.toString() || ''
  );

  // Sincronizar estado quando initialData muda (edição de deals consecutivos)
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setCustomerId(initialData.customerId || '');
      setStage(initialData.stage || 'lead');
      setValueEstimate(initialData.valueEstimate?.toString() || '');
      setProbability(initialData.probability?.toString() || '');
    }
  }, [initialData]);

  const isEditing = !!initialData;

  const reset = () => {
    setTitle('');
    setCustomerId('');
    setStage('lead');
    setValueEstimate('');
    setProbability('');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !customerId) return;
    await onSubmit({
      title: title.trim(),
      customerId,
      stage,
      valueEstimate: parseFloat(valueEstimate) || 0,
      probability: parseInt(probability, 10) || 0,
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
          <DialogTitle>{isEditing ? 'Editar Negociação' : 'Nova Negociação'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as informações da negociação.'
              : 'Preencha os dados para criar uma nova negociação.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Festa de aniversário - João"
            />
          </div>

          {/* Cliente */}
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

          {/* Estágio */}
          <div className="space-y-2">
            <Label>Estágio</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {DEAL_STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor + Probabilidade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor Estimado (R$)</Label>
              <Input
                value={valueEstimate}
                onChange={(e) => setValueEstimate(e.target.value)}
                placeholder="0,00"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label>Probabilidade (%)</Label>
              <Input
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                placeholder="0"
                type="number"
                min="0"
                max="100"
              />
            </div>
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
          <Button onClick={handleSubmit} disabled={!title.trim() || !customerId || isPending}>
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
// DEAL CARD — individual card in the kanban column
// ============================================================================

function DealCard({
  deal,
  customerName,
  onEdit,
  onDelete,
  onMoveStage,
}: {
  deal: Deal;
  customerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onMoveStage: (stage: DealStage) => void;
}) {
  const otherStages = DEAL_STAGES.filter((s) => s !== deal.stage);

  return (
    <Card className={`border-t-4 ${STAGE_COLORS[deal.stage]}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <p className="font-medium text-sm leading-snug">{deal.title}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {otherStages.map((s) => (
                <DropdownMenuItem key={s} onClick={() => onMoveStage(s)}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Mover para {DEAL_STAGE_LABELS[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          {customerName}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">
            {formatCurrency(deal.valueEstimate)}
          </span>
          {deal.probability > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">
              {deal.probability}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommercialPipelineTab({ franchiseId, storeId }: Props) {
  const {
    deals,
    loadingDeals,
    activeDeals,
    dealsByStage,
    totalPipelineValue,
    weightedPipelineValue,
    createDeal,
    isCreatingDeal,
    updateDeal,
    isUpdatingDeal,
    moveDealStage,
    deleteDeal,
    isDeletingDeal,
  } = useDeals(franchiseId, storeId);

  const { activeCustomers } = useCustomers(franchiseId, storeId);

  // ── Customer lookup map ─────────────────────────────────────────────────
  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    activeCustomers.forEach((c) => {
      if (c.id) map.set(c.id, c.name);
    });
    return map;
  }, [activeCustomers]);

  // ── Estado local ────────────────────────────────────────────────────────
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loadingDeals) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCreate = async (data: CreateDealInput) => {
    await createDeal(data);
  };

  const handleEdit = async (data: CreateDealInput) => {
    if (!editingDeal?.id) return;
    const input: UpdateDealInput = {
      dealId: editingDeal.id,
      ...data,
    };
    await updateDeal(input);
    setEditingDeal(null);
  };

  const handleDelete = async () => {
    if (!deletingDeal?.id) return;
    await deleteDeal(deletingDeal.id);
    setDeletingDeal(null);
  };

  const wonDeals = dealsByStage('won');

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Kanban className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{activeDeals.length}</p>
                <p className="text-xs text-muted-foreground">Em andamento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalPipelineValue)}</p>
                <p className="text-xs text-muted-foreground">Valor Total Pipeline</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(weightedPipelineValue)}</p>
                <p className="text-xs text-muted-foreground">Valor Ponderado</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">
                  {deals.length > 0 ? `${wonDeals.length} / ${deals.length}` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Conversão ({deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Pipeline Header ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>
                Arraste entre estágios usando o menu de cada card
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Negociação
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* ── Kanban Board ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {DEAL_STAGES.map((stage) => {
          const stageDeals = dealsByStage(stage);
          const stageValue = stageDeals.reduce((s, d) => s + d.valueEstimate, 0);
          return (
            <div key={stage} className="space-y-2">
              {/* Column Header */}
              <div className={`rounded-lg p-3 ${STAGE_BG[stage]}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">
                    {DEAL_STAGE_LABELS[stage]}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {stageDeals.length}
                  </Badge>
                </div>
                {stageValue > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(stageValue)}
                  </p>
                )}
              </div>
              {/* Column Cards */}
              <div className="space-y-2 min-h-[100px]">
                {stageDeals.length === 0 ? (
                  <div className="flex items-center justify-center h-[100px] border-2 border-dashed rounded-lg">
                    <p className="text-xs text-muted-foreground">Vazio</p>
                  </div>
                ) : (
                  stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      customerName={customerMap.get(deal.customerId) || 'Cliente não encontrado'}
                      onEdit={() => setEditingDeal(deal)}
                      onDelete={() => setDeletingDeal(deal)}
                      onMoveStage={(newStage) => {
                        if (deal.id) moveDealStage({ dealId: deal.id, stage: newStage });
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Create Dialog ──────────────────────────────────────────────── */}
      <DealDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
        isPending={isCreatingDeal}
        customers={activeCustomers}
      />

      {/* ── Edit Dialog ────────────────────────────────────────────────── */}
      <DealDialog
        open={!!editingDeal}
        onOpenChange={(v) => {
          if (!v) setEditingDeal(null);
        }}
        onSubmit={handleEdit}
        isPending={isUpdatingDeal}
        initialData={editingDeal}
        customers={activeCustomers}
      />

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!deletingDeal}
        onOpenChange={(v) => {
          if (!v) setDeletingDeal(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir negociação?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingDeal?.title}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeletingDeal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingDeal && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
