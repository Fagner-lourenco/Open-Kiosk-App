/**
 * ============================================================================
 * useTvRanking — Hook real-time para ranking pre-agregado (TV)
 * ============================================================================
 *
 * Escuta a collection rankingAgg via onSnapshot, filtrada por date == hoje.
 * A collection tem 1 doc por cliente (key = customerId), portanto o volume é
 * pequeno (< 200 docs numa loja ocupada).
 *
 * A query server-side filtra por date para excluir docs de dias anteriores.
 * Filtragem adicional (janela 30min / 1h) é feita client-side.
 *
 * Throttle de 5 s para evitar flicker no telão.
 *
 * Janelas suportadas:
 *   - '30min': totalMl30min > 0        — campo computado pela Cloud Function
 *   - '1h':    lastOrderAt >= (now-1h)  — não existe totalMl1h no backend
 *   - 'today': date == hoje  (totalMl)  — filtro estrito, sem fallback
 *   - 'event': igual a 'today'
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { rankingAggPath } from '@/lib/pathResolver';
import type { RankingAggEntry, RankingWindow } from '@/types/tvDashboard';

export interface UseTvRankingReturn {
  ranking: RankingAggEntry[];
  isLoading: boolean;
  error: string | null;
}

const THROTTLE_MS = 5_000;

/** Máximo de docs a trazer do Firestore (1 por cliente) */
const MAX_DOCS = 100;

/** YYYY-MM-DD em BRT (UTC-3) — consistente com Cloud Functions helpers.ts */
function todayYMD(): string {
  const d = new Date();
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, '0')}-${String(brt.getUTCDate()).padStart(2, '0')}`;
}

function splitPath(path: string) {
  return path.split('/');
}

/** Converte Firestore Timestamp para Date de forma segura */
function tsToDate(ts: Timestamp | unknown): Date | null {
  if (!ts) return null;
  if (typeof (ts as Timestamp).toDate === 'function') return (ts as Timestamp).toDate();
  if (typeof (ts as { seconds: number }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  return null;
}

/** Retorna o valor de volume correto para a janela */
export function getWindowValue(entry: RankingAggEntry, rw: RankingWindow): number {
  return rw === '30min' ? (entry.totalMl30min ?? 0) : (entry.totalMl ?? 0);
}

/**
 * Filtra, ordena e limita as entradas conforme a janela.
 * Se a filtragem estrita retornar vazio, faz fallback mostrando todos
 * (útil quando o ambiente de teste só tem dados de dias anteriores).
 */
function filterSortSlice(
  allEntries: RankingAggEntry[],
  rankingWindow: RankingWindow,
  maxPositions: number,
  today: string,
): RankingAggEntry[] {
  let filtered: RankingAggEntry[];

  switch (rankingWindow) {
    case '30min':
      // Só clientes com volume nos últimos 30 min (campo computado pelo backend)
      // 🔧 FIX: Filtrar por data de hoje para excluir docs stale de dias anteriores
      filtered = allEntries.filter((e) => (e.totalMl30min ?? 0) > 0 && e.date === today);
      break;

    case '1h': {
      // Clientes que fizeram pedido na última hora
      const cutoff = new Date(Date.now() - 60 * 60 * 1000);
      filtered = allEntries.filter((e) => {
        const d = tsToDate(e.lastOrderAt);
        return d ? d >= cutoff : false;
      });
      break;
    }

    case 'today':
    case 'event':
    default: {
      // 🔧 FIX AUD-05: Filtrar estritamente por data de hoje — sem fallback.
      // O fallback anterior mostrava dados de outros dias quando todayEntries estava vazio,
      // o que ocorre se o relógio do browser divergir do servidor ou se não há vendas hoje.
      filtered = allEntries.filter(
        (e) => e.date === today && (e.totalMl ?? 0) > 0,
      );
      break;
    }
  }

  // Ordenar pelo campo correto (desc)
  filtered.sort((a, b) => getWindowValue(b, rankingWindow) - getWindowValue(a, rankingWindow));

  return filtered.slice(0, maxPositions);
}

export function useTvRanking(
  franchiseId: string | null | undefined,
  storeId: string | null | undefined,
  rankingWindow: RankingWindow = '30min',
  maxPositions: number = 10,
): UseTvRankingReturn {
  // Todos os docs de rankingAgg (sem filtro server-side)
  const [allEntries, setAllEntries] = useState<RankingAggEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data de hoje — atualiza a cada 30 s para cobrir virada de meia-noite
  const [todayStr, setTodayStr] = useState(() => todayYMD());
  useEffect(() => {
    const check = () =>
      setTodayStr((prev) => {
        const now = todayYMD();
        return prev !== now ? now : prev;
      });
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Refs para throttle
  const unsubRef = useRef<Unsubscribe | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<RankingAggEntry[] | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const applyUpdate = useCallback((data: RankingAggEntry[]) => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= THROTTLE_MS) {
      setAllEntries(data);
      lastUpdateRef.current = now;
      pendingDataRef.current = null;
    } else {
      pendingDataRef.current = data;
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          if (pendingDataRef.current) {
            setAllEntries(pendingDataRef.current);
            lastUpdateRef.current = Date.now();
            pendingDataRef.current = null;
          }
          throttleTimerRef.current = null;
        }, THROTTLE_MS - elapsed);
      }
    }
  }, []);

  // Snapshot: busca docs de rankingAgg filtrados pela data de hoje (server-side).
  // 🔧 FIX AUD-05: Filtra por date == today no Firestore para excluir docs de dias anteriores.
  // Requer índice composto (date ASC, totalMl DESC) — criado automaticamente no primeiro request.
  useEffect(() => {
    if (!franchiseId || !storeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const path = rankingAggPath(franchiseId, storeId);
    const parts = splitPath(path);
    const colRef = collection(db, parts[0], ...parts.slice(1));

    const q = query(colRef, where('date', '==', todayStr), orderBy('totalMl', 'desc'), limit(MAX_DOCS));

    unsubRef.current = onSnapshot(
      q,
      (snapshot) => {
        const entries = snapshot.docs.map((d) => ({
          ...(d.data() as RankingAggEntry),
          customerId: d.data().customerId ?? d.id,
        }));
        applyUpdate(entries);
        setIsLoading(false);
      },
      (err) => {
        console.error('[useTvRanking] snapshot error:', err);
        setError('Erro ao carregar ranking');
        setIsLoading(false);
      },
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, [franchiseId, storeId, todayStr, applyUpdate]);

  // Filtragem + ordenação client-side (muda instantaneamente ao trocar janela)
  const ranking = useMemo(
    () => filterSortSlice(allEntries, rankingWindow, maxPositions, todayStr),
    [allEntries, rankingWindow, maxPositions, todayStr],
  );

  return { ranking, isLoading, error };
}
