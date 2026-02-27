/**
 * ============================================================================
 * StoreOperationsTab — Operação ao Vivo (Live Operations)
 * ============================================================================
 *
 * Tab de operacoes real-time para monitoramento de torneiras e sessoes.
 * - Tap cards com onSnapshot (real-time)
 * - Lista das ultimas servingSessions
 * - Resumo diario (ml dispensados, sessoes, perdas)
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState } from 'react';
import { formatVolumeCompact } from '@/utils/formatVolume';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RefreshCcw,
  Beer,
  Activity,
  Droplets,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTapsRealtime } from '@/hooks/useTapsRealtime';
import { kegKeys } from '@/hooks/useKegs';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface StoreOperationsTabProps {
  franchiseId: string;
  storeId: string;
}

interface SessionRow {
  eventId: string;
  orderId: string;
  tapId: string;
  kegId: string | null;
  cupIndex: number;
  targetMl: number;
  actualMl: number;
  status: string;
  createdAt: Date;
  errorCode?: string;
}

interface KegInfo {
  kegId: string;
  productId: string;
  volumeMl: number;
  remainingMl: number;
  status: string;
  batchCode?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function storePath(franchiseId: string, storeId: string) {
  return `franchises/${franchiseId}/stores/${storeId}`;
}

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// formatMl delegado ao utilitário centralizado formatVolume
function formatMl(ml: number): string {
  return formatVolumeCompact(ml);
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function SessionStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          OK
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" className="text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Erro
        </Badge>
      );
    case 'canceled':
      return (
        <Badge variant="secondary" className="text-xs">
          Cancelado
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

// ============================================================================
// TAP CARD COMPONENT
// ============================================================================

function TapCard({
  tap,
  keg,
  productTitle,
}: {
  tap: { tapId: string; status: string; currentKegId: string | null; todayMlDispensed: number; todaySessions: number; todayWastageMl: number };
  keg: KegInfo | null;
  productTitle: string;
}) {
  const pctRemaining = keg ? Math.round((keg.remainingMl / keg.volumeMl) * 100) : 0;
  // Strict: both tap.currentKegId must exist AND match the keg we found
  const isActive = !!tap.currentKegId && !!keg && tap.currentKegId === keg.kegId;
  // Inconsistent: tap says it has a keg but we can't find the keg data
  const isLoading = !!tap.currentKegId && !keg;

  return (
    <div
      className={cn(
        'p-4 border rounded-lg',
        isActive ? 'border-green-200 bg-green-50' : 'border-border bg-muted'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm">
          Torneira {Number(tap.tapId) + 1}
        </span>
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className={cn(isActive && 'bg-green-600 hover:bg-green-700', 'text-xs')}
        >
          {isActive ? 'Ativa' : isLoading ? 'Carregando...' : tap.status === 'maintenance' ? 'Manut.' : 'Livre'}
        </Badge>
      </div>

      {keg ? (
        <>
          <p className="text-xs text-muted-foreground truncate font-medium">{productTitle}</p>
          <p className="text-xs text-muted-foreground">{keg.batchCode || keg.kegId.slice(0, 8)}</p>

          {/* Volume bar */}
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
              {formatMl(keg.remainingMl)} / {formatMl(keg.volumeMl)} ({pctRemaining}%)
            </p>
          </div>

          {/* Today's stats */}
          <div className="mt-3 grid grid-cols-3 gap-1 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Hoje</p>
              <p className="text-sm font-semibold">{formatMl(tap.todayMlDispensed)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Servidas</p>
              <p className="text-sm font-semibold">{tap.todaySessions}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Perda</p>
              <p className={cn('text-sm font-semibold', tap.todayWastageMl > 0 && 'text-red-600')}>
                {formatMl(tap.todayWastageMl)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">Sem barril conectado</p>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoreOperationsTab({ franchiseId, storeId }: StoreOperationsTabProps) {
  const queryClient = useQueryClient();
  const [tapFilter, setTapFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const base = storePath(franchiseId, storeId);

  // ── Real-time tap subscription (shared hook) ─────────────────────────────
  const { taps, loading: loadingTaps, error: tapsError } = useTapsRealtime(franchiseId, storeId);

  // ── Fetch kegs (shared cache key with useKegs) ───────────────────────────
  const { data: kegsMap = {} } = useQuery({
    queryKey: [...kegKeys.all(franchiseId, storeId), 'tapped'],
    queryFn: async (): Promise<Record<string, KegInfo>> => {
      const kegsRef = collection(db, base, 'kegs');
      const q = query(kegsRef, where('status', '==', 'tapped'));
      const snap = await getDocs(q);
      const map: Record<string, KegInfo> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[d.id] = {
          kegId: d.id,
          productId: (data.productId as string) || '',
          volumeMl: (data.volumeMl as number) || 0,
          remainingMl: (data.remainingMl as number) || 0,
          status: (data.status as string) || 'in_stock',
          batchCode: data.batchCode as string | undefined,
        };
      });
      return map;
    },
    enabled: !!franchiseId && !!storeId,
    refetchInterval: 30000, // refresh every 30s
  });

  // ── Fetch products (for names) ──────────────────────────────────────────
  const { data: productsMap = {} } = useQuery({
    queryKey: ['ops-products', franchiseId, storeId],
    queryFn: async (): Promise<Record<string, string>> => {
      const productsRef = collection(db, base, 'products');
      const snap = await getDocs(productsRef);
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[d.id] = (data.title as string) || (data.name as string) || d.id;
      });
      return map;
    },
    enabled: !!franchiseId && !!storeId,
  });

  // ── Fetch recent serving sessions ───────────────────────────────────────
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['ops-sessions', franchiseId, storeId, tapFilter, statusFilter],
    queryFn: async (): Promise<SessionRow[]> => {
      const sessionsRef = collection(db, base, 'servingSessions');

      // Build query conditionally to avoid TypeScript overload issues
      let q;
      if (tapFilter !== 'all' && statusFilter !== 'all') {
        q = query(sessionsRef,
          where('tapId', '==', tapFilter),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(30),
        );
      } else if (tapFilter !== 'all') {
        q = query(sessionsRef,
          where('tapId', '==', tapFilter),
          orderBy('createdAt', 'desc'),
          limit(30),
        );
      } else if (statusFilter !== 'all') {
        q = query(sessionsRef,
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(30),
        );
      } else {
        q = query(sessionsRef,
          orderBy('createdAt', 'desc'),
          limit(30),
        );
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          eventId: d.id,
          orderId: (data.orderId as string) || '',
          tapId: (data.tapId as string) || '0',
          kegId: (data.kegId as string) ?? null,
          cupIndex: (data.cupIndex as number) || 0,
          targetMl: (data.targetMl as number) || 0,
          actualMl: (data.actualMl as number) || 0,
          status: (data.status as string) || 'completed',
          createdAt: toDate(data.createdAt),
          errorCode: data.errorCode as string | undefined,
        };
      });
    },
    enabled: !!franchiseId && !!storeId,
    refetchInterval: 15000, // refresh every 15s
  });

  // ── Derived stats ───────────────────────────────────────────────────────
  const totalTodayMl = taps.reduce((sum, t) => sum + t.todayMlDispensed, 0);
  const totalTodaySessions = taps.reduce((sum, t) => sum + t.todaySessions, 0);
  const totalTodayWaste = taps.reduce((sum, t) => sum + t.todayWastageMl, 0);
  const activeTaps = taps.filter((t) => t.currentKegId).length;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: kegKeys.all(franchiseId, storeId) });
    queryClient.invalidateQueries({ queryKey: ['ops-sessions', franchiseId, storeId] });
    queryClient.invalidateQueries({ queryKey: ['ops-products', franchiseId, storeId] });
  };

  if (loadingTaps) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* [FIX Bug-5] Exibir erro do listener de taps */}
      {tapsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Erro ao carregar torneiras</p>
            <p className="text-xs text-red-600">{tapsError && typeof tapsError === 'object' && 'message' in tapsError ? (tapsError as Error).message : 'Verifique as permissões ou a conexão.'}</p>
          </div>
        </div>
      )}
      {/* ── SUMMARY CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Beer className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Taps Ativas</p>
            </div>
            <p className="text-2xl font-bold">
              {activeTaps} / {taps.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Droplets className="h-4 w-4 text-blue-500" />
              <p className="text-sm text-muted-foreground">Dispensado Hoje</p>
            </div>
            <p className="text-2xl font-bold text-blue-700">{formatMl(totalTodayMl)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-green-500" />
              <p className="text-sm text-muted-foreground">Sessoes Hoje</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{totalTodaySessions}</p>
          </CardContent>
        </Card>
        <Card className={cn(totalTodayWaste > 0 && 'border-red-200')}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <p className="text-sm text-muted-foreground">Perdas Hoje</p>
            </div>
            <p className={cn('text-2xl font-bold', totalTodayWaste > 0 ? 'text-red-600' : '')}>
              {formatMl(totalTodayWaste)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── TAP CARDS (REAL-TIME) ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <Beer className="h-5 w-5 mr-2" />
              Torneiras — Tempo Real
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCcw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {taps.map((tap) => {
              const keg = tap.currentKegId ? kegsMap[tap.currentKegId] : null;
              const productTitle = keg ? (productsMap[keg.productId] || keg.productId) : '';
              return (
                <TapCard key={tap.tapId} tap={tap} keg={keg} productTitle={productTitle} />
              );
            })}
            {taps.length === 0 && (
              <p className="col-span-4 text-center text-muted-foreground py-4">
                Nenhuma torneira configurada
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── RECENT SERVING SESSIONS ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Ultimas Servidas
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={tapFilter} onValueChange={setTapFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Tap" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Taps</SelectItem>
                  {taps.map((t) => (
                    <SelectItem key={t.tapId} value={t.tapId}>
                      Torneira {Number(t.tapId) + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="completed">OK</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>Nenhuma sessao registrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tap</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Real</TableHead>
                  <TableHead>Diff</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const diff = s.actualMl - s.targetMl;
                  const diffPct = s.targetMl > 0 ? Math.round((diff / s.targetMl) * 100) : 0;
                  const isOverPour = diff > 0 && diffPct > 10;
                  const isUnderPour = diff < 0 && Math.abs(diffPct) > 10;

                  return (
                    <TableRow key={s.eventId}>
                      <TableCell className="text-sm font-mono">
                        {formatTime(s.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          T{Number(s.tapId) + 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {s.orderId.length > 12 ? `...${s.orderId.slice(-8)}` : s.orderId}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatMl(s.targetMl)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {formatMl(s.actualMl)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'text-xs',
                          isOverPour && 'text-red-600 font-medium',
                          isUnderPour && 'text-yellow-600 font-medium',
                          !isOverPour && !isUnderPour && 'text-muted-foreground'
                        )}>
                          {diff >= 0 ? '+' : ''}{formatMl(diff)} ({diffPct >= 0 ? '+' : ''}{diffPct}%)
                        </span>
                      </TableCell>
                      <TableCell>
                        <SessionStatusBadge status={s.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
