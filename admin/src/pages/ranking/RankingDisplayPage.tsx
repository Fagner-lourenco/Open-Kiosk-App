/**
 * ============================================================================
 * RankingDisplayPage — Página pública para TVs / Projetores
 * ============================================================================
 *
 * Rota: /ranking/display/:storeId?franchise=xxx
 *
 * - Sem autenticação (público)
 * - Fundo escuro, fontes grandes
 * - Top 10, métrica "Total mL", somente hoje
 * - Atualização em tempo real (onSnapshot)
 * - Relógio digital no canto
 * - Nomes parcialmente mascarados (LGPD)
 * - Auto-scroll se necessário
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ordersPath } from '@/lib/pathResolver';
import { Trophy, Droplets, Beer, Clock } from 'lucide-react';
import type { FirestoreOrder, RankingEntry } from '@/types/ranking';

// ============================================================================
// HELPERS
// ============================================================================

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Máscara LGPD: "João Miguel Santos" → "João M. S."
 */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return [
    parts[0],
    ...parts.slice(1).map((p) => `${p[0]?.toUpperCase()}.`),
  ].join(' ');
}

/**
 * Formata mL para display legível
 */
function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
  return `${Math.round(ml)}mL`;
}

/**
 * Agrega orders em ranking (mesma lógica do hook, otimizada para display)
 */
function aggregateForDisplay(orders: FirestoreOrder[]): RankingEntry[] {
  const byCustomer = new Map<string, {
    customerName: string;
    totalMl: number;
    totalSpent: number;
    orderCount: number;
    drinkBreakdown: Record<string, number>;
  }>();

  for (const order of orders) {
    if (!order.customerName) continue;
    if (order.status !== 'paid_pending_dispense' && order.status !== 'completed' && order.status !== 'dispensing') continue;

    const key = order.customerIdentification || order.customerName.toUpperCase().trim();
    let entry = byCustomer.get(key);

    if (!entry) {
      entry = {
        customerName: order.customerName,
        totalMl: 0,
        totalSpent: 0,
        orderCount: 0,
        drinkBreakdown: {},
      };
      byCustomer.set(key, entry);
    }

    entry.orderCount++;
    entry.totalSpent += order.total || 0;

    for (const item of (order.items || [])) {
      if (item.mlPerUnit && item.mlPerUnit > 0) {
        const ml = item.mlPerUnit * item.quantity;
        entry.totalMl += ml;
        const drinkName = item.title?.split(' - ')[0]?.trim() || item.title || 'Desconhecido';
        entry.drinkBreakdown[drinkName] = (entry.drinkBreakdown[drinkName] || 0) + ml;
      }
    }
  }

  const entries: RankingEntry[] = Array.from(byCustomer.values())
    .map((e) => {
      const favoriteDrink = Object.entries(e.drinkBreakdown)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
      return { ...e, favoriteDrink, position: 0 };
    })
    .sort((a, b) => b.totalMl - a.totalMl)
    .slice(0, 10)
    .map((e, i) => ({ ...e, position: i + 1 }));

  return entries;
}

// ============================================================================
// MEDAL STYLES
// ============================================================================

const POSITION_STYLES: Record<number, { bg: string; text: string; emoji: string }> = {
  1: { bg: 'from-yellow-500/30 to-yellow-600/10', text: 'text-yellow-300', emoji: '🥇' },
  2: { bg: 'from-gray-400/20 to-gray-500/10', text: 'text-gray-300', emoji: '🥈' },
  3: { bg: 'from-amber-700/25 to-amber-800/10', text: 'text-amber-400', emoji: '🥉' },
};

// ============================================================================
// COMPONENTE
// ============================================================================

