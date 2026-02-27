/**
 * ============================================================================
 * CommercialPipelineTab — Kanban de Negociações (Pipeline CRM)
 * ============================================================================
 *
 * Board com colunas por estágio: Lead → Qualificação → Proposta → Negociação → Ganho/Perdido
 * Drag-and-drop entre colunas via @dnd-kit + menu dropdown como fallback.
 *
 * @author Open Kiosk Project
 * @version 2.0.0
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
  AlertTriangle,
  Eye,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  CheckSquare,
  CheckCircle,
} from 'lucide-react';
import { useDeals, type CreateDealInput, type UpdateDealInput } from '@/hooks/useDeals';
import { useCustomers } from '@/hooks/useCustomers';
import type { Deal, DealStage } from '@/types/commercial';
import type { Activity, ActivityType } from '@/types/commercial';
import { DEAL_STAGES, DEAL_STAGE_LABELS } from '@/types/commercial';
import { useActivities, type CreateActivityInput } from '@/hooks/useActivities';
import { Timestamp } from 'firebase/firestore';

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
// DEAL DETAIL DIALOG — View Deal + Activities
// ============================================================================

const ACTIVITY_TYPE_CONFIG: Record<ActivityType, { label: string; icon: React.ElementType }> = {
  call: { label: 'Ligação', icon: Phone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  email: { label: 'E-mail', icon: Mail },
  visit: { label: 'Visita', icon: MapPin },
  task: { label: 'Tarefa', icon: CheckSquare },
};

function DealDetailDialog({
  open,
  onOpenChange,
  deal,
  customerName,
  franchiseId,
  storeId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal: Deal;
  customerName: string;
  franchiseId: string;
  storeId: string;
}) {
  const {
    activities,
    loadingActivities,
    openActivities,
    createActivity,
    updateActivity,
    isCreatingActivity,
  } = useActivities(franchiseId, storeId, deal.id);

  const [newType, setNewType] = useState<ActivityType>('call');
  const [newSummary, setNewSummary] = useState('');
  const [newDate, setNewDate] = useState('');

  const handleCreate = useCallback(async () => {
    if (!newSummary.trim() || !deal.id) return;
    const input: CreateActivityInput = {
      dealId: deal.id,
      type: newType,
      summary: newSummary.trim(),
      dueAt: newDate ? new Date(newDate + 'T12:00:00') : new Date(),
    };
    await createActivity(input);
    setNewSummary('');
    setNewDate('');
  }, [newType, newSummary, newDate, createActivity, deal.id]);

  const toggleDone = useCallback(
    (act: Activity & { dealId?: string }) => {
      if (!act.id || !deal.id) return;
      const nextStatus = act.status === 'done' ? 'open' : 'done';
      updateActivity({ activityId: act.id, dealId: act.dealId || deal.id, status: nextStatus });
    },
    [updateActivity, deal.id],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal.title}</DialogTitle>
          <DialogDescription className="sr-only">Detalhes da negociação</DialogDescription>
        </DialogHeader>

        {/* Deal Info */}
        <div className="grid grid-cols-2 gap-2 text-sm border-b pb-3 mb-3">
          <div><span className="text-muted-foreground">Cliente:</span> {customerName}</div>
          <div><span className="text-muted-foreground">Etapa:</span> {DEAL_STAGE_LABELS[deal.stage]}</div>
          {deal.valueEstimate != null && (
            <div><span className="text-muted-foreground">Valor:</span> R$ {deal.valueEstimate.toLocaleString('pt-BR')}</div>
          )}
          {deal.probability != null && (
            <div><span className="text-muted-foreground">Probabilidade:</span> {deal.probability}%</div>
          )}
        </div>

        {/* Activities Section */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <CheckSquare className="h-4 w-4" /> Atividades ({openActivities.length} abertas)
          </h4>

          {/* Quick Create */}
          <div className="flex gap-2 flex-wrap">
            <Select value={newType} onValueChange={(v) => setNewType(v as ActivityType)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ACTIVITY_TYPE_CONFIG) as [ActivityType, { label: string }][]).map(
                  ([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Input
              className="flex-1 h-8 text-xs min-w-[120px]"
              placeholder="Resumo..."
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Input
              type="date"
              className="w-[130px] h-8 text-xs"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={isCreatingActivity || !newSummary.trim()}>
              {isCreatingActivity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>

          {/* Activities List */}
          {loadingActivities ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhuma atividade registrada.
            </p>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {activities.map((act) => {
                const cfg = ACTIVITY_TYPE_CONFIG[act.type] || ACTIVITY_TYPE_CONFIG.task;
                const Icon = cfg.icon;
                const dueDateStr = act.dueAt
                  ? (act.dueAt as Timestamp).toDate().toLocaleDateString('pt-BR')
                  : null;
                return (
                  <div
                    key={act.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs border ${
                      act.status === 'done' ? 'bg-muted/50 line-through text-muted-foreground' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleDone(act)}
                      className="shrink-0"
                      title={act.status === 'done' ? 'Reabrir' : 'Concluir'}
                    >
                      {act.status === 'done' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
                      )}
                    </button>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{act.summary}</span>
                    {dueDateStr && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{dueDateStr}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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
                {customers.filter((c) => c.id).map((c) => (
                  <SelectItem key={c.id} value={c.id as string}>
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

// ============================================================================
// DROPPABLE COLUMN wrapper
// ============================================================================

function DroppableColumn({
  stage,
  children,
}: {
  stage: DealStage;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${stage}`, data: { stage } });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 min-h-[100px] transition-colors rounded-lg ${
        isOver ? 'bg-primary/5 ring-2 ring-primary/30' : ''
      }`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// DRAGGABLE DEAL CARD
// ============================================================================

function DealCard({
  deal,
  customerName,
  onEdit,
  onDelete,
  onView,
  onMoveStage,
  isDragOverlay,
}: {
  deal: Deal;
  customerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
  onMoveStage: (stage: DealStage) => void;
  isDragOverlay?: boolean;
}) {
  const otherStages = DEAL_STAGES.filter((s) => s !== deal.stage);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id || `deal-${deal.title}`,
    data: { deal },
    disabled: isDragOverlay,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`border-t-4 ${STAGE_COLORS[deal.stage]} ${
        isDragging ? 'opacity-40 shadow-lg' : ''
      } ${isDragOverlay ? 'shadow-2xl rotate-2 scale-105' : ''}`}
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <p className="font-medium text-sm leading-snug cursor-pointer hover:underline" onClick={onView}>{deal.title}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Ações do deal" className="h-6 w-6 shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>
                <Eye className="h-4 w-4 mr-2" />
                Ver Detalhes
              </DropdownMenuItem>
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
    dealsError,
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
  const [viewingDeal, setViewingDeal] = useState<Deal | null>(null);
  const [activeDragDeal, setActiveDragDeal] = useState<Deal | null>(null);

  // ── DnD sensors ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const deal = event.active.data.current?.deal as Deal | undefined;
    if (deal) setActiveDragDeal(deal);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragDeal(null);
      const { active, over } = event;
      if (!over) return;

      const deal = active.data.current?.deal as Deal | undefined;
      if (!deal?.id) return;

      // over.id is "col-<stage>"
      const overIdStr = String(over.id);
      const targetStage = (over.data.current?.stage || overIdStr.replace('col-', '')) as DealStage;
      if (targetStage === deal.stage) return; // same column

      moveDealStage({ dealId: deal.id, stage: targetStage });
    },
    [moveDealStage],
  );

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loadingDeals) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // [FIX COM-06] Exibir erro quando query falha
  if (dealsError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h4 className="text-lg font-medium mb-2">Erro ao carregar pipeline</h4>
        <p className="text-sm text-muted-foreground">{dealsError instanceof Error ? dealsError.message : 'Verifique permissões e conexão.'}</p>
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
                Arraste os cards entre colunas ou use o menu ⋮ de cada card
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Negociação
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* ── Kanban Board (DnD) ─────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
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
                {/* Column Cards — droppable */}
                <DroppableColumn stage={stage}>
                  {stageDeals.length === 0 ? (
                    <div className="flex items-center justify-center h-[100px] border-2 border-dashed rounded-lg">
                      <p className="text-xs text-muted-foreground">Solte aqui</p>
                    </div>
                  ) : (
                    stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        customerName={customerMap.get(deal.customerId) || 'Cliente não encontrado'}
                        onEdit={() => setEditingDeal(deal)}
                        onDelete={() => setDeletingDeal(deal)}
                        onView={() => setViewingDeal(deal)}
                        onMoveStage={(newStage) => {
                          if (deal.id) moveDealStage({ dealId: deal.id, stage: newStage });
                        }}
                      />
                    ))
                  )}
                </DroppableColumn>
              </div>
            );
          })}
        </div>

        {/* Drag Overlay — floating ghost */}
        <DragOverlay dropAnimation={null}>
          {activeDragDeal ? (
            <DealCard
              deal={activeDragDeal}
              customerName={customerMap.get(activeDragDeal.customerId) || ''}
              onEdit={() => {}}
              onDelete={() => {}}
              onView={() => {}}
              onMoveStage={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

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
      {/* ── Deal Detail + Activities ─────────────────────────────────── */}
      {viewingDeal && viewingDeal.id && (
        <DealDetailDialog
          open={!!viewingDeal}
          onOpenChange={(v) => { if (!v) setViewingDeal(null); }}
          deal={viewingDeal}
          customerName={customerMap.get(viewingDeal.customerId) || 'N/A'}
          franchiseId={franchiseId}
          storeId={storeId}
        />
      )}
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
