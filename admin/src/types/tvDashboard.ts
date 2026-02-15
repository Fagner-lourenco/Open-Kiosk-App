/**
 * ============================================================================
 * TV Dashboard Types — Modelo de dados para telão, desafios e prêmios
 * ============================================================================
 *
 * Coleções Firestore sob franchises/{fid}/stores/{sid}/:
 *   - tvConfig         (doc único)    — config do telão
 *   - eventStats       (doc único)    — totais do dia/evento
 *   - rankingAgg/{id}  (collection)   — ranking pre-agregado
 *   - challenges/{id}  (collection)   — desafios
 *   - prizes/{id}      (collection)   — prêmios/bilhetes
 */

import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// TV CONFIG
// ============================================================================

/** Panels que podem ser exibidos no telão */
export type TvPanelType = 'ranking' | 'goal' | 'challenge' | 'winners' | 'teams';

/** Temas disponíveis */
export type TvTheme = 'dark-gold' | 'dark-blue' | 'custom';

/** Janela de ranking */
export type RankingWindow = '30min' | '1h' | 'today' | 'event';

/** Configuração do telão — doc: tvConfig */
export interface TvConfig {
  /** Telão habilitado */
  enabled: boolean;
  /** Painéis ativos (ordem importa) */
  panels: TvPanelType[];
  /** Intervalo de rotação entre painéis (segundos) */
  rotationIntervalSec: number;
  /** Nº máximo de posições no leaderboard */
  maxDisplayPositions: number;
  /** Janela principal do ranking */
  rankingWindow: RankingWindow;
  /** Tema visual */
  theme: TvTheme;
  /** Textos do rodapé (disclaimers) */
  disclaimers: string[];
  /** Título customização (ex: nome do evento) */
  eventLabel?: string;
  /** Alternar entre ranking 30min e ranking do dia */
  alternateRankingWindows: boolean;
  /** Atualizado em */
  updatedAt?: Timestamp;
}

/** Defaults para TvConfig */
export const DEFAULT_TV_CONFIG: Omit<TvConfig, 'updatedAt'> = {
  enabled: true,
  panels: ['ranking', 'goal', 'challenge', 'winners'],
  rotationIntervalSec: 12,
  maxDisplayPositions: 10,
  rankingWindow: '30min',
  theme: 'dark-gold',
  disclaimers: [
    'Beba com responsabilidade',
    'Prêmios sujeitos à disponibilidade',
    'Resgate no balcão com atendente',
  ],
  eventLabel: '',
  alternateRankingWindows: true,
};

// ============================================================================
// EVENT STATS
// ============================================================================

/** Modo Evento (ativado ao bater meta) */
export interface EventMode {
  enabled: boolean;
  label: string;
  endsAt: Timestamp | null;
}

/** Milestone de meta coletiva */
export interface GoalMilestone {
  /** mL para atingir */
  targetMl: number;
  /** Label exibido (ex: "Modo Evento 10min") */
  label: string;
  /** Já atingido? */
  reached: boolean;
  /** Quando atingiu */
  reachedAt?: Timestamp;
}

/** Estatísticas do evento/dia — doc: eventStats */
export interface EventStats {
  /** Total mL consumidos hoje */
  totalMl: number;
  /** Total de serves (pedidos de bebida) */
  totalServes: number;
  /** Clientes únicos */
  uniqueCustomers: number;
  /** Data do dia (YYYY-MM-DD) */
  date: string;
  /** Meta coletiva habilitada */
  goalEnabled: boolean;
  /** Meta coletiva target em mL */
  goalTargetMl: number;
  /** Label da meta */
  goalLabel: string;
  /** Milestones da meta */
  milestones: GoalMilestone[];
  /** Modo evento */
  eventMode: EventMode;
  /** Última atualização */
  updatedAt?: Timestamp;
}

/** Defaults para EventStats */
export const DEFAULT_EVENT_STATS: Omit<EventStats, 'updatedAt'> = {
  totalMl: 0,
  totalServes: 0,
  uniqueCustomers: 0,
  date: '',
  goalEnabled: false,
  goalTargetMl: 100000, // 100L
  goalLabel: 'Meta do Dia',
  milestones: [],
  eventMode: { enabled: false, label: '', endsAt: null },
};

// ============================================================================
// RANKING AGREGADO
// ============================================================================

/** Entrada do ranking pre-agregado — doc: rankingAgg/{customerId} */
export interface RankingAggEntry {
  /** ID: hash do CPF ou nome uppercase */
  customerId: string;
  /** Nome mascarado para exibição ("João M. S.") */
  displayName: string;
  /** Total mL do dia */
  totalMl: number;
  /** Total mL na janela de 30 min */
  totalMl30min: number;
  /** Total gasto (R$) */
  totalSpent: number;
  /** Nº de pedidos */
  orderCount: number;
  /** Bebida favorita */
  favoriteDrink: string;
  /** Último pedido */
  lastOrderAt: Timestamp;
  /** Mudança de posição (▲ positivo, ▼ negativo) */
  positionChange?: number;
  /** Data referência (YYYY-MM-DD) */
  date: string;
}

// ============================================================================
// DESAFIOS (CHALLENGES)
// ============================================================================

/** Tipos de regra de desafio */
export type ChallengeRuleType =
  | 'min_orders'      // N pedidos em X minutos
  | 'min_taps'        // N torneiras diferentes em X minutos
  | 'return_after'    // Voltar depois de X minutos de gap
  | 'happy_boost';    // Qualquer pedido na janela (baixa demanda)

