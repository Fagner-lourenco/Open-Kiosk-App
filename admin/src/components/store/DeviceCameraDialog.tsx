/**
 * ============================================================================
 * DeviceCameraDialog — Visualizador de câmera remota do kiosk
 * ============================================================================
 *
 * Admin solicita acesso à câmera de um dispositivo kiosk via Firestore.
 * WebRTC com sinalização via Firestore (vanilla ICE, sem TURN):
 *
 *   1. Admin cria doc cameraSessions/{id} com status 'requesting'
 *   2. Kiosk detecta, abre câmera, gera offer → Firestore
 *   3. Admin recebe offer, gera answer → Firestore
 *   4. Stream P2P estabelecido
 *   5. Qualquer lado pode encerrar; timeout automático 5 min
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  VideoOff,
  Loader2,
  SwitchCamera,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type SessionStatus = 'idle' | 'requesting' | 'connecting' | 'active' | 'ended' | 'error';
type FacingMode = 'environment' | 'user';

interface DeviceCameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  franchiseId: string;
  storeId: string;
  deviceId: string;
  deviceLabel: string;
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const ICE_GATHERING_TIMEOUT_MS = 5_000;
const SESSION_TIMEOUT_SECONDS = 300;

// ─── Helpers ────────────────────────────────────────────────────────────────

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
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

function StatusBadge({ status }: { status: SessionStatus }) {
  const config: Record<SessionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    idle: { label: 'Inativa', variant: 'secondary' },
    requesting: { label: 'Solicitando...', variant: 'outline' },
    connecting: { label: 'Conectando...', variant: 'outline' },
    active: { label: 'Ativa', variant: 'default' },
    ended: { label: 'Encerrada', variant: 'secondary' },
    error: { label: 'Erro', variant: 'destructive' },
  };

  const c = config[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function DeviceCameraDialog({
  open,
  onOpenChange,
  franchiseId,
  storeId,
  deviceId,
  deviceLabel,
}: DeviceCameraDialogProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<FacingMode>('environment');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const sessionsPath = `franchises/${franchiseId}/stores/${storeId}/devices/${deviceId}/cameraSessions`;

  // ── Cleanup ────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    sessionIdRef.current = null;
  }, []);

  // ── Start session ──────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    if (!user) return;
    cleanup();
    setStatus('requesting');
    setError(null);

    try {
      // 1. Criar doc de sessão
      const sessionsRef = collection(db, sessionsPath);
      const sessionDoc = await addDoc(sessionsRef, {
        status: 'requesting',
        requestedBy: user.uid,
        requestedByEmail: user.email || 'unknown',
        requestedAt: serverTimestamp(),
        timeoutSeconds: SESSION_TIMEOUT_SECONDS,
        facingMode: facing,
        audioEnabled,
      });

      sessionIdRef.current = sessionDoc.id;

      // 2. Escutar atualizações da sessão
      const sessionRef = doc(db, sessionsPath, sessionDoc.id);
      unsubRef.current = onSnapshot(sessionRef, async (snap) => {
        const data = snap.data();
        if (!data) return;

        // Kiosk enviou offer
        if (data.status === 'connecting' && data.offer && !pcRef.current) {
          setStatus('connecting');

          try {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            pcRef.current = pc;

            // Receber tracks do kiosk
            pc.ontrack = (event) => {
              if (videoRef.current && event.streams[0]) {
                videoRef.current.srcObject = event.streams[0];
              }
            };

            // Monitorar estado da conexão
            pc.onconnectionstatechange = () => {
              if (pc.connectionState === 'connected') {
                setStatus('active');
              } else if (
                pc.connectionState === 'disconnected' ||
                pc.connectionState === 'failed'
              ) {
                setStatus('error');
                setError('Conexão perdida');
              }
            };

            // Aplicar offer do kiosk
            const offer = JSON.parse(data.offer as string);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Criar answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Aguardar ICE gathering (vanilla ICE)
            await waitForIceGathering(pc);

            // Enviar answer para Firestore
            await updateDoc(sessionRef, {
              answer: JSON.stringify(pc.localDescription?.toJSON()),
            });
          } catch (err) {
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Falha na conexão');
          }
        }

        // Sessão ficou ativa
        if (data.status === 'active') {
          setStatus('active');
        }

        // Kiosk encerrou
        if (data.status === 'ended') {
          setStatus('ended');
          cleanup();
        }

        // Erro no kiosk
        if (data.status === 'error') {
          setStatus('error');
          setError(data.errorMessage || 'Erro no dispositivo');
          cleanup();
        }
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Falha ao criar sessão');
    }
  }, [user, sessionsPath, cleanup, facing, audioEnabled]);

  // ── Stop session ───────────────────────────────────────────────────────

  const stopSession = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        const sessionRef = doc(db, sessionsPath, sessionIdRef.current);
        await updateDoc(sessionRef, {
          status: 'ended',
          endedAt: serverTimestamp(),
          endReason: 'admin_stopped',
        });
      } catch {
        // ignore
      }
    }
    cleanup();
    setStatus('idle');
  }, [sessionsPath, cleanup]);

  // Cleanup ao fechar dialog
  useEffect(() => {
    if (!open) {
      stopSession();
    }
  }, [open, stopSession]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Câmera — {deviceLabel}
          </DialogTitle>
          <DialogDescription>
            Visualização em tempo real da câmera do dispositivo kiosk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>

          {/* Video player */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted || !audioEnabled}
              className="w-full h-full object-contain"
            />
            {status !== 'active' && (
              <div className="absolute inset-0 flex items-center justify-center">
                {status === 'requesting' || status === 'connecting' ? (
                  <div className="text-white flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm">
                      {status === 'requesting'
                        ? 'Aguardando dispositivo...'
                        : 'Conectando...'}
                    </span>
                  </div>
                ) : status === 'error' || status === 'ended' ? (
                  <VideoOff className="h-12 w-12 text-white/40" />
                ) : (
                  <Video className="h-12 w-12 text-white/20" />
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: camera/audio options (only when idle or can restart) */}
            <div className="flex items-center gap-2">
              {(status === 'idle' || status === 'ended' || status === 'error') && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                    title={facing === 'environment' ? 'Câmera traseira' : 'Câmera frontal'}
                  >
                    <SwitchCamera className="h-4 w-4 mr-1.5" />
                    {facing === 'environment' ? 'Traseira' : 'Frontal'}
                  </Button>
                  <Button
                    variant={audioEnabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAudioEnabled((v) => !v)}
                    title={audioEnabled ? 'Microfone ativado' : 'Microfone desativado'}
                  >
                    {audioEnabled ? (
                      <><Mic className="h-4 w-4 mr-1.5" /> Mic On</>
                    ) : (
                      <><MicOff className="h-4 w-4 mr-1.5" /> Mic Off</>
                    )}
                  </Button>
                </>
              )}
              {status === 'active' && audioEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMuted((m) => !m)}
                  title={isMuted ? 'Ativar som' : 'Mutar som'}
                >
                  {isMuted ? (
                    <><VolumeX className="h-4 w-4 mr-1.5" /> Mudo</>
                  ) : (
                    <><Volume2 className="h-4 w-4 mr-1.5" /> Som</>
                  )}
                </Button>
              )}
            </div>

            {/* Right: start/stop */}
            <div>
              {status === 'idle' || status === 'ended' || status === 'error' ? (
                <Button onClick={startSession}>
                  <Video className="h-4 w-4 mr-2" />
                  Iniciar Câmera
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopSession}>
                  <VideoOff className="h-4 w-4 mr-2" />
                  Encerrar
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
