/**
 * ============================================================================
 * Camera Stream Service (Kiosk-side)
 * ============================================================================
 *
 * Gerencia sessões de câmera sob demanda iniciadas remotamente pelo Admin.
 * Usa WebRTC com sinalização via Firestore (vanilla ICE — sem TURN).
 *
 * Fluxo:
 *   1. Admin cria doc em cameraSessions com status 'requesting'
 *   2. Kiosk detecta via onSnapshot, abre câmera, cria offer → Firestore
 *   3. Admin recebe offer, cria answer → Firestore
 *   4. Kiosk aplica answer, stream flui via WebRTC P2P
 *   5. Qualquer lado pode encerrar; timeout automático de 5 min
 *
 * Segurança:
 *   - Câmera só abre quando sessão é solicitada
 *   - Indicador visual obrigatório via CameraActiveIndicator
 *   - Timeout automático impede sessões esquecidas
 *   - Todo erro é tratado sem travar o kiosk
 */

import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type CameraSessionStatus = 'inactive' | 'starting' | 'active' | 'error';

export type CameraFacing = 'environment' | 'user';

export interface CameraSessionState {
  status: CameraSessionStatus;
  sessionId: string | null;
  facing: CameraFacing;
  audioEnabled: boolean;
  error?: string;
}

type StateListener = (state: CameraSessionState) => void;

// ─── Constantes ─────────────────────────────────────────────────────────────

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const MAX_SESSION_SECONDS = 300; // 5 min
const ICE_GATHERING_TIMEOUT_MS = 5_000;
const STALE_REQUEST_MS = 60_000; // Ignorar sessões requesting com mais de 60s

// ─── Service ────────────────────────────────────────────────────────────────

class CameraStreamService {
  private unsubscribeCollection: (() => void) | null = null;
  private unsubscribeSession: (() => void) | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private sessionId: string | null = null;
  private timeoutHandle: number | null = null;
  private state: CameraSessionState = { status: 'inactive', sessionId: null, facing: 'environment', audioEnabled: false };
  private listeners = new Set<StateListener>();
  private franchiseId: string | null = null;
  private storeId: string | null = null;
  private deviceId: string | null = null;

