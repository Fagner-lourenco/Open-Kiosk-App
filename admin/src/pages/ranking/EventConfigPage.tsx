/**
 * ============================================================================
 * EventConfigPage — Configuração de Eventos e TV Dashboard (Admin)
 * ============================================================================
 *
 * Rota: /ranking/events
 * Permissão: settings:write
 *
 * 3 Tabs:
 *   1. Config TV & Metas — config do telão, meta coletiva, milestones
 *   2. Desafios & Promoções — CRUD de challenges, templates
 *   3. Prêmios & Resgates — pool de prêmios, golden serve config, resgate por código
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Settings,
  Tv,
  Target,
  Zap,
  Gift,
  Plus,
  Play,
  Pause,
  Trash2,
  Check,
  RefreshCw,
  Copy,
  Star,
  Search,
  AlertCircle,
} from 'lucide-react';

import { useCopyClipboard } from '@/hooks/useCopyClipboard';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Dialog available for future modals
// import { Dialog, DialogContent, ... } from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';

import type {
  TvConfig,
  EventStats,
  Challenge,
  Prize,
  GoldenServeConfig,
  GoalMilestone,
  ChallengeRuleType,
  RewardType,
  PrizeType,
  RankingWindow,
} from '@/types/tvDashboard';
import {
  DEFAULT_TV_CONFIG,
  DEFAULT_EVENT_STATS,
  DEFAULT_GOLDEN_SERVE_CONFIG,
  CHALLENGE_TEMPLATES,
} from '@/types/tvDashboard';

import {
  getTvConfig,
  updateTvConfig,
  getEventStats,
  setCollectiveGoal,
  disableCollectiveGoal,
  toggleEventMode,
  createChallenge,
  activateChallenge,
  updateChallengeStatus,
  deleteChallenge,
  listChallenges,
  addPrize,
  addPrizesBatch,
  redeemPrize,
  listPrizes,
  getGoldenServeConfig,
  updateGoldenServeConfig,
} from '@/services/tvEventService';

import { formatVolume } from '@/utils/formatVolume';

// ============================================================================
// HELPERS
// ============================================================================

/** @deprecated Use formatVolume from shared utility */
const formatMl = formatVolume;

// ============================================================================
// TAB 1: Config TV & Metas
// ============================================================================

