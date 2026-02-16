/**
 * ============================================================================
 * TvDashboardPage — Telão público para TVs / Projetores
 * ============================================================================
 *
 * Rota: /ranking/display/:storeId?franchise=xxx
 *
 * - Firebase Anonymous Auth (auto-login)
 * - Lê APENAS docs agregados (rankingAgg, eventStats, challenges, prizes)
 * - Nunca lê orders diretamente
 * - Layout 70/30 com Top 3 hero + lista limpa
 * - Tema premium dark com dourado para destaques
 * - Throttle 5s para anti-flicker
 * - Transições CSS suaves
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useTvDashboard } from '@/hooks/useTvDashboard';
import { useTvRanking } from '@/hooks/useTvRanking';
import { useTvChallenges } from '@/hooks/useTvChallenges';
import { useTvWinners } from '@/hooks/useTvWinners';
import { useAutoRotation } from '@/hooks/useAutoRotation';
import { useCountUp } from '@/hooks/useCountUp';
import type {
  EventStats,
  RankingAggEntry,
  Challenge,
  Prize,
} from '@/types/tvDashboard';
import {
  Trophy,
  Target,
  Zap,
  Gift,
  ChevronUp,
  ChevronDown,
  Beer,
} from 'lucide-react';
import { formatVolumeCompact, formatVolumeShort } from '@/utils/formatVolume';

// ============================================================================
// HELPERS
// ============================================================================

const formatMl = formatVolumeCompact;
const formatMlShort = formatVolumeShort;

function timeRemaining(endsAt: { toMillis?: () => number; seconds?: number } | null): string {
  if (!endsAt) return '';
  const ms = typeof endsAt.toMillis === 'function' ? endsAt.toMillis() : (endsAt.seconds || 0) * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return '';
  const mins = Math.floor(diff / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function isStillActive(endsAt: { toMillis?: () => number; seconds?: number } | null): boolean {
  if (!endsAt) return true;
  const ms = typeof endsAt.toMillis === 'function' ? endsAt.toMillis() : (endsAt.seconds || 0) * 1000;
  return ms - Date.now() > 0;
}

function timeAgo(ts: { toMillis?: () => number; seconds?: number } | null): string {
  if (!ts) return '';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : (ts.seconds || 0) * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`;
  return `há ${Math.floor(diff / 3_600_000)}h`;
}

function goalProgressPercent(stats: EventStats): number {
  const ml = stats.totalMl || 0;
  if (!stats.goalTargetMl || stats.goalTargetMl <= 0) return 0;
  return Math.min(100, (ml / stats.goalTargetMl) * 100);
}

// ============================================================================
// STYLE TOKENS
// ============================================================================

const HERO_STYLES: Record<number, {
  cardClass: string;
  glowStyle: React.CSSProperties;
  badgeBg: string; badgeText: string; badgeIcon: string;
  volColor: string; nameSize: string; volSize: string;
  subColor: string;
}> = {
  1: {
    cardClass: 'border border-yellow-500/30',
    glowStyle: {
      background: 'linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(161,98,7,0.06) 50%, rgba(0,0,0,0) 100%)',
      boxShadow: '0 0 60px -12px rgba(234,179,8,0.25), 0 0 120px -30px rgba(234,179,8,0.10), inset 0 1px 0 rgba(255,255,255,0.06)',
    },
    badgeBg: 'bg-gradient-to-br from-yellow-400 to-amber-600', badgeText: 'text-black', badgeIcon: '👑',
    volColor: 'text-yellow-400', nameSize: 'text-xl sm:text-2xl lg:text-4xl', volSize: 'text-3xl sm:text-5xl lg:text-6xl',
    subColor: 'text-yellow-500/50',
  },
  2: {
    cardClass: 'border border-slate-400/20',
    glowStyle: {
      background: 'linear-gradient(135deg, rgba(148,163,184,0.08) 0%, rgba(71,85,105,0.04) 50%, rgba(0,0,0,0) 100%)',
      boxShadow: '0 0 40px -10px rgba(148,163,184,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
    },
    badgeBg: 'bg-gradient-to-br from-slate-300 to-slate-500', badgeText: 'text-black', badgeIcon: '🥈',
    volColor: 'text-slate-200', nameSize: 'text-base sm:text-lg lg:text-2xl', volSize: 'text-2xl sm:text-3xl lg:text-4xl',
    subColor: 'text-slate-400/40',
  },
  3: {
    cardClass: 'border border-amber-700/20',
    glowStyle: {
      background: 'linear-gradient(135deg, rgba(180,83,9,0.08) 0%, rgba(120,53,15,0.04) 50%, rgba(0,0,0,0) 100%)',
      boxShadow: '0 0 40px -10px rgba(217,119,6,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
    },
    badgeBg: 'bg-gradient-to-br from-amber-500 to-amber-800', badgeText: 'text-black', badgeIcon: '🥉',
    volColor: 'text-amber-400', nameSize: 'text-base sm:text-lg lg:text-2xl', volSize: 'text-2xl sm:text-3xl lg:text-4xl',
    subColor: 'text-amber-500/40',
  },
};

const PRIZE_ICONS: Record<string, string> = {
  coupon: '🎟️',
  free_drink: '🍺',
  pix: '💸',
  custom: '🎁',
};

/** Glass panel base style */
const GLASS_PANEL = 'backdrop-blur-md bg-white/[0.03] border border-white/[0.06] shadow-lg shadow-black/20';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Pagination dots indicator */
function PageDots({
  total,
  current,
  color = 'bg-yellow-400',
}: {
  total: number;
  current: number;
  color?: string;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 mt-3">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            i === current ? `${color} w-4` : 'bg-white/15'
          }`}
          onClick={() => {}}
          aria-label={`Page ${i + 1}`}
        />
      ))}
    </div>
  );
}

/** Animated volume display using useCountUp */
function AnimatedVolume({
  ml,
  className,
}: {
  ml: number;
  className: string;
}) {
  const animated = useCountUp(ml);
  const formatted = useMemo(() => {
    const val = Math.round(animated);
    if (val >= 1000) {
      const liters = val / 1000;
      const str = liters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      // Remove trailing ".0" / ",0"
      return str.replace(/[,.]0$/, '') + 'L';
    }
    return `${val}mL`;
  }, [animated]);

  return <span className={className}>{formatted}</span>;
}

/** Header — premium glass bar */
function TvHeader({
  eventLabel,
  totalServes,
  totalMl,
  uniqueCustomers,
  rankingWindow,
  clock,
  eventMode,
}: {
  eventLabel?: string;
  totalServes: number;
  totalMl: number;
  uniqueCustomers: number;
  rankingWindow: string;
  clock: Date;
  eventMode?: EventStats['eventMode'];
}) {
  const windowLabel = rankingWindow === '30min' ? 'Últimos 30 min' : rankingWindow === '1h' ? 'Última hora' : 'Hoje';

  return (
    <header className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 backdrop-blur-xl bg-black/40 border-b border-white/[0.06]">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        {/* Gold trophy icon with glow */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 blur-lg bg-yellow-500/20 rounded-full" />
          <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-400 relative" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-xl font-bold tracking-tight text-white leading-tight truncate">
            {eventLabel || 'Ranking ao Vivo'}
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-3 mt-0.5 flex-wrap">
            {/* Stats chips */}
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-[10px] sm:text-xs text-white/50 bg-white/[0.06] px-1.5 sm:px-2.5 py-0.5 rounded-full font-medium tabular-nums">
                🍺 {formatMlShort(totalMl || 0)}
              </span>
              <span className="text-[10px] sm:text-xs text-white/50 bg-white/[0.06] px-1.5 sm:px-2.5 py-0.5 rounded-full font-medium tabular-nums">
                ⚡ {totalServes}
              </span>
              <span className="text-[10px] sm:text-xs text-white/50 bg-white/[0.06] px-1.5 sm:px-2.5 py-0.5 rounded-full font-medium tabular-nums">
                👥 {uniqueCustomers}
              </span>
            </div>
            <span className="text-[10px] text-yellow-400/80 border border-yellow-500/25 bg-yellow-500/[0.06] px-2 sm:px-2.5 py-0.5 rounded-full font-semibold">
              {windowLabel}
            </span>
            {eventMode?.enabled && (
              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[10px] font-black animate-pulse leading-none shadow-lg shadow-yellow-500/20">
                ⚡ {eventMode.label || 'EVENTO'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <p className="text-lg sm:text-3xl font-mono font-bold text-white/80 tabular-nums tracking-wider">
          {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-red-500/15 border border-red-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">AO VIVO</span>
        </div>
      </div>
    </header>
  );
}

/** Top 3 Hero Cards — with glow + gradients */
function HeroCards({
  top3,
  rankingWindow,
}: {
  top3: RankingAggEntry[];
  rankingWindow: string;
}) {
  if (top3.length === 0) return null;

  const getField = (entry: RankingAggEntry) =>
    rankingWindow === '30min' || rankingWindow === '1h' ? entry.totalMl30min : entry.totalMl;

  const first = top3[0];
  const runners = top3.slice(1);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
      {/* #1 — Dominant hero with glow-pulse */}
      <div
        className={`col-span-1 sm:col-span-2 lg:col-span-1 rounded-2xl p-4 sm:p-6 lg:p-8 ${HERO_STYLES[1].cardClass} relative overflow-hidden transition-all duration-500 animate-glow-pulse`}
        style={{
          background: HERO_STYLES[1].glowStyle.background,
        }}
      >
        {/* Animated shimmer line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
          <div className="absolute inset-0 w-[200%] bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent animate-shimmer" />
        </div>

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-3">
            <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${HERO_STYLES[1].badgeBg} ${HERO_STYLES[1].badgeText} text-lg font-black shadow-lg shadow-yellow-500/30`}>
              {HERO_STYLES[1].badgeIcon}
            </span>
            {(first.positionChange ?? 0) !== 0 && (
              <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-full ${(first.positionChange ?? 0) > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                {(first.positionChange ?? 0) > 0 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {Math.abs(first.positionChange ?? 0)}
              </div>
            )}
          </div>
          <p className={`${HERO_STYLES[1].nameSize} font-extrabold text-white truncate leading-tight`}>
            {first.displayName}
          </p>
          <AnimatedVolume
            ml={getField(first)}
            className={`${HERO_STYLES[1].volSize} font-black ${HERO_STYLES[1].volColor} tabular-nums leading-none mt-2 drop-shadow-[0_0_20px_rgba(234,179,8,0.3)] block`}
          />
          <p className={`text-sm ${HERO_STYLES[1].subColor} mt-3 font-medium`}>
            {first.orderCount} pedidos{first.favoriteDrink ? ` · ${first.favoriteDrink}` : ''}
          </p>
        </div>
      </div>

      {/* #2 + #3 stacked */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex flex-col gap-3 sm:gap-4">
        {runners.map((entry, i) => {
          const pos = i + 2;
          const style = HERO_STYLES[pos];
          const change = entry.positionChange ?? 0;

          return (
            <div
              key={entry.customerId}
              className={`flex-1 rounded-2xl p-5 ${style.cardClass} relative overflow-hidden transition-all duration-500`}
              style={style.glowStyle}
            >
              {/* Shimmer top line */}
              <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent ${pos === 2 ? 'via-slate-400/30' : 'via-amber-500/30'} to-transparent`} />

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-2">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${style.badgeBg} ${style.badgeText} text-sm font-black shadow-lg ${pos === 2 ? 'shadow-slate-400/20' : 'shadow-amber-600/20'}`}>
                    {style.badgeIcon}
                  </span>
                  {change !== 0 && (
                    <div className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${change > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                      {change > 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {Math.abs(change)}
                    </div>
                  )}
                </div>
                <p className={`${style.nameSize} font-bold text-white/90 truncate leading-tight`}>
                  {entry.displayName}
                </p>
                <AnimatedVolume
                  ml={getField(entry)}
                  className={`${style.volSize} font-black ${style.volColor} tabular-nums leading-none mt-1 block`}
                />
                <p className={`text-xs ${style.subColor} mt-2 font-medium`}>
                  {entry.orderCount} pedidos{entry.favoriteDrink ? ` · ${entry.favoriteDrink}` : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Clean list for positions 4+ with auto-rotation */
function RankingList({
  entries,
  startPos,
  rankingWindow,
  rotationInterval,
}: {
  entries: RankingAggEntry[];
  startPos: number;
  rankingWindow: string;
  rotationInterval: number;
}) {
  const getField = (entry: RankingAggEntry) =>
    rankingWindow === '30min' || rankingWindow === '1h' ? entry.totalMl30min : entry.totalMl;

  const { visibleItems, currentPage, totalPages } = useAutoRotation(entries, 6, rotationInterval);

  if (entries.length === 0) return null;

  return (
    <div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] text-white/20 font-medium tabular-nums">
            {startPos + currentPage * 6}–{Math.min(startPos + currentPage * 6 + 5, startPos + entries.length - 1)}º de {entries.length + startPos - 1}
          </span>
        </div>
      )}
      <div className="space-y-1" key={currentPage}>
        {visibleItems.map((entry, i) => {
          const pos = startPos + currentPage * 6 + i;
          const change = entry.positionChange ?? 0;
          const vol = getField(entry);

          return (
            <div
              key={entry.customerId}
              className="flex items-center gap-4 py-3 px-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/[0.04] transition-all duration-300 animate-fade-slide-up"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <span className="w-8 text-center text-base font-bold text-white/20 tabular-nums">{pos}º</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/75 truncate">{entry.displayName}</p>
                <p className="text-[10px] text-white/25 mt-0.5">{entry.orderCount} pedidos</p>
              </div>
              {change !== 0 && (
                <div className={`flex items-center gap-0.5 text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${change > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                  {change > 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {Math.abs(change)}
                </div>
              )}
              <p className={`text-base font-bold tabular-nums w-20 text-right shrink-0 ${vol > 0 ? 'text-yellow-500/60' : 'text-white/15'}`}>
                {formatMl(vol)}
              </p>
            </div>
          );
        })}
      </div>
      <PageDots total={totalPages} current={currentPage} color="bg-yellow-400" />
    </div>
  );
}

/** Leaderboard — Top 3 hero + clean list */
function LeaderboardPanel({
  ranking,
  rankingWindow,
  rotationInterval,
}: {
  ranking: RankingAggEntry[];
  rankingWindow: string;
  rotationInterval: number;
}) {
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <div className="flex flex-col h-full">
      {ranking.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-yellow-500/10 rounded-full scale-150" />
            <div className="relative w-24 h-24 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
              <Beer className="h-10 w-10 text-white/10 animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg text-white/30 font-bold">Aguardando primeiros pedidos…</p>
            <p className="text-sm text-white/15">Compre no Kiosk para entrar no ranking!</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <HeroCards top3={top3} rankingWindow={rankingWindow} />
          <RankingList entries={rest} startPos={4} rankingWindow={rankingWindow} rotationInterval={rotationInterval} />
        </div>
      )}
    </div>
  );
}

/** Goal Panel — premium progress bar with glow */
function GoalPanel({ stats }: { stats: EventStats }) {
  const progress = goalProgressPercent(stats);
  const nextMilestone = stats.milestones?.find((m) => !m.reached);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-bold text-white/80 flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Target className="h-3.5 w-3.5 text-yellow-400" />
        </div>
        {stats.goalLabel || 'Meta Coletiva'}
      </h2>

      <div className="relative mb-4">
        <div className="h-6 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
          <div
            className="h-full bg-gradient-to-r from-yellow-600 via-yellow-500 to-amber-400 rounded-full transition-all duration-2000 ease-out relative"
            style={{ width: `${progress}%` }}
          >
            {/* Animated shine */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse rounded-full" />
            {progress > 12 && (
              <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-black drop-shadow-sm">
                {progress.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-white/30 font-medium">
          <span>{formatMlShort(stats.totalMl || 0)}</span>
          <span>{stats.goalTargetMl ? formatMlShort(stats.goalTargetMl) : '—'}</span>
        </div>
      </div>

      {stats.milestones && stats.milestones.length > 0 && (
        <div className="space-y-1.5 flex-1">
          {stats.milestones.map((m, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                m.reached
                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                  : 'bg-white/[0.02] border-white/[0.03] text-white/30'
              }`}
            >
              <span className="text-sm">{m.reached ? '✅' : '⬜'}</span>
              <span className="flex-1 truncate">{m.label}</span>
              <span className="text-[10px] opacity-60 tabular-nums">{formatMlShort(m.targetMl)}</span>
            </div>
          ))}
        </div>
      )}

      {nextMilestone && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-yellow-500/[0.08] to-amber-600/[0.04] border border-yellow-500/15 text-center">
          <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Próximo desbloqueio</p>
          <p className="text-sm font-bold text-yellow-300 mt-1">{nextMilestone.label}</p>
          <p className="text-[10px] text-white/25 mt-0.5">
            Faltam {formatMlShort(Math.max(0, nextMilestone.targetMl - (stats.totalMl || 0)))}
          </p>
        </div>
      )}
    </div>
  );
}

/** Challenge Panel — auto-rotating glass cards */
function ChallengePanel({ challenges, rotationInterval }: { challenges: Challenge[]; rotationInterval: number }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter out expired challenges — memoize to avoid new array reference every tick
  const active = useMemo(
    () => challenges.filter((ch) => isStillActive(ch.endsAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challenges, Math.floor(Date.now() / 5000)] // re-evaluate every ~5s
  );

  const { visibleItems, currentPage, totalPages } = useAutoRotation(active, 2, rotationInterval);

  if (active.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-sm font-bold text-white/80 flex items-center gap-2.5 mb-4">
          <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Zap className="h-3.5 w-3.5 text-purple-400" />
          </div>
          Desafios
        </h2>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <Zap className="h-6 w-6 text-white/[0.07]" />
          </div>
          <p className="text-xs text-white/20 font-medium mt-1">Sem desafios agora</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-bold text-white/80 flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <Zap className="h-3.5 w-3.5 text-purple-400" />
        </div>
        Desafios Ativos
        {active.length > 2 && (
          <span className="text-[10px] text-white/20 ml-auto tabular-nums">{active.length} total</span>
        )}
      </h2>

      <div className="space-y-3 flex-1" key={currentPage}>
        {visibleItems.map((ch, i) => {
          const remaining = timeRemaining(ch.endsAt);

          return (
            <div
              key={ch.id}
              className="p-3.5 rounded-xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.06] transition-all hover:border-purple-500/20 animate-fade-slide-up"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-white/85 text-sm truncate flex-1">{ch.title}</h3>
                {remaining && (
                  <span className="text-sm text-yellow-300 font-mono font-bold tabular-nums ml-2 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 rounded-full">
                    {remaining}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/30 mb-2.5 truncate">{ch.description}</p>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/30 bg-white/[0.03] px-2 py-0.5 rounded-full">
                  🏆 {ch.rewardDescription || ch.rewardType}
                </span>
                <span className="text-green-400/70 font-semibold">
                  {ch.completedCount} completaram
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <PageDots total={totalPages} current={currentPage} color="bg-purple-400" />
    </div>
  );
}

/** Winners Panel — auto-rotating glass list with icons */
function WinnersPanel({ winners, rotationInterval }: { winners: Prize[]; rotationInterval: number }) {
  const { visibleItems, currentPage, totalPages } = useAutoRotation(winners, 3, rotationInterval);

  if (winners.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-sm font-bold text-white/80 flex items-center gap-2.5 mb-4">
          <div className="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
            <Gift className="h-3.5 w-3.5 text-pink-400" />
          </div>
          Ganhadores
        </h2>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-3xl animate-bounce">🎁</span>
          <p className="text-xs text-white/25 font-semibold mt-1">Seja o primeiro a ganhar!</p>
          <p className="text-[10px] text-white/12">Complete um desafio para aparecer aqui</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-bold text-white/80 flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
          <Gift className="h-3.5 w-3.5 text-pink-400" />
        </div>
        Ganhadores
        {winners.length > 3 && (
          <span className="text-[10px] text-white/20 ml-auto tabular-nums">{winners.length} total</span>
        )}
      </h2>

      <div className="space-y-2 flex-1 overflow-hidden" key={currentPage}>
        {visibleItems.map((w, i) => (
          <div
            key={w.id}
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-white/[0.03] to-transparent border border-white/[0.04] transition-all animate-fade-slide-up"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
          >
            <span className="text-lg">{PRIZE_ICONS[w.type] || '🎁'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/65 truncate">
                {w.winnerDisplayName || 'Anônimo'}
              </p>
              <p className="text-[10px] text-white/25 truncate">{w.description}</p>
            </div>
            <span className="text-[10px] text-white/20 shrink-0 bg-white/[0.03] px-2 py-0.5 rounded-full">
              {w.wonAt ? timeAgo(w.wonAt) : ''}
            </span>
          </div>
        ))}
      </div>
      <PageDots total={totalPages} current={currentPage} color="bg-pink-400" />
    </div>
  );
}

/** Footer — premium glass CTA */
function TvFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-black/60 border-t border-white/[0.06] h-10 sm:h-12 flex items-center justify-center gap-4 sm:gap-10 px-4 sm:px-6">
      <span className="text-[10px] sm:text-xs text-white/35 flex items-center gap-1.5 sm:gap-2 font-medium">
        <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-yellow-400">1</span>
        Compre no Kiosk
      </span>
      <span className="text-white/10 text-sm sm:text-lg hidden xs:inline">→</span>
      <span className="text-[10px] sm:text-xs text-white/35 flex items-center gap-1.5 sm:gap-2 font-medium">
        <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-purple-400">2</span>
        Suba no ranking
      </span>
      <span className="text-white/10 text-sm sm:text-lg hidden xs:inline">→</span>
      <span className="text-[10px] sm:text-xs text-white/35 flex items-center gap-1.5 sm:gap-2 font-medium">
        <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-pink-400">3</span>
        Ganhe prêmios
      </span>
    </footer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TvDashboardPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams] = useSearchParams();
  const franchiseId = searchParams.get('franchise') || '';

  // ── Anonymous Auth ──
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
      } else {
        signInAnonymously(auth).catch((err) => {
          console.error('[TvDashboard] anonymous auth error:', err);
          setAuthError('Erro de autenticação');
        });
      }
    });
    return () => unsub();
  }, []);

  // ── Clock ──
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Data Hooks (only subscribe after auth ready) ──
  const fid = authReady ? franchiseId : null;
  const sid = authReady ? storeId : null;

  const { tvConfig, eventStats, isLoading: configLoading, error: configError } = useTvDashboard(fid, sid);
  const { ranking } = useTvRanking(fid, sid, tvConfig.rankingWindow, tvConfig.maxDisplayPositions);
  const { challenges } = useTvChallenges(fid, sid);
  const { winners } = useTvWinners(fid, sid);

  const activePanels = tvConfig.panels || ['ranking', 'goal', 'challenge', 'winners'];

  // ── Derived stats ──
  const uniqueCustomers = eventStats.uniqueCustomers ?? ranking.length;

  // ── Loading / Error States ──
  if (!franchiseId || !storeId) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center">
        <p className="text-red-400 text-2xl">Parâmetros de loja inválidos</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center">
        <p className="text-red-400 text-2xl">{authError}</p>
      </div>
    );
  }

  if (!authReady || configLoading) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-white/[0.06]" />
            <div className="absolute inset-0 rounded-full border-4 border-yellow-400 border-t-transparent animate-spin" />
          </div>
          <p className="text-white/30 text-lg font-medium">Conectando...</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center">
        <p className="text-red-400 text-xl">{configError}</p>
      </div>
    );
  }

  const showGoal = activePanels.includes('goal') && eventStats.goalEnabled;
  const showChallenge = activePanels.includes('challenge');
  const showWinners = activePanels.includes('winners');
  const hasSidebar = showGoal || showChallenge || showWinners;

  // Rotation interval for auto-cycling panels (default 10s)
  const rotationInterval = (tvConfig.rotationIntervalSec || 10) * 1000;

  return (
    <div className="min-h-screen bg-[#07080a] text-white overflow-hidden select-none">
      {/* Rich ambient background — multi-color mesh */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Warm gold glow top-left */}
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full opacity-30"
          style={{ background: 'radial-gradient(ellipse, rgba(234,179,8,0.08) 0%, transparent 70%)' }} />
        {/* Cool purple glow top-right */}
        <div className="absolute -top-[10%] -right-[10%] w-[50%] h-[50%] rounded-full opacity-30"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)' }} />
        {/* Subtle pink glow bottom */}
        <div className="absolute -bottom-[15%] left-[30%] w-[40%] h-[40%] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, rgba(236,72,153,0.05) 0%, transparent 70%)' }} />
        {/* Noise overlay for texture */}
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />
      </div>

      {/* ── Header ── */}
      <TvHeader
        eventLabel={tvConfig.eventLabel}
        totalServes={eventStats.totalServes}
        totalMl={eventStats.totalMl}
        uniqueCustomers={uniqueCustomers}
        rankingWindow={tvConfig.rankingWindow}
        clock={clock}
        eventMode={eventStats.eventMode}
      />

      {/* ── Main Grid ── */}
      <main className="relative px-3 sm:px-5 py-3 sm:py-4 h-[calc(100vh-52px-40px)] sm:h-[calc(100vh-60px-48px)]">
        <div className={`grid gap-3 sm:gap-4 h-full ${
          hasSidebar
            ? 'grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]'
            : 'grid-cols-1'
        }`}>
          {/* Column 1: Leaderboard */}
          <div className={`${GLASS_PANEL} rounded-xl sm:rounded-2xl p-3 sm:p-6 overflow-hidden`}>
            <LeaderboardPanel
              ranking={ranking}
              rankingWindow={tvConfig.rankingWindow}
              rotationInterval={rotationInterval}
            />
          </div>

          {/* Column 2: Sidebar */}
          {hasSidebar && (
            <div className="flex flex-col gap-3 sm:gap-4 overflow-hidden">
              {showGoal && (
                <div className={`${GLASS_PANEL} rounded-xl sm:rounded-2xl p-3 sm:p-5 flex-1 min-h-0 overflow-hidden`}>
                  <GoalPanel stats={eventStats} />
                </div>
              )}
              {showChallenge && (
                <div className={`${GLASS_PANEL} rounded-xl sm:rounded-2xl p-3 sm:p-5 flex-1 min-h-0 overflow-hidden`}>
                  <ChallengePanel challenges={challenges} rotationInterval={rotationInterval} />
                </div>
              )}
              {showWinners && (
                <div className={`${GLASS_PANEL} rounded-xl sm:rounded-2xl p-3 sm:p-5 flex-1 min-h-0 overflow-hidden`}>
                  <WinnersPanel winners={winners} rotationInterval={rotationInterval} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <TvFooter />
    </div>
  );
}