  /** Inscreve listener de estado. Retorna função de unsubscribe. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<CameraSessionState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private getSessionPath(sessionId: string): string {
    return `franchises/${this.franchiseId}/stores/${this.storeId}/devices/${this.deviceId}/cameraSessions/${sessionId}`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Inicia escuta por sessões de câmera solicitadas pelo Admin.
   * Deve ser chamado após heartbeat e antes de enterKioskMode.
   */
  startListening(franchiseId: string, storeId: string, deviceId: string): void {
    if (this.unsubscribeCollection) return;

    this.franchiseId = franchiseId;
    this.storeId = storeId;
    this.deviceId = deviceId;

    const db = getFirebaseDb();
    if (!db) {
      console.warn('[CameraStream] Firestore não disponível');
      return;
    }

    const sessionsRef = collection(
      db,
      `franchises/${franchiseId}/stores/${storeId}/devices/${deviceId}/cameraSessions`,
    );

    this.unsubscribeCollection = onSnapshot(
      sessionsRef,
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.status === 'requesting') {
              // Ignorar sessões stale (ex: kiosk reiniciou e encontrou requesting antigo)
              const requestedAt = data.requestedAt as Timestamp | null;
              if (requestedAt) {
                const ageMs = Date.now() - requestedAt.toMillis();
                if (ageMs > STALE_REQUEST_MS) {
                  console.log(`[CameraStream] Sessão stale ignorada (${Math.round(ageMs / 1000)}s): ${change.doc.id}`);
                  continue;
                }
              }
              this.handleSessionRequest(change.doc.id, data);
            }
          }
        }
      },
      (err) => {
        console.warn('[CameraStream] Listener error:', err.message);
      },
    );

    console.log('[CameraStream] Escutando sessões de câmera');
  }

  /** Para escuta e encerra qualquer sessão ativa. */
  stopListening(): void {
    this.endSession('kiosk_stopped');
    this.unsubscribeCollection?.();
    this.unsubscribeCollection = null;
  }

  // ── Sessão ─────────────────────────────────────────────────────────────

  private async handleSessionRequest(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Se já tem sessão ativa, encerrar antes
    if (this.sessionId) {
      await this.endSession('replaced');
    }

    // Ler preferências do admin
    const facing: CameraFacing =
      data.facingMode === 'user' ? 'user' : 'environment';
    const audioEnabled = data.audioEnabled === true;

    this.sessionId = sessionId;
    this.setState({ status: 'starting', sessionId, facing, audioEnabled });
    console.log(`[CameraStream] Sessão solicitada: ${sessionId} (${facing}, audio=${audioEnabled})`);

    const db = getFirebaseDb();
    if (!db) return this.handleError('Firestore indisponível');

    const sessionRef = doc(db, this.getSessionPath(sessionId));

    try {
      // 1. Abrir câmera + microfone conforme solicitado
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        },
        audio: audioEnabled,
      });

      // 2. Criar peer connection
      this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

      // Adicionar tracks ao peer connection
      for (const track of this.localStream.getTracks()) {
        this.peerConnection.addTrack(track, this.localStream);
      }

      // 3. Criar offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // 4. Aguardar ICE gathering (vanilla ICE)
      await this.waitForIceGathering();

      // 5. Enviar offer para Firestore
      await updateDoc(sessionRef, {
        status: 'connecting',
        offer: JSON.stringify(this.peerConnection.localDescription?.toJSON()),
      });

      // 6. Escutar por answer do Admin
      this.unsubscribeSession = onSnapshot(sessionRef, (snap) => {
        const sessionData = snap.data();
        if (!sessionData) return;

        // Admin enviou answer
        if (
          sessionData.answer &&
          this.peerConnection &&
          this.peerConnection.signalingState === 'have-local-offer'
        ) {
          const answer = new RTCSessionDescription(JSON.parse(sessionData.answer as string));
          this.peerConnection
            .setRemoteDescription(answer)
            .then(() => {
              this.setState({ status: 'active' });
              updateDoc(sessionRef, { status: 'active' }).catch(() => {});
              this.startTimeout(
                typeof sessionData.timeoutSeconds === 'number'
                  ? sessionData.timeoutSeconds
                  : MAX_SESSION_SECONDS,
              );
              console.log('[CameraStream] Sessão ativa — stream WebRTC estabelecido');
            })
            .catch((err: unknown) => {
              this.handleError(
                'setRemoteDescription falhou',
                err instanceof Error ? err : undefined,
              );
            });
        }

        // Admin encerrou a sessão
        if (sessionData.status === 'ended' && this.state.status !== 'inactive') {
          console.log('[CameraStream] Sessão encerrada pelo admin');
          this.cleanup();
        }
      });

      // 7. Monitorar estado da conexão
      this.peerConnection.onconnectionstatechange = () => {
        const cs = this.peerConnection?.connectionState;
        if (cs === 'disconnected' || cs === 'failed') {
          this.endSession('error');
        }
      };
    } catch (err) {
      this.handleError(
        'Falha ao iniciar câmera',
        err instanceof Error ? err : undefined,
      );
    }
  }

  /** Encerra a sessão ativa e registra motivo no Firestore. */
  async endSession(reason: string): Promise<void> {
    if (!this.sessionId) return;

    const sid = this.sessionId;

    try {
      const db = getFirebaseDb();
      if (db && this.franchiseId && this.storeId && this.deviceId) {
        const sessionRef = doc(db, this.getSessionPath(sid));
        await updateDoc(sessionRef, {
          status: 'ended',
          endedAt: serverTimestamp(),
          endReason: reason,
        });
      }
    } catch {
      // Silenciar — cleanup é mais importante
    }

    this.cleanup();
  }

  // ── Internos ───────────────────────────────────────────────────────────

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      const pc = this.peerConnection!;
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const timeout = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS);

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
  }

  private startTimeout(seconds: number): void {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    const cappedSeconds = Math.min(seconds, MAX_SESSION_SECONDS);
    this.timeoutHandle = window.setTimeout(() => {
      console.log('[CameraStream] Timeout da sessão');
      this.endSession('timeout');
    }, cappedSeconds * 1000);
  }

  private cleanup(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    this.peerConnection?.close();
    this.peerConnection = null;

    this.sessionId = null;
    this.setState({ status: 'inactive', sessionId: null, facing: 'environment', audioEnabled: false });
  }

  private handleError(message: string, err?: Error): void {
    const errorMsg = err ? `${message}: ${err.message}` : message;
    console.error(`[CameraStream] ${errorMsg}`);

    // Registrar erro no Firestore
    if (this.sessionId) {
      try {
        const db = getFirebaseDb();
        if (db && this.franchiseId && this.storeId && this.deviceId) {
          const sessionRef = doc(db, this.getSessionPath(this.sessionId));
          updateDoc(sessionRef, {
            status: 'error',
            errorMessage: errorMsg,
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    this.cleanup();
    this.setState({ status: 'error', sessionId: null, facing: 'environment', audioEnabled: false, error: errorMsg });
  }
}

/** Singleton — importar e usar diretamente. */
export const cameraStreamService = new CameraStreamService();
