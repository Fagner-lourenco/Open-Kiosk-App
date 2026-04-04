/**
 * ============================================================================
 * DeviceTerminalDialog — Terminal remoto ESP32 via relay Kiosk
 * ============================================================================
 *
 * Permite enviar comandos ao ESP32 de um dispositivo kiosk remotamente.
 * Fluxo: Admin → Firestore → Kiosk → ESP32 → Kiosk → Firestore → Admin
 *
 * Usa subcollection terminalCommands dentro do dispositivo.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit,
  Timestamp,
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
import { Textarea } from '@/components/ui/textarea';
import {
  Terminal,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  Settings,
  Zap,
  Gauge,
  Cpu,
  Trash2,
  Droplets,
} from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface TerminalEntry {
  id: string;
  action: string;
  data?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  response?: unknown;
  error?: string;
  createdAt: Date;
  respondedAt?: Date;
}

interface DeviceTerminalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  franchiseId: string;
  storeId: string;
  deviceId: string;
  deviceLabel: string;
}

// ─── Botões rápidos ─────────────────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: 'Ping', action: 'ping', icon: Activity, description: 'Testar comunicação' },
  { label: 'Status', action: 'status', icon: Gauge, description: 'Status completo do ESP32' },
  { label: 'Settings', action: 'get_settings', icon: Settings, description: 'Calibração e config' },
  { label: 'Taps', action: 'get_taps', icon: Zap, description: 'Status das torneiras' },
  { label: 'GPIO', action: 'diagnose_gpio', icon: Cpu, description: 'Diagnóstico de pinos' },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StatusIcon({ status }: { status: TerminalEntry['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />;
    case 'processing':
      return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function DeviceTerminalDialog({
  open,
  onOpenChange,
  franchiseId,
  storeId,
  deviceId,
  deviceLabel,
}: DeviceTerminalDialogProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const commandsPath = `franchises/${franchiseId}/stores/${storeId}/devices/${deviceId}/terminalCommands`;

  // ── Scroll to bottom on new entries ────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // ── Listener: acompanhar status dos comandos em tempo real ─────────────

  useEffect(() => {
    if (!open) return;

    const commandsRef = collection(db, commandsPath);
    const q = query(commandsRef, orderBy('createdAt', 'desc'), limit(30));

    const unsub = onSnapshot(q, (snap) => {
      const docs: TerminalEntry[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          action: data.action || 'unknown',
          data: data.data,
          status: data.status || 'pending',
          response: data.response,
          error: data.error,
          createdAt: (data.createdAt as Timestamp)?.toDate?.() || new Date(),
          respondedAt: (data.respondedAt as Timestamp)?.toDate?.(),
        };
      });
      // Reverse to show oldest first (chronological order)
      docs.reverse();
      setEntries(docs);
    });

    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [open, commandsPath]);

  // ── Enviar comando ─────────────────────────────────────────────────────

  const sendCommand = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      if (!user || sending) return;
      setSending(true);

      try {
        const commandsRef = collection(db, commandsPath);
        await addDoc(commandsRef, {
          action,
          data: data || null,
          status: 'pending',
          createdAt: serverTimestamp(),
          sentBy: user.uid,
          sentByEmail: user.email || 'unknown',
        });
      } catch (err) {
        console.error('[Terminal] Erro ao enviar comando:', err);
      } finally {
        setSending(false);
      }
    },
    [user, sending, commandsPath],
  );

  // ── Enviar JSON livre ──────────────────────────────────────────────────

  const handleSendJson = useCallback(() => {
    const trimmed = jsonInput.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);
      const action = parsed.action;
      if (!action || typeof action !== 'string') {
        alert('JSON deve conter campo "action" (string)');
        return;
      }
      // Extrair action e enviar o resto como data
      const { action: _, ...rest } = parsed;
      sendCommand(action, Object.keys(rest).length > 0 ? rest : undefined);
      setJsonInput('');
    } catch {
      alert('JSON inválido. Verifique a sintaxe.');
    }
  }, [jsonInput, sendCommand]);

  // ── Limpar histórico (local only) ──────────────────────────────────────

  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <DialogTitle>Terminal ESP32</DialogTitle>
          </div>
          <DialogDescription>
            {deviceLabel} — Comandos enviados via relay Firestore → Kiosk → ESP32
          </DialogDescription>
        </DialogHeader>

        {/* Botões rápidos */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((cmd) => (
            <Button
              key={cmd.action}
              variant="outline"
              size="sm"
              disabled={sending}
              onClick={() => sendCommand(cmd.action)}
              title={cmd.description}
              className="gap-1.5 text-xs"
            >
              <cmd.icon className="h-3.5 w-3.5" />
              {cmd.label}
            </Button>
          ))}

          {/* Test Valve (com tapId) */}
          <Button
            variant="outline"
            size="sm"
            disabled={sending}
            onClick={() => sendCommand('test_valve', { duration: 1000, tapId: 0 })}
            title="Testar válvula Tap 0 (1s)"
            className="gap-1.5 text-xs"
          >
            <Zap className="h-3.5 w-3.5" />
            Valve T0
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={sending}
            onClick={() => sendCommand('test_valve', { duration: 1000, tapId: 1 })}
            title="Testar válvula Tap 1 (1s)"
            className="gap-1.5 text-xs"
          >
            <Zap className="h-3.5 w-3.5" />
            Valve T1
          </Button>

          {/* Calibração (abre válvula e conta pulsos por 10s) */}
          <Button
            variant="outline"
            size="sm"
            disabled={sending}
            onClick={() => sendCommand('calibrate', { duration: 10000, tapId: 0 })}
            title="Calibrar Tap 0 (10s — meça o volume dispensado)"
            className="gap-1.5 text-xs"
          >
            <Droplets className="h-3.5 w-3.5" />
            Cal T0
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={sending}
            onClick={() => sendCommand('calibrate', { duration: 10000, tapId: 1 })}
            title="Calibrar Tap 1 (10s — meça o volume dispensado)"
            className="gap-1.5 text-xs"
          >
            <Droplets className="h-3.5 w-3.5" />
            Cal T1
          </Button>
        </div>

        {/* JSON livre (toggle) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            JSON livre (avançado)
          </button>

          {showAdvanced && (
            <div className="mt-2 flex gap-2">
              <Textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"action":"ping"}'
                className="min-h-[60px] font-mono text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSendJson();
                  }
                }}
              />
              <Button
                variant="default"
                size="sm"
                disabled={sending || !jsonInput.trim()}
                onClick={handleSendJson}
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Log de comandos/respostas */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {entries.length > 0 ? `${entries.length} comando(s)` : 'Nenhum comando enviado'}
          </span>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={clearEntries}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 min-h-[200px] max-h-[400px] overflow-auto rounded-md border bg-muted/30 p-3">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Terminal className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Envie um comando para começar</p>
              <p className="text-xs mt-1 opacity-60">Use os botões acima ou JSON livre</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <TerminalEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entry Card ─────────────────────────────────────────────────────────────

function TerminalEntryCard({ entry }: { entry: TerminalEntry }) {
  const [expanded, setExpanded] = useState(entry.status === 'completed' || entry.status === 'error');

  // Auto-expand when response arrives
  useEffect(() => {
    if (entry.status === 'completed' || entry.status === 'error') {
      setExpanded(true);
    }
  }, [entry.status]);

  const latencyMs =
    entry.respondedAt && entry.createdAt
      ? entry.respondedAt.getTime() - entry.createdAt.getTime()
      : null;

  return (
    <div className="rounded-md border bg-background text-xs">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
      >
        <StatusIcon status={entry.status} />
        <span className="font-mono font-semibold text-primary">{entry.action}</span>
        {entry.data && Object.keys(entry.data).length > 0 && (
          <span className="text-muted-foreground truncate max-w-[200px]">
            {JSON.stringify(entry.data)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground shrink-0">
          {latencyMs != null && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {latencyMs}ms
            </Badge>
          )}
          <span>{formatTimestamp(entry.createdAt)}</span>
        </span>
      </button>

      {/* Response body */}
      {expanded && (entry.response || entry.error) && (
        <div className="border-t px-3 py-2">
          {entry.error ? (
            <pre className="font-mono text-red-500 whitespace-pre-wrap break-all">
              {entry.error}
            </pre>
          ) : (
            <pre className="font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
              {JSON.stringify(entry.response, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
