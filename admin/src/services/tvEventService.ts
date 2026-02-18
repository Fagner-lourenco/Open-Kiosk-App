/**
 * ============================================================================
 * TV Event Service — CRUD para telão, desafios e prêmios
 * ============================================================================
 *
 * Camada de serviço para o Admin gerenciar:
 *  - TvConfig        (configuração do telão)
 *  - EventStats      (meta coletiva, milestones)
 *  - Challenges      (desafios temporários)
 *  - Prizes          (pool de prêmios, resgate)
 *  - GoldenServe     (serve dourado / bilhete premiado)
 *
 * Paths via pathResolver. Write protegido por Firestore rules (admin/owner/manager).
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  tvConfigPath,
  eventStatsPath,
  rankingAggPath,
  challengesPath,
  prizesPath,
} from '@/lib/pathResolver';
import type {
  TvConfig,
  EventStats,
  Challenge,
  Prize,
  GoldenServeConfig,
  GoalMilestone,
  ChallengeStatus,
  PrizeStatus,
} from '@/types/tvDashboard';
import {
  DEFAULT_TV_CONFIG,
  DEFAULT_EVENT_STATS,
  DEFAULT_GOLDEN_SERVE_CONFIG,
} from '@/types/tvDashboard';

// ============================================================================
// HELPERS
// ============================================================================

function splitPath(path: string) {
  return path.split('/');
}

function docFromPath(path: string) {
  const parts = splitPath(path);
  return doc(db, parts[0], ...parts.slice(1));
}

function colFromPath(path: string) {
  const parts = splitPath(path);
  return collection(db, parts[0], ...parts.slice(1));
}

// ============================================================================
// TV CONFIG
// ============================================================================

/**
 * Obtém ou cria a config do telão
 */
export async function getTvConfig(
  franchiseId: string,
  storeId: string
): Promise<TvConfig> {
  const ref = docFromPath(tvConfigPath(franchiseId, storeId));
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Criar com defaults
    const data = { ...DEFAULT_TV_CONFIG, updatedAt: serverTimestamp() };
    await setDoc(ref, data);
    return { ...DEFAULT_TV_CONFIG, updatedAt: Timestamp.now() };
  }

  return { ...DEFAULT_TV_CONFIG, ...snap.data() } as TvConfig;
}

/**
 * Atualiza config do telão (merge parcial)
 */
export async function updateTvConfig(
  franchiseId: string,
  storeId: string,
  updates: Partial<TvConfig>
): Promise<void> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');

  // Validate numeric types
  if (updates.rotationIntervalSec !== undefined && typeof updates.rotationIntervalSec !== 'number') {
    throw new Error('rotationIntervalSec deve ser um número');
  }
  if (updates.maxDisplayPositions !== undefined && typeof updates.maxDisplayPositions !== 'number') {
    throw new Error('maxDisplayPositions deve ser um número');
  }

  // Validate numeric ranges if present
  if (updates.rotationIntervalSec !== undefined && (updates.rotationIntervalSec < 3 || updates.rotationIntervalSec > 120)) {
    throw new Error('rotationIntervalSec deve estar entre 3 e 120 segundos');
  }
  if (updates.maxDisplayPositions !== undefined && (updates.maxDisplayPositions < 1 || updates.maxDisplayPositions > 100)) {
    throw new Error('maxDisplayPositions deve estar entre 1 e 100');
  }

  const ref = docFromPath(tvConfigPath(franchiseId, storeId));
  await setDoc(ref, { ...updates, updatedAt: serverTimestamp() }, { merge: true });
}

// ============================================================================
// EVENT STATS
// ============================================================================

/**
 * Obtém ou cria eventStats
 */
export async function getEventStats(
  franchiseId: string,
  storeId: string
): Promise<EventStats> {
  const ref = docFromPath(eventStatsPath(franchiseId, storeId));
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { ...DEFAULT_EVENT_STATS } as EventStats;
  }

  return { ...DEFAULT_EVENT_STATS, ...snap.data() } as EventStats;
}

/**
 * Define meta coletiva (admin)
 */