export function TvConfigTab({
  franchiseId,
  storeId,
}: {
  franchiseId: string;
  storeId: string;
}) {
  const { log: audit } = useAudit();
  const [config, setConfig] = useState<TvConfig>({ ...DEFAULT_TV_CONFIG } as TvConfig);
  const [savedConfig, setSavedConfig] = useState<TvConfig>({ ...DEFAULT_TV_CONFIG } as TvConfig);
  const [stats, setStats] = useState<EventStats>({ ...DEFAULT_EVENT_STATS } as EventStats);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Goal form state
  const [goalLabel, setGoalLabel] = useState('');
  const [savedGoalLabel, setSavedGoalLabel] = useState('');
  const [goalTargetMl, setGoalTargetMl] = useState(100000);
  const [savedGoalTargetMl, setSavedGoalTargetMl] = useState(100000);
  const [milestoneInputs, setMilestoneInputs] = useState<Array<{ targetMl: number; label: string }>>([]);
  const [savedMilestoneInputs, setSavedMilestoneInputs] = useState<Array<{ targetMl: number; label: string }>>([]);

  // Event mode
  const [eventModeLabel, setEventModeLabel] = useState('');
  const [eventModeDuration, setEventModeDuration] = useState(10);

  // Dirty state detection
  const isConfigDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
  }, [config, savedConfig]);

  const isGoalDirty = useMemo(() => {
    return goalLabel !== savedGoalLabel
      || goalTargetMl !== savedGoalTargetMl
      || JSON.stringify(milestoneInputs) !== JSON.stringify(savedMilestoneInputs);
  }, [goalLabel, savedGoalLabel, goalTargetMl, savedGoalTargetMl, milestoneInputs, savedMilestoneInputs]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, st] = await Promise.all([
        getTvConfig(franchiseId, storeId),
        getEventStats(franchiseId, storeId),
      ]);
      setConfig(cfg);
      setSavedConfig(JSON.parse(JSON.stringify(cfg)));
      setStats(st);

      const gl = st.goalLabel || 'Meta do Dia';
      const gt = st.goalTargetMl || 100000;
      const mi = (st.milestones || []).map((m) => ({ targetMl: m.targetMl, label: m.label }));

      setGoalLabel(gl);
      setSavedGoalLabel(gl);
      setGoalTargetMl(gt);
      setSavedGoalTargetMl(gt);
      setMilestoneInputs(mi);
      setSavedMilestoneInputs(JSON.parse(JSON.stringify(mi)));
    } catch (err) {
      console.error('[TvConfigTab] load error:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar configurações' });
    } finally {
      setLoading(false);
    }
  }, [franchiseId, storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      await updateTvConfig(franchiseId, storeId, config);
      setSavedConfig(JSON.parse(JSON.stringify(config)));
      setLastSavedAt(new Date());
      audit(AuditActions.TV_CONFIG_UPDATE, { type: 'store', id: storeId, name: storeId }, { config });
      setMessage({ type: 'success', text: 'Configuração salva!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      console.error('[TvConfigTab] save error:', err);
      setMessage({ type: 'error', text: 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGoal = async () => {
    try {
      setSaving(true);
      const milestones: GoalMilestone[] = milestoneInputs.map((m) => ({
        targetMl: m.targetMl,
        label: m.label,
        reached: false,
      }));
      await setCollectiveGoal(franchiseId, storeId, goalTargetMl, goalLabel, milestones);
      setSavedGoalLabel(goalLabel);
      setSavedGoalTargetMl(goalTargetMl);
      setSavedMilestoneInputs(JSON.parse(JSON.stringify(milestoneInputs)));
      setLastSavedAt(new Date());
      audit(AuditActions.EVENT_GOAL_SET, { type: 'store', id: storeId, name: storeId }, { goalTargetMl, goalLabel, milestones: milestones.length });
      setMessage({ type: 'success', text: 'Meta coletiva atualizada!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao salvar meta' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableGoal = async () => {
    try {
      await disableCollectiveGoal(franchiseId, storeId);
      audit(AuditActions.EVENT_GOAL_DISABLE, { type: 'store', id: storeId, name: storeId });
      setMessage({ type: 'success', text: 'Meta desabilitada' });
      setTimeout(() => setMessage(null), 4000);
      loadData();
    } catch (err) {
      console.error('[EventConfig] Erro ao desabilitar meta:', err);
      setMessage({ type: 'error', text: 'Erro ao desabilitar meta' });
    }
  };

  const handleToggleEventMode = async (enabled: boolean) => {
    try {
      await toggleEventMode(franchiseId, storeId, enabled, eventModeLabel, eventModeDuration);
      audit(AuditActions.EVENT_MODE_TOGGLE, { type: 'store', id: storeId, name: storeId }, { enabled, label: eventModeLabel, durationMinutes: eventModeDuration });
      setMessage({ type: 'success', text: enabled ? 'Modo evento ativado!' : 'Modo evento desativado' });
      setTimeout(() => setMessage(null), 4000);
      loadData();
    } catch (err) {
      console.error('[EventConfig] Erro ao alterar modo evento:', err);
      setMessage({ type: 'error', text: 'Erro ao alterar modo evento' });
    }
  };

  const addMilestone = () => {
    setMilestoneInputs((prev) => [...prev, { targetMl: 50000, label: '' }]);
  };

  const removeMilestone = (index: number) => {
    setMilestoneInputs((prev) => prev.filter((_, i) => i !== index));
  };

  // Helper: format last saved time
  const formatSavedTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const tvUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/ranking/display/${storeId}?franchise=${franchiseId}`;
  }, [franchiseId, storeId]);

  const { isCopied, copyToClipboard } = useCopyClipboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Persistent save status */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={message.type === 'success' ? 'border-green-500/30 bg-green-50 dark:bg-green-950/20' : ''}>
          {message.type === 'success' ? <Check className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription className="flex items-center justify-between">
            <span>{message.text}</span>
            {lastSavedAt && message.type === 'success' && (
              <span className="text-xs text-muted-foreground">
                às {formatSavedTime(lastSavedAt)}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Unsaved changes warning */}
      {(isConfigDirty || isGoalDirty) && !message && (
        <Alert variant="default" className="border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 dark:text-yellow-400">
            Você tem alterações não salvas. Clique em &quot;Salvar&quot; para persistir.
          </AlertDescription>
        </Alert>
      )}

      {/* TV Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" />
            Link do Telão
          </CardTitle>
          <CardDescription>
            Copie e cole este link no navegador da TV, projetor ou monitor para exibir o ranking ao vivo.
            Funciona em qualquer dispositivo com navegador web.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input value={tvUrl} readOnly className="font-mono text-xs sm:text-sm" />
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(tvUrl)} className="shrink-0">
              {isCopied ? <><Check className="h-4 w-4 mr-1" /> Copiado!</> : <><Copy className="h-4 w-4 mr-1" /> Copiar</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TV Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuração do Telão
          </CardTitle>
          <CardDescription>
            Controle o comportamento e aparência do telão exibido na TV. As alterações são aplicadas em tempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
            <div className="space-y-0.5">
              <Label htmlFor="tv-enabled" className="text-sm font-semibold">Telão habilitado</Label>
              <p className="text-xs text-muted-foreground">Ativa ou desativa a exibição do telão na TV. Quando desativado, mostra tela de espera.</p>
            </div>
            <Switch
              id="tv-enabled"
              checked={config.enabled}
              onCheckedChange={(v) => setConfig({ ...config, enabled: v })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Janela do Ranking</Label>
              <Select
                value={config.rankingWindow}
                onValueChange={(v) => setConfig({ ...config, rankingWindow: v as RankingWindow })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30min">Últimos 30 minutos</SelectItem>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="today">Dia inteiro (hoje)</SelectItem>
                  <SelectItem value="event">Evento completo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define o período de tempo considerado para o ranking. Ex: &quot;Últimos 30 min&quot; mostra apenas consumo recente.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Posições exibidas no ranking</Label>
              <Input
                type="number"
                min={3}
                max={50}
                value={config.maxDisplayPositions}
                onChange={(e) => setConfig({ ...config, maxDisplayPositions: parseInt(e.target.value) || 10 })}
              />
              <p className="text-xs text-muted-foreground">
                Quantos participantes aparecem no telão (Top N). Valores entre 3 e 50. Os 3 primeiros são destacados.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Tempo de rotação (segundos)</Label>
              <Input
                type="number"
                min={5}
                max={60}
                value={config.rotationIntervalSec}
                onChange={(e) => setConfig({ ...config, rotationIntervalSec: parseInt(e.target.value) || 12 })}
              />
              <p className="text-xs text-muted-foreground">
                Intervalo entre as trocas automáticas de página no ranking, desafios e ganhadores. Recomendado: 8–15 segundos.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Título do evento</Label>
              <Input
                value={config.eventLabel || ''}
                onChange={(e) => setConfig({ ...config, eventLabel: e.target.value })}
                placeholder="ex: Happy Hour Sexta"
              />
              <p className="text-xs text-muted-foreground">
                Nome exibido no cabeçalho do telão. Se vazio, mostra &quot;Ranking ao Vivo&quot;.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
            <div className="space-y-0.5">
              <Label htmlFor="alt-windows" className="text-sm font-semibold">Alternar janelas de ranking</Label>
              <p className="text-xs text-muted-foreground">Alterna automaticamente entre ranking de 30 min e ranking do dia, dando visibilidade a quem acabou de chegar.</p>
            </div>
            <Switch
              id="alt-windows"
              checked={config.alternateRankingWindows}
              onCheckedChange={(v) => setConfig({ ...config, alternateRankingWindows: v })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveConfig} disabled={saving || !isConfigDirty} className={isConfigDirty ? '' : 'opacity-60'}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : isConfigDirty ? null : <Check className="h-4 w-4 mr-2 text-green-500" />}
              {isConfigDirty ? 'Salvar Configuração' : 'Configuração Salva'}
            </Button>
            {isConfigDirty && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Alterações pendentes
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Meta Coletiva */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Meta Coletiva
          </CardTitle>
          <CardDescription>
            Defina uma meta de consumo coletivo que é exibida no telão como barra de progresso.
            Quando atingida, pode disparar promoções automáticas (Modo Evento).
            {stats.goalEnabled && (
              <Badge variant="secondary" className="ml-2">Ativa</Badge>
            )}
            {stats.goalTargetMl ? (
              <span className="block mt-1 text-xs">
                Progresso atual: <strong>{formatMl(stats.totalMl || 0)}</strong> / {formatMl(stats.goalTargetMl)}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Nome da meta</Label>
              <Input
                value={goalLabel}
                onChange={(e) => setGoalLabel(e.target.value)}
                placeholder="Meta do Dia"
              />
              <p className="text-xs text-muted-foreground">
                Título exibido no painel de meta do telão (ex: &quot;Meta do Happy Hour&quot;, &quot;Desafio da Galera&quot;).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Volume alvo (mL)</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                value={goalTargetMl}
                onChange={(e) => setGoalTargetMl(parseInt(e.target.value) || 100000)}
              />
              <p className="text-xs text-muted-foreground">
                Volume total de consumo para atingir a meta. Equivalente a <strong>{(goalTargetMl / 1000).toFixed(0)} litros</strong> (~{Math.ceil(goalTargetMl / 300)} copos de 300mL).
              </p>
            </div>
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label className="text-sm font-semibold">Marcos (Milestones)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pontos intermediários que desbloqueiam benefícios antes de atingir a meta final.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addMilestone}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar Marco
              </Button>
            </div>
            {milestoneInputs.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-3 text-center border rounded-lg border-dashed">
                Nenhum marco definido. Adicione marcos para engajar clientes ao longo da meta.
              </p>
            )}
            <div className="space-y-2">
              {milestoneInputs.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="space-y-0.5">
                    <Input
                      type="number"
                      className="w-32"
                      value={m.targetMl}
                      onChange={(e) => {
                        const updated = [...milestoneInputs];
                        updated[i] = { ...updated[i], targetMl: parseInt(e.target.value) || 0 };
                        setMilestoneInputs(updated);
                      }}
                      placeholder="Volume (mL)"
                    />
                  </div>
                  <Input
                    className="flex-1"
                    value={m.label}
                    onChange={(e) => {
                      const updated = [...milestoneInputs];
                      updated[i] = { ...updated[i], label: e.target.value };
                      setMilestoneInputs(updated);
                    }}
                    placeholder="Descrição do benefício (ex: Ativa Happy Hour 15min)"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeMilestone(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveGoal} disabled={saving || !isGoalDirty} className={isGoalDirty ? '' : 'opacity-60'}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : isGoalDirty ? null : <Check className="h-4 w-4 mr-2 text-green-500" />}
              {isGoalDirty ? 'Salvar Meta' : 'Meta Salva'}
            </Button>
            {stats.goalEnabled && (
              <Button variant="outline" onClick={handleDisableGoal}>
                Desabilitar Meta
              </Button>
            )}
            {isGoalDirty && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Alterações pendentes
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modo Evento Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Modo Evento
          </CardTitle>
          <CardDescription>
            Ativa um modo especial no telão com efeitos visuais (pulsação, brilho) e badge destacado.
            Ideal para happy hours, promoções relâmpago ou comemorações.
            {stats.eventMode?.enabled && (
              <Badge className="ml-2 bg-yellow-500 text-black">ATIVO</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Nome do evento</Label>
              <Input
                value={eventModeLabel}
                onChange={(e) => setEventModeLabel(e.target.value)}
                placeholder="Happy Hour!"
              />
              <p className="text-xs text-muted-foreground">
                Texto exibido como badge animado no telão (ex: &quot;Happy Hour&quot;, &quot;Rodada Dupla&quot;, &quot;Promo Relâmpago&quot;).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Duração (minutos)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={eventModeDuration}
                onChange={(e) => setEventModeDuration(parseInt(e.target.value) || 10)}
              />
              <p className="text-xs text-muted-foreground">
                Tempo em minutos que o modo evento ficará ativo. Após esse período, desativa automaticamente.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {!stats.eventMode?.enabled ? (
              <Button onClick={() => handleToggleEventMode(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                <Play className="h-4 w-4 mr-1" /> Ativar Modo Evento
              </Button>
            ) : (
              <Button variant="outline" onClick={() => handleToggleEventMode(false)}>
                <Pause className="h-4 w-4 mr-1" /> Desativar Evento
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// TAB 2: Desafios & Promoções
// ============================================================================

export function ChallengesTab({
  franchiseId,
  storeId,
}: {
  franchiseId: string;
  storeId: string;
}) {
  const { log: audit } = useAudit();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRuleType, setNewRuleType] = useState<ChallengeRuleType>('min_orders');
  const [newThreshold, setNewThreshold] = useState(2);
  const [newWindowMinutes, setNewWindowMinutes] = useState(20);
  const [newDuration, setNewDuration] = useState(20);
  const [newRewardType, setNewRewardType] = useState<RewardType>('coupon');
  const [newRewardDesc, setNewRewardDesc] = useState('');

  const loadChallenges = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listChallenges(franchiseId, storeId);
      setChallenges(list);
    } catch (err) {
      console.error('[ChallengesTab] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [franchiseId, storeId]);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  const handleCreateChallenge = async () => {
    if (!newTitle.trim()) return;

    try {
      setCreating(true);
      const now = Timestamp.now();
      const endsAt = Timestamp.fromDate(new Date(Date.now() + newDuration * 60_000));

      await createChallenge(franchiseId, storeId, {
        title: newTitle,
        description: newDescription,
        rule: {
          type: newRuleType,
          threshold: newThreshold,
          windowMinutes: newWindowMinutes,
        },
        durationMinutes: newDuration,
        status: 'scheduled',
        startsAt: now,
        endsAt,
        rewardType: newRewardType,
        rewardDescription: newRewardDesc || newRewardType,
      });

      setMessage({ type: 'success', text: 'Desafio criado!' });
      setTimeout(() => setMessage(null), 4000);
      audit(AuditActions.CHALLENGE_CREATE, { type: 'challenge', id: 'new', name: newTitle }, { durationMinutes: newDuration, ruleType: newRuleType });
      setShowCreate(false);
      resetCreateForm();
      loadChallenges();
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao criar desafio' });
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (ch: Challenge) => {
    try {
      await activateChallenge(franchiseId, storeId, ch.id, ch.durationMinutes);
      audit(AuditActions.CHALLENGE_ACTIVATE, { type: 'challenge', id: ch.id, name: ch.title });
      setMessage({ type: 'success', text: `"${ch.title}" ativado!` });
      setTimeout(() => setMessage(null), 4000);
      loadChallenges();
    } catch (err) {
      console.error('[EventConfig] Erro ao ativar desafio:', err);
      setMessage({ type: 'error', text: 'Erro ao ativar' });
    }
  };

  const handleCancel = async (ch: Challenge) => {
    try {
      await updateChallengeStatus(franchiseId, storeId, ch.id, 'cancelled');
      setMessage({ type: 'success', text: 'Desafio cancelado' });
      setTimeout(() => setMessage(null), 4000);
      loadChallenges();
    } catch (err) {
      console.error('[EventConfig] Erro ao cancelar desafio:', err);
      setMessage({ type: 'error', text: 'Erro ao cancelar' });
    }
  };

  const handleDelete = async (ch: Challenge) => {
    try {
      await deleteChallenge(franchiseId, storeId, ch.id);
      audit(AuditActions.CHALLENGE_DELETE, { type: 'challenge', id: ch.id, name: ch.title });
      loadChallenges();
    } catch (err) {
      console.error('[EventConfig] Erro ao remover desafio:', err);
      setMessage({ type: 'error', text: 'Erro ao remover' });
    }
  };

  const applyTemplate = (index: number) => {
    const t = CHALLENGE_TEMPLATES[index];
    setNewTitle(t.title);
    setNewDescription(t.description);
    setNewRuleType(t.rule.type);
    setNewThreshold(t.rule.threshold);
    setNewWindowMinutes(t.rule.windowMinutes);
    setNewDuration(t.durationMinutes);
    setNewRewardType(t.rewardType);
    setShowCreate(true);
  };

  const resetCreateForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewRuleType('min_orders');
    setNewThreshold(2);
    setNewWindowMinutes(20);
    setNewDuration(20);
    setNewRewardType('coupon');
    setNewRewardDesc('');
  };

  const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    scheduled: { label: 'Agendado', variant: 'secondary' },
    active: { label: 'Ativo', variant: 'default' },
    expired: { label: 'Expirado', variant: 'destructive' },
    completed: { label: 'Concluído', variant: 'outline' },
    cancelled: { label: 'Cancelado', variant: 'destructive' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Templates Rápidos
          </CardTitle>
          <CardDescription>
            Selecione um template para preencher automaticamente o formulário de desafio. Você pode editar os valores depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {CHALLENGE_TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => applyTemplate(i)}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors"
              >
                <p className="font-semibold text-sm">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Novo Desafio</CardTitle>
            <CardDescription>
              Configure os detalhes do desafio. Após criar, você pode ativá-lo imediatamente ou deixar agendado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Título do desafio</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Happy Hour Duplo" />
                <p className="text-xs text-muted-foreground">Nome exibido no telão e para os participantes.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Descrição curta</Label>
                <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Ex: 2 pedidos em 20 min ganham brinde" />
                <p className="text-xs text-muted-foreground">Regra resumida que aparece abaixo do título.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Tipo de regra</Label>
                <Select value={newRuleType} onValueChange={(v) => setNewRuleType(v as ChallengeRuleType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="min_orders">Mín. Pedidos — cliente faz X pedidos</SelectItem>
                    <SelectItem value="min_taps">Mín. Torneiras — cliente usa X torneiras diferentes</SelectItem>
                    <SelectItem value="return_after">Voltar Após — premia quem retorna após pausa</SelectItem>
                    <SelectItem value="happy_boost">Happy Boost — bônus de premiação ativo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Como o sistema verifica se o cliente completou o desafio.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Quantidade mínima (threshold)</Label>
                <Input type="number" min={1} value={newThreshold} onChange={(e) => setNewThreshold(parseInt(e.target.value) || 1)} />
                <p className="text-xs text-muted-foreground">Ex: 2 = cliente precisa de 2 pedidos/torneiras para completar.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Janela de tempo (minutos)</Label>
                <Input type="number" min={1} value={newWindowMinutes} onChange={(e) => setNewWindowMinutes(parseInt(e.target.value) || 20)} />
                <p className="text-xs text-muted-foreground">Período em que o cliente deve completar a ação (ex: 20 min para fazer 2 pedidos).</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Duração total do desafio (min)</Label>
                <Input type="number" min={5} value={newDuration} onChange={(e) => setNewDuration(parseInt(e.target.value) || 20)} />
                <p className="text-xs text-muted-foreground">Quanto tempo o desafio permanece ativo. Após isso, encerra automaticamente.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Tipo de recompensa</Label>
                <Select value={newRewardType} onValueChange={(v) => setNewRewardType(v as RewardType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coupon">🎟️ Cupom de desconto</SelectItem>
                    <SelectItem value="free_drink">🍺 Chope grátis</SelectItem>
                    <SelectItem value="pix">💸 Pix (dinheiro)</SelectItem>
                    <SelectItem value="ticket_extra">🎫 Bilhete extra (sorteio)</SelectItem>
                    <SelectItem value="bonus_multiplier">🚀 Multiplicador de pontos</SelectItem>
                    <SelectItem value="custom">🎁 Prêmio personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">O que o cliente ganha ao completar o desafio.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Descrição da recompensa</Label>
                <Input value={newRewardDesc} onChange={(e) => setNewRewardDesc(e.target.value)} placeholder="ex: 10% off no próximo pedido" />
                <p className="text-xs text-muted-foreground">Texto detalhado do prêmio exibido ao cliente.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateChallenge} disabled={creating || !newTitle.trim()}>
                {creating ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Criar Desafio
              </Button>
              <Button variant="outline" onClick={() => { setShowCreate(false); resetCreateForm(); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showCreate && (
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Desafio
        </Button>
      )}

      {/* Challenges List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Desafios ({challenges.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {challenges.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nenhum desafio criado. Use os templates acima!
            </p>
          ) : (
            <div className="space-y-3">
              {challenges.map((ch) => {
                const endsMs = ch.endsAt?.toMillis?.() ?? (ch.endsAt?.seconds ? ch.endsAt.seconds * 1000 : 0);
                const startsMs = ch.startsAt?.toMillis?.() ?? (ch.startsAt?.seconds ? ch.startsAt.seconds * 1000 : 0);
                const now = Date.now();
                const totalDur = endsMs - startsMs;
                const elapsed = now - startsMs;
                const progressPct = totalDur > 0 ? Math.min(100, Math.max(0, (elapsed / totalDur) * 100)) : 0;
                const remaining = endsMs - now;
                const remainingMin = Math.max(0, Math.floor(remaining / 60_000));
                const remainingSec = Math.max(0, Math.floor((remaining % 60_000) / 1000));
                const isExpired = remaining <= 0 && ch.status === 'active';

                // Determine display status: active challenges that expired show as "expired"
                const displayStatus = isExpired ? 'expired' : ch.status;
                const badge = STATUS_BADGE[displayStatus] || STATUS_BADGE.scheduled;

                const REWARD_LABELS: Record<string, string> = {
                  coupon: 'Cupom',
                  free_drink: 'Chope grátis',
                  pix: 'Pix',
                  ticket_extra: 'Bilhete extra',
                  bonus_multiplier: 'Multiplicador',
                  custom: 'Especial',
                };

                return (
                  <div
                    key={ch.id}
                    className="p-4 rounded-lg border border-border space-y-2"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{ch.title}</p>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ch.description}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {ch.status === 'scheduled' && (
                          <Button variant="outline" size="sm" onClick={() => handleActivate(ch)}>
                            <Play className="h-3 w-3 mr-1" /> Ativar
                          </Button>
                        )}
                        {ch.status === 'active' && !isExpired && (
                          <Button variant="outline" size="sm" onClick={() => handleCancel(ch)}>
                            <Pause className="h-3 w-3 mr-1" /> Pausar
                          </Button>
                        )}
                        {ch.status === 'active' && isExpired && (
                          <Button variant="outline" size="sm" onClick={() => handleCancel(ch)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Encerrar
                          </Button>
                        )}
                        {(ch.status === 'completed' || ch.status === 'cancelled') && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(ch)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Progress + details row */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="outline" className="gap-1 shrink-0">
                        🏆 {REWARD_LABELS[ch.rewardType] || ch.rewardDescription || ch.rewardType}
                      </Badge>
                      <span>👥 {ch.completedCount} completaram</span>
                      {ch.status === 'active' && !isExpired && (
                        <span className="ml-auto font-mono text-orange-500 font-semibold tabular-nums">
                          ⏱ {remainingMin}min {remainingSec}s
                        </span>
                      )}
                      {isExpired && (
                        <span className="ml-auto text-muted-foreground font-medium">Tempo esgotado</span>
                      )}
                    </div>
                    {/* Time progress bar (active challenges) */}
                    {ch.status === 'active' && (
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${isExpired ? 'bg-muted-foreground/40' : 'bg-primary'}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// TAB 3: Prêmios & Resgates
// ============================================================================

export function PrizesTab({
  franchiseId,
  storeId,
}: {
  franchiseId: string;
  storeId: string;
}) {
  const { user } = useAuth();
  const { log: audit } = useAudit();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Golden serve config
  const [goldenConfig, setGoldenConfig] = useState<GoldenServeConfig>({ ...DEFAULT_GOLDEN_SERVE_CONFIG });
  const [savingGolden, setSavingGolden] = useState(false);

  // Redeem form
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  // Quick add prizes
  const [addType, setAddType] = useState<PrizeType>('coupon');
  const [addDescription, setAddDescription] = useState('');
  const [addValue, setAddValue] = useState(0);
  const [addCount, setAddCount] = useState(1);
  const [adding, setAdding] = useState(false);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [prizeList, golden] = await Promise.all([
        listPrizes(franchiseId, storeId),
        getGoldenServeConfig(franchiseId, storeId),
      ]);
      setPrizes(prizeList);
      setGoldenConfig(golden);
    } catch (err) {
      console.error('[PrizesTab] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [franchiseId, storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRedeem = async () => {
    if (!redeemCode.trim() || !user) return;
    try {
      setRedeeming(true);
      const result = await redeemPrize(franchiseId, storeId, redeemCode, user.uid);
      if (result.success) {
        setMessage({ type: 'success', text: `Prêmio resgatado: ${result.prize?.description}` });
        setTimeout(() => setMessage(null), 4000);
        audit(AuditActions.PRIZE_REDEEM, { type: 'prize', id: redeemCode, name: result.prize?.description || redeemCode });
        setRedeemCode('');
        loadData();
      } else {
        setMessage({ type: 'error', text: result.error || 'Erro ao resgatar' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao resgatar prêmio' });
    } finally {
      setRedeeming(false);
    }
  };

  const handleAddPrizes = async () => {
    if (!addDescription.trim()) return;
    try {
      setAdding(true);
      const prizesData = Array.from({ length: addCount }, () => ({
        type: addType,
        description: addDescription,
        value: addType === 'pix' ? addValue : undefined,
      }));

      if (addCount === 1) {
        await addPrize(franchiseId, storeId, prizesData[0]);
      } else {
        await addPrizesBatch(franchiseId, storeId, prizesData);
      }

      setMessage({ type: 'success', text: `${addCount} prêmio(s) adicionado(s) ao pool!` });
      setTimeout(() => setMessage(null), 4000);
      audit(AuditActions.PRIZE_ADD, { type: 'prize', id: 'batch', name: addDescription }, { count: addCount, type: addType, value: addValue });
      setAddDescription('');
      setAddCount(1);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao adicionar prêmios' });
    } finally {
      setAdding(false);
    }
  };

  const handleSaveGolden = async () => {
    try {
      setSavingGolden(true);
      await updateGoldenServeConfig(franchiseId, storeId, goldenConfig);
      audit(AuditActions.GOLDEN_SERVE_UPDATE, { type: 'store', id: storeId, name: storeId }, { goldenConfig });
      setMessage({ type: 'success', text: 'Serve dourado atualizado!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('[EventConfig] Erro ao salvar serve dourado:', err);
      setMessage({ type: 'error', text: 'Erro ao salvar serve dourado' });
    } finally {
      setSavingGolden(false);
    }
  };

  const filteredPrizes = useMemo(() => {
    if (statusFilter === 'all') return prizes;
    return prizes.filter((p) => p.status === statusFilter);
  }, [prizes, statusFilter]);

  // Stats
  const prizeStats = useMemo(() => {
    return {
      available: prizes.filter((p) => p.status === 'available').length,
      won: prizes.filter((p) => p.status === 'won').length,
      redeemed: prizes.filter((p) => p.status === 'redeemed').length,
      expired: prizes.filter((p) => p.status === 'expired').length,
    };
  }, [prizes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Resgate por código */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Resgatar Prêmio por Código
          </CardTitle>
          <CardDescription>
            Quando um cliente ganha um prêmio, ele recebe um código de 8 caracteres. O atendente digita o código aqui para confirmar o resgate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Código do prêmio</Label>
            <div className="flex items-center gap-2">
              <Input
                value={redeemCode}
                onChange={(e) => {
                  // Máscara: apenas alfanuméricos, auto-uppercase, max 8 chars
                  const raw = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
                  setRedeemCode(raw);
                }}
                placeholder="ABCD1234"
                maxLength={8}
                className="font-mono text-lg tracking-widest uppercase w-48"
              />
              <Button onClick={handleRedeem} disabled={redeeming || redeemCode.length !== 8}>
                {redeeming ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Resgatar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Digite os 8 caracteres alfanuméricos que o cliente recebeu.
            </p>
          </div>
          {/* Feedback em tempo real */}
          {redeemCode.length > 0 && redeemCode.length < 8 && (
            <p className="text-xs text-muted-foreground">
              Faltam {8 - redeemCode.length} caractere{8 - redeemCode.length !== 1 ? 's' : ''}
            </p>
          )}
          {redeemCode.length === 8 && (
            <p className="text-xs text-green-600">✓ Código no formato correto — clique em Resgatar</p>
          )}
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{prizeStats.available}</p>
            <p className="text-xs text-muted-foreground">Disponíveis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{prizeStats.won}</p>
            <p className="text-xs text-muted-foreground">Aguardando resgate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{prizeStats.redeemed}</p>
            <p className="text-xs text-muted-foreground">Resgatados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-gray-400">{prizeStats.expired}</p>
            <p className="text-xs text-muted-foreground">Expirados</p>
          </CardContent>
        </Card>
      </div>

      {/* Serve Dourado Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Serve Dourado (Bilhete Premiado)
          </CardTitle>
          <CardDescription>
            Sistema de bilhete premiado automático: a cada N serves, um cliente é sorteado automaticamente para ganhar um prêmio.
            O prêmio é atribuído do pool de prêmios disponíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
            <div className="space-y-0.5">
              <Label htmlFor="golden-enabled" className="text-sm font-semibold">Serve Dourado habilitado</Label>
              <p className="text-xs text-muted-foreground">Quando ativo, sorteia prêmios automaticamente a cada N serves.</p>
            </div>
            <Switch
              id="golden-enabled"
              checked={goldenConfig.enabled}
              onCheckedChange={(v) => setGoldenConfig({ ...goldenConfig, enabled: v })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Frequência do sorteio</Label>
              <Input
                type="number"
                min={5}
                value={goldenConfig.frequency}
                onChange={(e) => setGoldenConfig({ ...goldenConfig, frequency: parseInt(e.target.value) || 50 })}
              />
              <p className="text-xs text-muted-foreground">
                1 prêmio sorteado a cada <strong>{goldenConfig.frequency}</strong> serves. Quanto menor o número, mais frequente o sorteio.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Limite de Pix por pessoa/dia</Label>
              <Input
                type="number"
                min={0}
                value={goldenConfig.maxPixPerPerson}
                onChange={(e) => setGoldenConfig({ ...goldenConfig, maxPixPerPerson: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground">
                Evita que uma pessoa ganhe Pix ilimitado. 0 = sem limite (não recomendado).
              </p>
            </div>
          </div>

          <Button onClick={handleSaveGolden} disabled={savingGolden}>
            {savingGolden ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            Salvar Serve Dourado
          </Button>
        </CardContent>
      </Card>

      {/* Adicionar Prêmios ao Pool */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Adicionar Prêmios ao Pool
          </CardTitle>
          <CardDescription>
            Adicione prêmios que serão distribuídos automaticamente pelo Serve Dourado ou como recompensa de desafios.
            Cada prêmio recebe um código único para resgate no balcão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Tipo do prêmio</Label>
              <Select value={addType} onValueChange={(v) => setAddType(v as PrizeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coupon">🎟️ Cupom de desconto</SelectItem>
                  <SelectItem value="free_drink">🍺 Chope grátis</SelectItem>
                  <SelectItem value="pix">💸 Pix (dinheiro)</SelectItem>
                  <SelectItem value="custom">🎁 Prêmio personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Descrição do prêmio</Label>
              <Input
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="ex: Desconto 10% no próximo"
              />
            </div>
            {addType === 'pix' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Valor (R$)</Label>
                <Input
                  type="number"
                  min={1}
                  value={addValue}
                  onChange={(e) => setAddValue(parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={addCount}
                onChange={(e) => setAddCount(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Quantos prêmios idênticos criar de uma vez.</p>
            </div>
          </div>
          <Button onClick={handleAddPrizes} disabled={adding || !addDescription.trim()}>
            {adding ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Adicionar {addCount} prêmio{addCount > 1 ? 's' : ''}
          </Button>
        </CardContent>
      </Card>

      {/* Prizes List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Pool de Prêmios ({prizes.length})
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="available">Disponíveis</SelectItem>
                <SelectItem value="won">Ganhos</SelectItem>
                <SelectItem value="redeemed">Resgatados</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPrizes.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nenhum prêmio encontrado
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredPrizes.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border text-sm"
                >
                  <span className="text-lg">
                    {p.type === 'coupon' ? '🎟️' : p.type === 'free_drink' ? '🍺' : p.type === 'pix' ? '💸' : '🎁'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.description}</p>
                    {p.winnerDisplayName && (
                      <p className="text-xs text-muted-foreground">
                        Ganhador: {p.winnerDisplayName}
                      </p>
                    )}
                  </div>
                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                    {p.code}
                  </code>
                  <Badge variant={
                    p.status === 'available' ? 'secondary' :
                    p.status === 'won' ? 'default' :
                    p.status === 'redeemed' ? 'outline' :
                    'destructive'
                  }>
                    {p.status === 'available' ? 'Disponível' :
                     p.status === 'won' ? 'Ganho' :
                     p.status === 'redeemed' ? 'Resgatado' :
                     'Expirado'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