/** Regra do desafio */
export interface ChallengeRule {
  type: ChallengeRuleType;
  /** Threshold: nº mínimo de pedidos ou taps, ou minutos de gap */
  threshold: number;
  /** Janela em minutos para completar o desafio */
  windowMinutes: number;
}

/** Status do desafio */
export type ChallengeStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

/** Tipo de recompensa */
export type RewardType = 'coupon' | 'free_drink' | 'pix' | 'ticket_extra' | 'bonus_multiplier' | 'custom';

/** Desafio — doc: challenges/{challengeId} */
export interface Challenge {
  id: string;
  /** Título (ex: "Dupla do Brinde") */
  title: string;
  /** Descrição curta da regra */
  description: string;
  /** Regra de completação */
  rule: ChallengeRule;
  /** Duração total em minutos */
  durationMinutes: number;
  /** Status */
  status: ChallengeStatus;
  /** Início */
  startsAt: Timestamp;
  /** Fim */
  endsAt: Timestamp;
  /** Quantos completaram (prova social) */
  completedCount: number;
  /** Tipo de recompensa ao completar */
  rewardType: RewardType;
  /** Descrição da recompensa */
  rewardDescription: string;
  /** Criado em */
  createdAt: Timestamp;
  /** Atualizado em */
  updatedAt?: Timestamp;
}

/** Desafios pré-definidos (templates) */
export const CHALLENGE_TEMPLATES: Array<{
  title: string;
  description: string;
  rule: ChallengeRule;
  durationMinutes: number;
  rewardType: RewardType;
}> = [
  {
    title: 'Dupla do Brinde',
    description: '2 participações em 20 min → prêmio',
    rule: { type: 'min_orders', threshold: 2, windowMinutes: 20 },
    durationMinutes: 20,
    rewardType: 'coupon',
  },
  {
    title: 'Explorador',
    description: '2 torneiras diferentes em 30 min → prêmio',
    rule: { type: 'min_taps', threshold: 2, windowMinutes: 30 },
    durationMinutes: 30,
    rewardType: 'coupon',
  },
  {
    title: 'Volta do Intervalo',
    description: 'Voltar após uma pausa de 60 min → bilhete extra',
    rule: { type: 'return_after', threshold: 60, windowMinutes: 120 },
    durationMinutes: 120,
    rewardType: 'ticket_extra',
  },
  {
    title: 'Happy Boost',
    description: 'Bônus de premiação ativo por 15 min',
    rule: { type: 'happy_boost', threshold: 1, windowMinutes: 15 },
    durationMinutes: 15,
    rewardType: 'bonus_multiplier',
  },
];

// ============================================================================
// PRÊMIOS / BILHETES
// ============================================================================

/** Tipo do prêmio */
export type PrizeType = 'coupon' | 'free_drink' | 'pix' | 'custom';

/** Status do prêmio */
export type PrizeStatus = 'available' | 'won' | 'redeemed' | 'expired';

/** Item do pool de prêmios — doc: prizes/{prizeId} */
export interface Prize {
  id: string;
  /** Tipo */
  type: PrizeType;
  /** Descrição visível no telão (ex: "Cupom 10%", "Chope grátis") */
  description: string;
  /** Valor em R$ (para Pix) */
  value?: number;
  /** Código único de resgate (8 chars) */
  code: string;
  /** Status */
  status: PrizeStatus;
  /** Nome mascarado do ganhador */
  winnerDisplayName?: string;
  /** ID do cliente que ganhou */
  winnerId?: string;
  /** Order que gerou o prêmio */
  orderId?: string;
  /** Ganhou em */
  wonAt?: Timestamp;
  /** Resgatou em */
  redeemedAt?: Timestamp;
  /** Resgatado por (userId do atendente) */
  redeemedBy?: string;
  /** Expira em (30 min após wonAt) */
  expiresAt?: Timestamp;
  /** Criado em */
  createdAt: Timestamp;
}

/** Configuração do serve dourado / bilhete premiado */
export interface GoldenServeConfig {
  /** Habilitado */
  enabled: boolean;
  /** Frequência: 1 em N serves ganha */
  frequency: number;
  /** Pool de prêmios disponíveis por tipo */
  prizeWeights: Record<PrizeType, number>;
  /** Max Pix por pessoa por dia */
  maxPixPerPerson: number;
  /** Descrições dos prêmios por tipo */
  prizeDescriptions: Record<PrizeType, string>;
}

/** Defaults para GoldenServeConfig */
export const DEFAULT_GOLDEN_SERVE_CONFIG: GoldenServeConfig = {
  enabled: false,
  frequency: 50,
  prizeWeights: { coupon: 60, free_drink: 30, pix: 8, custom: 2 },
  maxPixPerPerson: 1,
  prizeDescriptions: {
    coupon: 'Cupom de desconto',
    free_drink: 'Chope grátis',
    pix: 'Pix premiado',
    custom: 'Prêmio especial',
  },
};

// ============================================================================
// GANHADORES RECENTES (view agregada)
// ============================================================================

/** Ganhador recente para exibição no telão */
export interface RecentWinner {
  displayName: string;
  prizeType: PrizeType;
  prizeDescription: string;
  wonAt: Timestamp;
}