export async function setCollectiveGoal(
  franchiseId: string,
  storeId: string,
  goalTargetMl: number,
  goalLabel: string,
  milestones: GoalMilestone[]
): Promise<void> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');
  if (!goalTargetMl || goalTargetMl <= 0) throw new Error('goalTargetMl deve ser maior que zero');
  if (!goalLabel?.trim()) throw new Error('goalLabel é obrigatório');
  for (const m of milestones) {
    if (typeof m.targetMl !== 'number') throw new Error('Milestone targetMl deve ser um número');
    if (!m.targetMl || m.targetMl <= 0) throw new Error('Milestone targetMl deve ser maior que zero');
    if (!m.label?.trim()) throw new Error('Milestone label é obrigatório');
  }

  const ref = docFromPath(eventStatsPath(franchiseId, storeId));
  await setDoc(
    ref,
    {
      goalEnabled: true,
      goalTargetMl,
      goalLabel,
      milestones,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Desabilita meta coletiva
 */
export async function disableCollectiveGoal(
  franchiseId: string,
  storeId: string
): Promise<void> {
  const ref = docFromPath(eventStatsPath(franchiseId, storeId));
  await setDoc(
    ref,
    { goalEnabled: false, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Ativa/desativa modo evento manualmente
 */
export async function toggleEventMode(
  franchiseId: string,
  storeId: string,
  enabled: boolean,
  label: string = '',
  durationMinutes: number = 10,
  activateDynamicPricing: boolean = false
): Promise<void> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');
  if (enabled && durationMinutes < 1) throw new Error('durationMinutes deve ser pelo menos 1');
  if (enabled && durationMinutes > 1440) throw new Error('durationMinutes não pode exceder 1440 (24h)');

  try {
    const functions = getFunctions(undefined, 'southamerica-east1');
    const toggleFn = httpsCallable(functions, 'toggleEventMode');
    await toggleFn({ franchiseId, storeId, enabled, label, durationMinutes, activateDynamicPricing });
  } catch (err) {
    console.error('[tvEventService] toggleEventMode error:', err);
    throw err;
  }
}

// ============================================================================
// CHALLENGES
// ============================================================================

/**
 * Cria um novo desafio
 */
export async function createChallenge(
  franchiseId: string,
  storeId: string,
  challenge: Omit<Challenge, 'id' | 'createdAt' | 'updatedAt' | 'completedCount'>
): Promise<string> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');
  if (!challenge.title?.trim()) throw new Error('Título do desafio é obrigatório');
  if (!challenge.rule?.type) throw new Error('Tipo de regra é obrigatório');
  if (typeof challenge.rule?.threshold !== 'number') throw new Error('Threshold deve ser um número');
  if (!challenge.rule?.threshold || challenge.rule.threshold <= 0) throw new Error('Threshold deve ser maior que zero');
  if (!challenge.rule?.windowMinutes || challenge.rule.windowMinutes <= 0) throw new Error('windowMinutes deve ser maior que zero');

  const colRef = colFromPath(challengesPath(franchiseId, storeId));
  const newRef = doc(colRef);

  const data: Record<string, unknown> = {
    ...challenge,
    id: newRef.id,
    completedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(newRef, data);
  return newRef.id;
}

/**
 * Atualiza status de um desafio
 */
export async function updateChallengeStatus(
  franchiseId: string,
  storeId: string,
  challengeId: string,
  status: ChallengeStatus
): Promise<void> {
  const path = challengesPath(franchiseId, storeId);
  const ref = docFromPath(`${path}/${challengeId}`);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
}

/**
 * Ativa um desafio (muda status para 'active' e define horários)
 */
export async function activateChallenge(
  franchiseId: string,
  storeId: string,
  challengeId: string,
  durationMinutes: number
): Promise<void> {
  const path = challengesPath(franchiseId, storeId);
  const ref = docFromPath(`${path}/${challengeId}`);
  const now = Timestamp.now();
  const endsAt = Timestamp.fromDate(new Date(Date.now() + durationMinutes * 60_000));

  await updateDoc(ref, {
    status: 'active',
    startsAt: now,
    endsAt,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Lista desafios por status
 */
export async function listChallenges(
  franchiseId: string,
  storeId: string,
  status?: ChallengeStatus
): Promise<Challenge[]> {
  const colRef = colFromPath(challengesPath(franchiseId, storeId));

  const q = status
    ? query(colRef, where('status', '==', status), orderBy('createdAt', 'desc'))
    : query(colRef, orderBy('createdAt', 'desc'));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Challenge));
}

/**
 * Remove um desafio
 */
export async function deleteChallenge(
  franchiseId: string,
  storeId: string,
  challengeId: string
): Promise<void> {
  const path = challengesPath(franchiseId, storeId);
  const ref = docFromPath(`${path}/${challengeId}`);
  await deleteDoc(ref);
}

// ============================================================================
// PRIZES
// ============================================================================

/**
 * Adiciona prêmio ao pool
 */
export async function addPrize(
  franchiseId: string,
  storeId: string,
  prize: Omit<Prize, 'id' | 'createdAt' | 'code' | 'status'>
): Promise<string> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');
  if (!prize.type?.trim()) throw new Error('Tipo do prêmio é obrigatório');
  if (!prize.description?.trim()) throw new Error('Descrição do prêmio é obrigatória');

  const colRef = colFromPath(prizesPath(franchiseId, storeId));
  const newRef = doc(colRef);

  const code = generateCode();
  const data: Record<string, unknown> = {
    ...prize,
    id: newRef.id,
    code,
    status: 'available',
    createdAt: serverTimestamp(),
  };

  await setDoc(newRef, data);
  return newRef.id;
}

/**
 * Adiciona lote de prêmios ao pool
 */
export async function addPrizesBatch(
  franchiseId: string,
  storeId: string,
  prizes: Array<Omit<Prize, 'id' | 'createdAt' | 'code' | 'status'>>,
): Promise<number> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');
  if (!prizes || prizes.length === 0) throw new Error('Lista de prêmios não pode ser vazia');
  if (prizes.length > 500) throw new Error('Máximo de 500 prêmios por lote (limite do Firestore batch)');
  for (const p of prizes) {
    if (!p.type?.trim()) throw new Error('Tipo do prêmio é obrigatório em todos os itens');
    if (!p.description?.trim()) throw new Error('Descrição é obrigatória em todos os itens');
  }

  const colRef = colFromPath(prizesPath(franchiseId, storeId));
  const batchOp = writeBatch(db);

  for (const prize of prizes) {
    const newRef = doc(colRef);
    const code = generateCode();
    batchOp.set(newRef, {
      ...prize,
      id: newRef.id,
      code,
      status: 'available',
      createdAt: serverTimestamp(),
    });
  }

  await batchOp.commit();
  return prizes.length;
}

/**
 * Resgata prêmio por código (atendente)
 */
export async function redeemPrize(
  franchiseId: string,
  storeId: string,
  code: string,
  redeemedByUserId: string
): Promise<{ success: boolean; prize?: Prize; error?: string }> {
  if (!franchiseId || !storeId) throw new Error('franchiseId e storeId são obrigatórios');
  if (!code?.trim()) throw new Error('Código do prêmio é obrigatório');
  if (!redeemedByUserId?.trim()) throw new Error('ID do atendente é obrigatório');

  const colRef = colFromPath(prizesPath(franchiseId, storeId));
  const q = query(colRef, where('code', '==', code.toUpperCase().trim()), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    return { success: false, error: 'Código não encontrado' };
  }

  const prizeDocRef = snap.docs[0].ref;

  // Usar transaction para evitar resgate duplo (TOCTOU race condition)
  return await runTransaction(db, async (transaction) => {
    const prizeSnap = await transaction.get(prizeDocRef);
    if (!prizeSnap.exists()) {
      return { success: false, error: 'Código não encontrado' };
    }
    const prize = prizeSnap.data() as Prize;

    if (prize.status === 'redeemed') {
      return { success: false, error: 'Prêmio já foi resgatado' };
    }

    if (prize.status === 'expired') {
      return { success: false, error: 'Prêmio expirado' };
    }

    if (prize.status !== 'won') {
      return { success: false, error: 'Prêmio não está disponível para resgate' };
    }

    // Verifica expiração
    if (prize.expiresAt && prize.expiresAt.toMillis() < Date.now()) {
      transaction.update(prizeDocRef, { status: 'expired' });
      return { success: false, error: 'Prêmio expirado' };
    }

    transaction.update(prizeDocRef, {
      status: 'redeemed',
      redeemedAt: serverTimestamp(),
      redeemedBy: redeemedByUserId,
    });

    return { success: true, prize: { ...prize, status: 'redeemed' as const } };
  });
}

/**
 * Lista prêmios por status
 */
export async function listPrizes(
  franchiseId: string,
  storeId: string,
  status?: PrizeStatus
): Promise<Prize[]> {
  const colRef = colFromPath(prizesPath(franchiseId, storeId));

  const q = status
    ? query(colRef, where('status', '==', status), orderBy('createdAt', 'desc'))
    : query(colRef, orderBy('createdAt', 'desc'), limit(100));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Prize));
}

/**
 * Ganhadores recentes (prêmios won ou redeemed)
 */
export async function getRecentWinners(
  franchiseId: string,
  storeId: string,
  maxResults: number = 8
): Promise<Prize[]> {
  const colRef = colFromPath(prizesPath(franchiseId, storeId));
  const q = query(
    colRef,
    where('status', 'in', ['won', 'redeemed']),
    orderBy('wonAt', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Prize));
}

// ============================================================================
// GOLDEN SERVE CONFIG
// ============================================================================

/**
 * Obtém config do serve dourado (armazenado no tvConfig)
 */
export async function getGoldenServeConfig(
  franchiseId: string,
  storeId: string
): Promise<GoldenServeConfig> {
  const ref = docFromPath(tvConfigPath(franchiseId, storeId));
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { ...DEFAULT_GOLDEN_SERVE_CONFIG };
  }

  const data = snap.data();
  return (data.goldenServe as GoldenServeConfig) || { ...DEFAULT_GOLDEN_SERVE_CONFIG };
}