export function RankingDisplayPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams] = useSearchParams();
  const franchiseId = searchParams.get('franchise') || '';

  const [orders, setOrders] = useState<FirestoreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  // Relógio atualizado a cada segundo
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // onSnapshot para real-time
  useEffect(() => {
    if (!franchiseId || !storeId) {
      setError('Parâmetros de loja inválidos');
      setIsLoading(false);
      return;
    }

    const today = todayYMD();
    const path = ordersPath(franchiseId, storeId);
    const pathSegments = path.split('/');
    const colRef = collection(db, pathSegments[0], ...pathSegments.slice(1));

    const q = query(
      colRef,
      where('date', '==', today),
      orderBy('date', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          ...d.data(),
          orderNumber: d.id,
        })) as FirestoreOrder[];
        setOrders(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error('[RankingDisplayPage] snapshot error:', err);
        setError('Erro ao conectar com o servidor');
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [franchiseId, storeId]);

  const ranking = useMemo(() => aggregateForDisplay(orders), [orders]);

  // Totais
  const totalMlAll = useMemo(() => ranking.reduce((s, e) => s + e.totalMl, 0), [ranking]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400 text-2xl">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white overflow-hidden select-none">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/20">
            <Trophy className="h-10 w-10 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Ranking do Dia
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Quem bebe mais hoje? Compete aí!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Total consumido */}
          <div className="text-right hidden md:block">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total consumido</p>
            <p className="text-2xl font-bold text-blue-400 flex items-center gap-1 justify-end">
              <Droplets className="h-5 w-5" />
              {formatMl(totalMlAll)}
            </p>
          </div>

          {/* Relógio */}
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Agora</p>
            <p className="text-2xl font-mono font-bold text-white flex items-center gap-1 justify-end">
              <Clock className="h-5 w-5 text-gray-500" />
              {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>

          {/* Badge ao vivo */}
          <div className="flex items-center gap-1.5 bg-red-500/20 px-3 py-1.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
              Ao Vivo
            </span>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="px-8 py-6 h-[calc(100vh-100px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-lg">Carregando ranking...</p>
            </div>
          </div>
        ) : ranking.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Beer className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-2xl font-medium">
              Nenhum consumo registrado hoje
            </p>
            <p className="text-gray-600 text-lg">
              Seja o primeiro! Peça sua cerveja no totem.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {ranking.map((entry) => {
              const pos = entry.position ?? 0;
              const posStyle = POSITION_STYLES[pos];
              const isTop3 = pos <= 3;

              return (
                <div
                  key={entry.customerName + pos}
                  className={`
                    flex items-center gap-4 rounded-xl px-6 transition-all
                    ${isTop3
                      ? `bg-gradient-to-r ${posStyle!.bg} py-5 border border-white/10`
                      : 'bg-white/5 py-4 hover:bg-white/10'
                    }
                  `}
                >
                  {/* Posição */}
                  <div className={`w-14 text-center font-bold ${isTop3 ? 'text-3xl' : 'text-xl text-gray-500'}`}>
                    {isTop3 ? posStyle!.emoji : `${pos}º`}
                  </div>

                  {/* Nome */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${isTop3 ? 'text-xl' : 'text-lg text-gray-300'}`}>
                      {maskName(entry.customerName)}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {entry.orderCount} pedido{entry.orderCount !== 1 ? 's' : ''} · Favorita: {entry.favoriteDrink}
                    </p>
                  </div>

                  {/* Valor */}
                  <div className="text-right">
                    <p className={`font-bold ${isTop3 ? 'text-2xl' : 'text-lg'} ${isTop3 ? posStyle!.text : 'text-blue-400'}`}>
                      {formatMl(entry.totalMl)}
                    </p>
                    <p className="text-xs text-gray-500">
                      R$ {entry.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Barra visual (proporcional ao líder) */}
                  {ranking[0] && ranking[0].totalMl > 0 && (
                    <div className="hidden lg:block w-32">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${
                            pos === 1
                              ? 'bg-yellow-400'
                              : pos === 2
                                ? 'bg-gray-400'
                                : pos === 3
                                  ? 'bg-amber-600'
                                  : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.max(5, (entry.totalMl / ranking[0].totalMl) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="fixed bottom-0 left-0 right-0 bg-gray-950/80 backdrop-blur border-t border-white/5 px-8 py-2 flex justify-between items-center text-xs text-gray-600">
        <span>Open Kiosk — Ranking ao vivo</span>
        <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </footer>
    </div>
  );
}
