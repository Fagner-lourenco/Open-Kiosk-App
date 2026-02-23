/**
 * useAudioVoice — Kiosk Voice Prompts
 *
 * Gerencia reprodução de áudios de voz com:
 * - Proteção contra sobreposição (1 áudio global simultâneo)
 * - Guard once-per-scope (não repetir no mesmo contexto)
 * - Guard cooldown (erros/retries com janela de tempo)
 * - soundEnabled gate (respeita drinkPickupSoundEnabled do admin)
 * - Desbloqueio de áudio para Android WebView (user-gesture requirement)
 */

import { useCallback, useRef } from 'react';

// ─────────────────────────────────────────────
// Mapa de arquivos de áudio
// ─────────────────────────────────────────────

export const VOICE = {
  age_verify:               '/audio/kiosk/age_verify.mp3',
  choose_size_and_quantity: '/audio/kiosk/choose_size_and_quantity.mp3',
  stock_limit:              '/audio/kiosk/stock_limit.mp3',
  choose_payment:           '/audio/kiosk/choose_payment.mp3',
  pix_scan:                 '/audio/kiosk/pix_scan.mp3',
  card_terminal:            '/audio/kiosk/card_terminal.mp3',
  processing_payment:       '/audio/kiosk/processing_payment.mp3',
  payment_approved:         '/audio/kiosk/payment_approved.mp3',
  payment_error:            '/audio/kiosk/payment_error.mp3',
  dispense_failed:          '/audio/kiosk/dispense_failed.mp3',
  place_cup:                '/audio/kiosk/place_cup.mp3',
  how_to_pour_full:         '/audio/kiosk/how_to_pour_full.mp3',
  start_flow_hint:          '/audio/kiosk/start_flow_hint.mp3',
  cup_complete:             '/audio/kiosk/cup_complete.mp3',
  next_cup:                 '/audio/kiosk/next_cup.mp3',
  done:                     '/audio/kiosk/done.mp3',
  pickup_timeout:           '/audio/kiosk/pickup_timeout.mp3',
  dispense_error:           '/audio/kiosk/dispense_error.mp3',
  isis_ranking_invite:      '/audio/kiosk/isis_ranking_invite.mp3',
  ranking_thanks:           '/audio/kiosk/ranking_thanks.mp3',
} as const;

export type VoiceKey = keyof typeof VOICE;

// ─────────────────────────────────────────────
// Estado singleton de módulo (compartilhado entre todas as instâncias do hook)
// ─────────────────────────────────────────────

/** Set de chaves "{voiceKey}:{scope}" já reproduzidas — previne once-per-scope */
const playedScopes = new Set<string>();

/** Mapa de timestamp da última reprodução por voiceKey — previne cooldown repetition */
const cooldownTimestamps = new Map<string, number>();

/** Referência ao áudio corrente — para pausar antes de iniciar novo */
let currentAudio: HTMLAudioElement | null = null;

/** Flag de desbloqueio de áudio — Android WebView exige gesto do usuário */
let audioUnlocked = false;

/** Timer de áudio em fila (usado para prompts sequenciais com delay) */
let pendingAudioTimer: ReturnType<typeof setTimeout> | null = null;

// ─────────────────────────────────────────────
// Desbloqueio de contexto de áudio (Android WebView)
// Deve ser chamado no primeiro toque do usuário (ex: botão da AttractScreen).
// Operação silenciosa — não emite nenhum som.
// ─────────────────────────────────────────────

export function unlockAudio(): void {
  if (audioUnlocked) return;
  try {
    // Método 1: AudioContext resume — libera o contexto de áudio do WebView
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      // Criar oscilador silencioso de 10ms para "aquecer" o contexto
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime); // gain zero = silencioso
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.01);
      ctx.resume().catch(() => {/* ignore */});
    }

    // Método 2: HTMLAudioElement play/pause silencioso como fallback
    const silentAudio = new Audio();
    silentAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    silentAudio.volume = 0;
    silentAudio.play().then(() => silentAudio.pause()).catch(() => {/* ignore */});

    audioUnlocked = true;
    console.log('[useAudioVoice] Áudio desbloqueado');
  } catch (e) {
    console.warn('[useAudioVoice] Falha ao desbloquear áudio:', e);
  }
}

// ─────────────────────────────────────────────
// Função interna: para o áudio atual e cancela timers pendentes
// ─────────────────────────────────────────────

function stopCurrentAudio(): void {
  if (pendingAudioTimer !== null) {
    clearTimeout(pendingAudioTimer);
    pendingAudioTimer = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {/* ignore */}
    currentAudio = null;
  }
}