/**
 * Atualiza config do serve dourado
 */
export async function updateGoldenServeConfig(
  franchiseId: string,
  storeId: string,
  config: Partial<GoldenServeConfig>
): Promise<void> {
  const ref = docFromPath(tvConfigPath(franchiseId, storeId));
  const current = await getGoldenServeConfig(franchiseId, storeId);

  await setDoc(
    ref,
    {
      goldenServe: { ...current, ...config },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ============================================================================
// RANKING MANAGEMENT
// ============================================================================

/**
 * Reseta ranking (limpa rankingAgg) — para uso admin
 */
export async function resetRanking(
  franchiseId: string,
  storeId: string
): Promise<number> {
  const colRef = colFromPath(rankingAggPath(franchiseId, storeId));
  const snap = await getDocs(colRef);

  if (snap.empty) return 0;

  // Firestore limita batches a 500 operações
  const BATCH_LIMIT = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batchOp = writeBatch(db);
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batchOp.delete(d.ref));
    await batchOp.commit();
  }
  return snap.size;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Gera código alfanumérico de 8 caracteres (uppercase)
 */
function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, b => chars[b % chars.length]).join('');
}

/**
 * Inicializa todos os docs necessários para o TV Dashboard de uma loja
 */
export async function initializeTvDashboard(
  franchiseId: string,
  storeId: string
): Promise<void> {
  // tvConfig
  const tvRef = docFromPath(tvConfigPath(franchiseId, storeId));
  const tvSnap = await getDoc(tvRef);
  if (!tvSnap.exists()) {
    await setDoc(tvRef, { ...DEFAULT_TV_CONFIG, updatedAt: serverTimestamp() });
  }

  // eventStats
  const esRef = docFromPath(eventStatsPath(franchiseId, storeId));
  const esSnap = await getDoc(esRef);
  if (!esSnap.exists()) {
    await setDoc(esRef, { ...DEFAULT_EVENT_STATS, updatedAt: serverTimestamp() });
  }
}
