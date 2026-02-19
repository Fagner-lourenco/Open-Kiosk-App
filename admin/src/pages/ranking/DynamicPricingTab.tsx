/**
 * ============================================================================
 * DynamicPricingTab — Configuração de Preço Dinâmico (Admin)
 * ============================================================================
 *
 * Renderizada dentro do RankingPage como 5ª tab.
 * Lê/grava em Store.dynamicPricingConfig (Firestore).
 *
 * Seções:
 *   1. Toggle geral (enabled) + guardrails
 *   2. CRUD de regras (Happy Hour / Barril Progressivo)
 *   3. Simulador de preço (preview determinístico)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Clock,
  BarChart3,
  Beer,
  AlertCircle,
  Check,
  RefreshCw,
} from 'lucide-react';

import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import {
  getDynamicPricingConfig,
  updateDynamicPricingConfig,
} from '@/services/dynamicPricingService';
import { evaluateDynamicPrice } from '@shared/utils/dynamicPricingEngine';
import type {
  DynamicPricingConfig,
  DynamicPricingRule,
  HappyHourWindow,
  KegTier,
  HappyHourParams,
  KegProgressiveParams,
  DynamicPricingRuleType,
} from '@shared/types/dynamicPricing';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '@shared/types/dynamicPricing';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ============================================================================
// HELPERS
// ============================================================================

function generateRuleId(type: DynamicPricingRuleType): string {
  const prefix = type === 'happy_hour' ? 'hh' : 'keg';
  return `${prefix}-${Date.now().toString(36)}`;
}

const DEFAULT_HH_WINDOW: HappyHourWindow = {
  startTime: '17:00',
  endTime: '19:00',
  deltaPercent: -10,
};

function createDefaultRule(type: DynamicPricingRuleType, priority: number): DynamicPricingRule {
  const id = generateRuleId(type);
  if (type === 'happy_hour') {
    return {
      id,
      type,
      enabled: true,
      priority,
      label: 'Happy Hour',
      params: { windows: [{ ...DEFAULT_HH_WINDOW }] } as HappyHourParams,
    };
  }
  return {
    id,
    type,
    enabled: true,
    priority,
    label: 'Progressivo por Barril',
    params: {
      tiers: [
        { minPercent: 0, maxPercent: 30, deltaPercent: 0 },
        { minPercent: 30, maxPercent: 60, deltaPercent: -5 },
        { minPercent: 60, maxPercent: 100, deltaPercent: -15 },
      ],
    } as KegProgressiveParams,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DynamicPricingTab({
  franchiseId,
  storeId,
}: {
  franchiseId: string;
  storeId: string;
}) {
  const { log: audit } = useAudit();

  // ── State ───────────────────────────────────────────────────────────
  const [config, setConfig] = useState<DynamicPricingConfig>({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
  const [savedConfig, setSavedConfig] = useState<DynamicPricingConfig>({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Simulator
  const [simTime, setSimTime] = useState('18:00');
  const [simKegLevel, setSimKegLevel] = useState(50);
  const [simBasePrice, setSimBasePrice] = useState(25);
  const [simMl, setSimMl] = useState(500);

  // ── Dirty detection ──────────────────────────────────────────────────
  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );

  // ── Load ─────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const cfg = await getDynamicPricingConfig(franchiseId, storeId);
      setConfig(cfg);
      setSavedConfig(JSON.parse(JSON.stringify(cfg)));
    } catch (err) {
      console.error('[DynamicPricingTab] Load error:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar configuração.' });
    } finally {
      setLoading(false);
    }
  }, [franchiseId, storeId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Auto-clear messages ──────────────────────────────────────────────
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  // ── Save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      setSaving(true);
      await updateDynamicPricingConfig(franchiseId, storeId, config);
      setSavedConfig(JSON.parse(JSON.stringify(config)));
      setMessage({ type: 'success', text: 'Configuração salva com sucesso!' });

      await audit(
        AuditActions.DYNAMIC_PRICING_UPDATE,
        { type: 'store', id: storeId, name: 'Dynamic Pricing' },
        {
          enabled: config.enabled,
          rulesCount: config.rules.length,
          maxVariation: config.maxVariationPercent,
        },
      );
    } catch (err) {
      console.error('[DynamicPricingTab] Save error:', err);
      setMessage({ type: 'error', text: `Erro ao salvar: ${(err as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle enabled ───────────────────────────────────────────────────
  const handleToggle = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, enabled }));
  };

  // ── Rule CRUD ────────────────────────────────────────────────────────
  const addRule = (type: DynamicPricingRuleType) => {
    const nextPriority = config.rules.length > 0
      ? Math.max(...config.rules.map(r => r.priority)) + 10
      : 10;
    setConfig(prev => ({
      ...prev,
      rules: [...prev.rules, createDefaultRule(type, nextPriority)],
    }));
  };

  const removeRule = (ruleId: string) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.filter(r => r.id !== ruleId),
    }));
  };

  const updateRule = (ruleId: string, patch: Partial<DynamicPricingRule>) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => (r.id === ruleId ? { ...r, ...patch } : r)),
    }));
  };

  // ── Happy Hour window helpers ────────────────────────────────────────
  const addWindow = (ruleId: string) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => {
        if (r.id !== ruleId || r.type !== 'happy_hour') return r;
        const p = r.params as HappyHourParams;
        return { ...r, params: { windows: [...p.windows, { ...DEFAULT_HH_WINDOW }] } };
      }),
    }));
  };

  const removeWindow = (ruleId: string, idx: number) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => {
        if (r.id !== ruleId || r.type !== 'happy_hour') return r;
        const p = r.params as HappyHourParams;
        return { ...r, params: { windows: p.windows.filter((_, i) => i !== idx) } };
      }),
    }));
  };

  const updateWindow = (ruleId: string, idx: number, patch: Partial<HappyHourWindow>) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => {
        if (r.id !== ruleId || r.type !== 'happy_hour') return r;
        const p = r.params as HappyHourParams;
        return {
          ...r,
          params: { windows: p.windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)) },
        };
      }),
    }));
  };

  // ── Keg tier helpers ─────────────────────────────────────────────────
  const addTier = (ruleId: string) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => {
        if (r.id !== ruleId || r.type !== 'keg_progressive') return r;
        const p = r.params as KegProgressiveParams;
        const lastMax = p.tiers.length > 0 ? p.tiers[p.tiers.length - 1].maxPercent : 0;
        return {
          ...r,
          params: {
            tiers: [...p.tiers, { minPercent: lastMax, maxPercent: Math.min(lastMax + 30, 100), deltaPercent: 0 }],
          },
        };
      }),
    }));
  };

  const removeTier = (ruleId: string, idx: number) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => {
        if (r.id !== ruleId || r.type !== 'keg_progressive') return r;
        const p = r.params as KegProgressiveParams;
        return { ...r, params: { tiers: p.tiers.filter((_, i) => i !== idx) } };
      }),
    }));
  };

  const updateTier = (ruleId: string, idx: number, patch: Partial<KegTier>) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(r => {
        if (r.id !== ruleId || r.type !== 'keg_progressive') return r;
        const p = r.params as KegProgressiveParams;
        return {
          ...r,
          params: { tiers: p.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)) },
        };
      }),
    }));
  };

  // ── Simulator ────────────────────────────────────────────────────────
  const simResult = useMemo(() => {
    if (!config.enabled || config.rules.length === 0) return null;

    const basePricePerMl = simBasePrice / simMl;
    const [h, m] = simTime.split(':').map(Number);
    const now = new Date();
    now.setHours(h, m, 0, 0);

    const result = evaluateDynamicPrice(basePricePerMl, config, {
      timestamp: now,
      kegLevelPercent: simKegLevel,
    });

    const effectivePrice = result.effectivePricePerMl * simMl;
    return { ...result, effectivePrice, basePrice: simBasePrice };
  }, [config, simTime, simKegLevel, simBasePrice, simMl]);

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin opacity-40" />
          <p>Carregando configuração de preço dinâmico…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Mensagem de feedback ── */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="animate-in fade-in slide-in-from-top-2">
          <AlertDescription className="flex items-center gap-2">
            {message.type === 'success' ? <Check className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4" />}
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 1: Feature Flag + Guardrails
          ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Preço Dinâmico
          </CardTitle>
          <CardDescription>
            Configure regras de precificação inteligente (Happy Hour, progressivo por barril).
            O preço base do produto <strong>nunca é alterado</strong> — o desconto/acréscimo
            é aplicado em tempo real no checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="space-y-1">
              <Label htmlFor="dp-enabled" className="text-sm font-medium">Ativar Preço Dinâmico</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado, as regras abaixo serão avaliadas em tempo real a cada venda.
              </p>
            </div>
            <Switch
              id="dp-enabled"
              checked={config.enabled}
              onCheckedChange={handleToggle}
            />
          </div>

          {/* Guardrails */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="max-variation">Variação Máxima (%)</Label>
              <Input
                id="max-variation"
                type="number"
                min={1}
                max={50}
                value={config.maxVariationPercent}
                onChange={(e) => setConfig(prev => ({ ...prev, maxVariationPercent: Number(e.target.value) || 20 }))}
              />
              <p className="text-xs text-muted-foreground">Trava de segurança (1–50%)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-interval">Intervalo Mín. (seg)</Label>
              <Input
                id="min-interval"
                type="number"
                min={0}
                max={3600}
                value={config.minChangeIntervalSec}
                onChange={(e) => setConfig(prev => ({ ...prev, minChangeIntervalSec: Number(e.target.value) || 300 }))}
              />
              <p className="text-xs text-muted-foreground">Anti-oscilação entre mudanças</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rounding">Casas Decimais</Label>
              <Input
                id="rounding"
                type="number"
                min={0}
                max={6}
                value={config.roundingPrecision}
                onChange={(e) => setConfig(prev => ({ ...prev, roundingPrecision: Number(e.target.value) || 2 }))}
              />
              <p className="text-xs text-muted-foreground">Arredondamento do preço final</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 2: Regras
          ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Regras de Precificação</CardTitle>
            <CardDescription>
              {config.rules.length === 0
                ? 'Nenhuma regra configurada. Adicione abaixo.'
                : `${config.rules.length} regra(s) — primeira match por prioridade ganha.`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addRule('happy_hour')}>
              <Clock className="h-4 w-4 mr-1.5" />
              Happy Hour
            </Button>
            <Button variant="outline" size="sm" onClick={() => addRule('keg_progressive')}>
              <Beer className="h-4 w-4 mr-1.5" />
              Barril Progressivo
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {config.rules.length === 0 && (
            <div className="py-10 text-center text-muted-foreground border border-dashed rounded-lg">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Clique em &quot;Happy Hour&quot; ou &quot;Barril Progressivo&quot; para criar a primeira regra.</p>
            </div>
          )}

          {config.rules.map((rule) => (
            <RuleEditor
              key={rule.id}
              rule={rule}
              onUpdate={(patch) => updateRule(rule.id, patch)}
              onRemove={() => removeRule(rule.id)}
              // Happy Hour
              onAddWindow={() => addWindow(rule.id)}
              onRemoveWindow={(idx) => removeWindow(rule.id, idx)}
              onUpdateWindow={(idx, patch) => updateWindow(rule.id, idx, patch)}
              // Keg
              onAddTier={() => addTier(rule.id)}
              onRemoveTier={(idx) => removeTier(rule.id, idx)}
              onUpdateTier={(idx, patch) => updateTier(rule.id, idx, patch)}
            />
          ))}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════
          SEÇÃO 3: Simulador
          ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Simulador de Preço
          </CardTitle>
          <CardDescription>
            Simule o preço dinâmico com diferentes cenários para validar as regras.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="sim-time">Horário</Label>
              <Input id="sim-time" type="time" value={simTime} onChange={(e) => setSimTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-keg">Nível Barril (%)</Label>
              <Input id="sim-keg" type="number" min={0} max={100} value={simKegLevel} onChange={(e) => setSimKegLevel(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-base">Preço Base (R$)</Label>
              <Input id="sim-base" type="number" min={0} step={0.5} value={simBasePrice} onChange={(e) => setSimBasePrice(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-ml">Volume (mL)</Label>
              <Input id="sim-ml" type="number" min={1} value={simMl} onChange={(e) => setSimMl(Number(e.target.value) || 500)} />
            </div>
          </div>

          {/* Resultado */}
          {!config.enabled ? (
            <p className="text-sm text-muted-foreground py-3">
              Ative o preço dinâmico para usar o simulador.
            </p>
          ) : simResult ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 border text-center">
                <p className="text-xs text-muted-foreground mb-1">Preço Base</p>
                <p className="text-lg font-semibold">R$ {simResult.basePrice.toFixed(2)}</p>
              </div>
              <div className={`p-3 rounded-lg border text-center ${simResult.deltaPercent < 0 ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : simResult.deltaPercent > 0 ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' : 'bg-muted/50'}`}>
                <p className="text-xs text-muted-foreground mb-1">Preço Dinâmico</p>
                <p className="text-lg font-semibold flex items-center justify-center gap-1">
                  R$ {simResult.effectivePrice.toFixed(2)}
                  {simResult.deltaPercent !== 0 && (
                    <span className={`text-sm ${simResult.deltaPercent < 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({simResult.deltaPercent > 0 ? '+' : ''}{simResult.deltaPercent}%)
                    </span>
                  )}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border text-center">
                <p className="text-xs text-muted-foreground mb-1">Regra</p>
                <p className="text-sm font-medium">{simResult.reason || 'Nenhuma regra aplicada'}</p>
                {simResult.ruleId && (
                  <Badge variant="secondary" className="mt-1 text-xs">{simResult.ruleId}</Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-3">
              Configure ao menos uma regra habilitada para simular.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Ações ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Alterações não salvas
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadConfig}
            disabled={saving}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Recarregar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1.5" />
            )}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RULE EDITOR (Subcomponent)
// ============================================================================

function RuleEditor({
  rule,
  onUpdate,
  onRemove,
  onAddWindow,
  onRemoveWindow,
  onUpdateWindow,
  onAddTier,
  onRemoveTier,
  onUpdateTier,
}: {
  rule: DynamicPricingRule;
  onUpdate: (patch: Partial<DynamicPricingRule>) => void;
  onRemove: () => void;
  onAddWindow: () => void;
  onRemoveWindow: (idx: number) => void;
  onUpdateWindow: (idx: number, patch: Partial<HappyHourWindow>) => void;
  onAddTier: () => void;
  onRemoveTier: (idx: number) => void;
  onUpdateTier: (idx: number, patch: Partial<KegTier>) => void;
}) {
  const isHH = rule.type === 'happy_hour';
  const Icon = isHH ? Clock : Beer;
  const typeLabel = isHH ? 'Happy Hour' : 'Barril Progressivo';

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-2">
            <Input
              value={rule.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="h-8 w-48 text-sm font-medium"
              placeholder="Nome da regra"
            />
            <Badge variant="outline" className="shrink-0">{typeLabel}</Badge>
          </div>
          <Switch
            checked={rule.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Prioridade</Label>
            <Input
              type="number"
              value={rule.priority}
              onChange={(e) => onUpdate({ priority: Number(e.target.value) || 0 })}
              className="h-8 w-20 text-sm"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body: type-specific */}
      {isHH ? (
        <HappyHourEditor
          params={rule.params as HappyHourParams}
          onAddWindow={onAddWindow}
          onRemoveWindow={onRemoveWindow}
          onUpdateWindow={onUpdateWindow}
        />
      ) : (
        <KegProgressiveEditor
          params={rule.params as KegProgressiveParams}
          onAddTier={onAddTier}
          onRemoveTier={onRemoveTier}
          onUpdateTier={onUpdateTier}
        />
      )}
    </div>
  );
}

// ============================================================================
// HAPPY HOUR EDITOR
// ============================================================================

function HappyHourEditor({
  params,
  onAddWindow,
  onRemoveWindow,
  onUpdateWindow,
}: {
  params: HappyHourParams;
  onAddWindow: () => void;
  onRemoveWindow: (idx: number) => void;
  onUpdateWindow: (idx: number, patch: Partial<HappyHourWindow>) => void;
}) {
  return (
    <div className="space-y-2 ml-8">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Janelas de horário:</p>
        <Button variant="ghost" size="sm" onClick={onAddWindow}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Janela
        </Button>
      </div>
      {params.windows.map((w, idx) => (
        <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/30">
          <Input
            type="time"
            value={w.startTime}
            onChange={(e) => onUpdateWindow(idx, { startTime: e.target.value })}
            className="h-8 w-32"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="time"
            value={w.endTime}
            onChange={(e) => onUpdateWindow(idx, { endTime: e.target.value })}
            className="h-8 w-32"
          />
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">Delta %</Label>
            <Input
              type="number"
              value={w.deltaPercent}
              onChange={(e) => onUpdateWindow(idx, { deltaPercent: Number(e.target.value) })}
              className="h-8 w-20"
            />
          </div>
          <DeltaBadge delta={w.deltaPercent} />
          <Button variant="ghost" size="sm" onClick={() => onRemoveWindow(idx)} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// KEG PROGRESSIVE EDITOR
// ============================================================================

function KegProgressiveEditor({
  params,
  onAddTier,
  onRemoveTier,
  onUpdateTier,
}: {
  params: KegProgressiveParams;
  onAddTier: () => void;
  onRemoveTier: (idx: number) => void;
  onUpdateTier: (idx: number, patch: Partial<KegTier>) => void;
}) {
  return (
    <div className="space-y-2 ml-8">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Faixas de nível do barril:</p>
        <Button variant="ghost" size="sm" onClick={onAddTier}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Faixa
        </Button>
      </div>
      {params.tiers.map((t, idx) => (
        <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/30">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">De</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={t.minPercent}
              onChange={(e) => onUpdateTier(idx, { minPercent: Number(e.target.value) })}
              className="h-8 w-20"
            />
            <span className="text-xs">%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">Até</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={t.maxPercent}
              onChange={(e) => onUpdateTier(idx, { maxPercent: Number(e.target.value) })}
              className="h-8 w-20"
            />
            <span className="text-xs">%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">Delta %</Label>
            <Input
              type="number"
              value={t.deltaPercent}
              onChange={(e) => onUpdateTier(idx, { deltaPercent: Number(e.target.value) })}
              className="h-8 w-20"
            />
          </div>
          <DeltaBadge delta={t.deltaPercent} />
          <Button variant="ghost" size="sm" onClick={() => onRemoveTier(idx)} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DELTA BADGE
// ============================================================================

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <Badge variant="secondary" className="text-xs shrink-0">Sem alteração</Badge>;
  if (delta < 0) {
    return (
      <Badge variant="secondary" className="text-xs shrink-0 text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950">
        <TrendingDown className="h-3 w-3 mr-0.5" />
        {delta}%
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs shrink-0 text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950">
      <TrendingUp className="h-3 w-3 mr-0.5" />
      +{delta}%
    </Badge>
  );
}