// ─────────────────────────────────────────────
// Funções de limpeza de escopo (exportadas para uso nos cleanups dos componentes)
// ─────────────────────────────────────────────

/**
 * Remove do Set de escopos todas as entradas que pertençam ao scope informado.
 * Chamar no cleanup de fechamento dos modais (isOpen=false).
 */
export function clearAudioScope(scope: string): void {
  for (const key of playedScopes) {
    if (key.endsWith(`:${scope}`) || key.includes(`:${scope}-`)) {
      playedScopes.delete(key);
    }
  }
  stopCurrentAudio();
}

/** Limpa todo o estado de áudio — para reset completo. */
export function clearAllAudio(): void {
  playedScopes.clear();
  cooldownTimestamps.clear();
  stopCurrentAudio();
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useAudioVoice(soundEnabled: boolean) {
  // Usar ref para que playGuarded leia o valor mais atual sem ser recriada
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  /**
   * Toca um áudio com proteção contra sobreposição e repetição.
   *
   * @param key     - Chave do mapa VOICE
   * @param scope   - Escopo de unicidade (ex: modalScopeId, orderNumber, cupIndex)
   * @param cooldownMs - Se fornecido, usa lógica de cooldown ao invés de once-per-scope.
   *                    Útil para erros e retries (ex: 10_000ms).
   */
  const playGuarded = useCallback((key: VoiceKey, scope: string, cooldownMs?: number): void => {
    if (!soundEnabledRef.current) return;

    const scopeKey = `${key}:${scope}`;
    const now = Date.now();

    if (cooldownMs !== undefined) {
      // Modo cooldown: bloquear se ainda dentro da janela de tempo
      const last = cooldownTimestamps.get(key) ?? 0;
      if (now - last < cooldownMs) {
        console.log(`[useAudioVoice] '${key}' em cooldown (${Math.round((cooldownMs - (now - last)) / 1000)}s restantes)`);
        return;
      }
    } else {
      // Modo once-per-scope: bloquear se já foi reproduzido neste escopo
      if (playedScopes.has(scopeKey)) {
        console.log(`[useAudioVoice] '${key}' já reproduzido no escopo '${scope}'`);
        return;
      }
    }

    const src = VOICE[key];

    // Registrar ANTES de tocar para prevenir race condition em duplas chamadas rápidas
    if (cooldownMs !== undefined) {
      cooldownTimestamps.set(key, now);
    } else {
      playedScopes.add(scopeKey);
    }

    // Parar qualquer áudio/timer em curso ANTES de iniciar o novo
    stopCurrentAudio();

    try {
      const audio = new Audio(src);
      audio.volume = 1.0;

      audio.onended = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
      };

      audio.onerror = () => {
        console.warn(`[useAudioVoice] Erro ao carregar '${src}'`);
        if (currentAudio === audio) {
          currentAudio = null;
        }
      };

      currentAudio = audio;

      // Tentar desbloquear inline se ainda não foi desbloqueado
      if (!audioUnlocked) {
        unlockAudio();
      }

      audio.play().catch((err) => {
        console.warn(`[useAudioVoice] play() falhou para '${key}':`, err);
        if (currentAudio === audio) {
          currentAudio = null;
        }
      });

      console.log(`[useAudioVoice] ▶ '${key}' (scope: '${scope}')`);
    } catch (err) {
      console.warn(`[useAudioVoice] Exceção ao criar Audio para '${key}':`, err);
    }
  }, []);

  /**
   * Agenda um áudio com delay, cancelando qualquer timer anterior.
   * Garante que não haja sobreposição com áudios em andamento.
   *
   * @param delayMs  - Delay em ms antes de reproduzir
   * @param key      - Chave do mapa VOICE
   * @param scope    - Escopo de unicidade
   * @param cooldownMs - Opcional cooldown
   */
  const playGuardedDelayed = useCallback((
    delayMs: number,
    key: VoiceKey,
    scope: string,
    cooldownMs?: number,
  ): void => {
    // Cancelar timer pendente anterior (não interrompe áudio atual)
    if (pendingAudioTimer !== null) {
      clearTimeout(pendingAudioTimer);
      pendingAudioTimer = null;
    }
    pendingAudioTimer = setTimeout(() => {
      pendingAudioTimer = null;
      playGuarded(key, scope, cooldownMs);
    }, delayMs);
  }, [playGuarded]);

  const clearScope = useCallback((scope: string): void => {
    clearAudioScope(scope);
  }, []);

  const clearAll = useCallback((): void => {
    clearAllAudio();
  }, []);

  const stopAudio = useCallback((): void => {
    stopCurrentAudio();
  }, []);

  return { playGuarded, playGuardedDelayed, clearScope, clearAll, stopAudio };
}
