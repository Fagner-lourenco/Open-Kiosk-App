/**
 * ============================================================================
 * Terminal Relay Service (Kiosk-side)
 * ============================================================================
 *
 * Escuta comandos de terminal remoto enviados pelo Admin via Firestore e
 * os retransmite ao ESP32, escrevendo a resposta de volta no Firestore.
 *
 * Fluxo:
 *   1. Admin cria doc em terminalCommands com status 'pending'
 *   2. Kiosk detecta via onSnapshot, envia comando ao ESP32
 *      - BLE/USB : esp32Service.sendCommand() + listener do primeiro JSON recebido
 *      - WiFi    : POST /command → resposta síncrona no body HTTP
 *   3. Kiosk escreve resposta (ou erro) de volta no doc Firestore
 *   4. Admin lê resposta via snapshot listener
 *
 * Usa o mesmo padrão do CameraStreamService (onSnapshot + stale filter).
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
import esp32Service from './esp32CommunicationService';

// ─── Constantes ─────────────────────────────────────────────────────────────

/** Ignorar comandos pending com mais de 30s (ex: kiosk reiniciou e encontrou docs antigos) */
const STALE_COMMAND_MS = 30_000;

/** Timeout padrão para resposta do ESP32 (BLE, USB ou WiFi) */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Timeouts por ação — comandos que levam mais tempo que o padrão */
const ACTION_TIMEOUT_MS: Record<string, number> = {
  diagnose_gpio: 20_000,   // Testes de hardware levam ~8.5s
  calibrate: 35_000,       // Depende de duration (até 30s)
  test_flow: 20_000,       // Similar ao calibrate
};

// ─── Service ────────────────────────────────────────────────────────────────

class TerminalRelayService {
  private unsubscribe: (() => void) | null = null;
  private franchiseId: string | null = null;
  private storeId: string | null = null;
  private deviceId: string | null = null;
  private processing = new Set<string>(); // IDs de comandos em processamento

  /**
   * Inicia escuta por comandos de terminal enviados pelo Admin.
   * Deve ser chamado após heartbeat (quando deviceId está disponível).
   */
  startListening(franchiseId: string, storeId: string, deviceId: string): void {
    if (this.unsubscribe) return; // Já está escutando

    this.franchiseId = franchiseId;
    this.storeId = storeId;
    this.deviceId = deviceId;

    const db = getFirebaseDb();
    if (!db) {
      console.warn('[TerminalRelay] Firestore não disponível');
      return;
    }

    const commandsRef = collection(
      db,
      `franchises/${franchiseId}/stores/${storeId}/devices/${deviceId}/terminalCommands`,
    );

    this.unsubscribe = onSnapshot(
      commandsRef,
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.status === 'pending') {
              // Ignorar comandos stale
              const createdAt = data.createdAt as Timestamp | null;
              if (createdAt) {
                const ageMs = Date.now() - createdAt.toMillis();
                if (ageMs > STALE_COMMAND_MS) {
                  console.log(`[TerminalRelay] Comando stale ignorado (${Math.round(ageMs / 1000)}s): ${change.doc.id}`);
                  continue;
                }
              }
              this.handleCommand(change.doc.id, data);
            }
          }
        }
      },
      (err) => {
        console.warn('[TerminalRelay] Listener error:', err.message);
      },
    );

    console.log('[TerminalRelay] Escutando comandos de terminal remoto');
  }

  /** Para escuta de comandos. */
  stopListening(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.processing.clear();
  }

  // ── Handler ──────────────────────────────────────────────────────────────

  private async handleCommand(
    commandId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Evitar processar o mesmo comando duas vezes
    if (this.processing.has(commandId)) return;
    this.processing.add(commandId);

    const db = getFirebaseDb();
    if (!db) return;

    const commandRef = doc(
      db,
      `franchises/${this.franchiseId}/stores/${this.storeId}/devices/${this.deviceId}/terminalCommands/${commandId}`,
    );

    try {
      // Marcar como processing
      await updateDoc(commandRef, {
        status: 'processing',
        processedAt: serverTimestamp(),
      });

      // Construir payload para o ESP32
      const action = data.action as string;
      const commandData = (data.data as Record<string, unknown>) || {};

      console.log(`[TerminalRelay] Enviando ao ESP32: action=${action}`, commandData);

      // Enviar ao ESP32 via transport ativo (BLE, USB ou WiFi)
      const result = await this.sendToESP32(action, commandData);

      // Escrever resposta de volta no Firestore
      await updateDoc(commandRef, {
        status: 'completed',
        response: result,
        respondedAt: serverTimestamp(),
      });

      console.log(`[TerminalRelay] Comando ${commandId} concluído`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[TerminalRelay] Erro no comando ${commandId}:`, errorMsg);

      try {
        await updateDoc(commandRef, {
          status: 'error',
          error: errorMsg,
          respondedAt: serverTimestamp(),
        });
      } catch {
        // Se falhar ao gravar erro, log apenas
        console.error('[TerminalRelay] Falha ao gravar erro no Firestore');
      }
    } finally {
      this.processing.delete(commandId);
    }
  }

  // ── Transport ────────────────────────────────────────────────────────────

  /**
   * Roteia o envio para o transport ativo (BLE, USB ou WiFi).
   */
  private async sendToESP32(
    action: string,
    commandData: Record<string, unknown>,
  ): Promise<unknown> {
    const connType = esp32Service.getConnectionStatus().type;

    if (connType === 'wifi') {
      return this.sendViaHttp(action, commandData);
    }
    if (connType === 'bluetooth' || connType === 'usb') {
      return this.sendViaBleOrUsb(action, commandData);
    }

    throw new Error(`ESP32 não está conectado (tipo: ${connType})`);
  }

  /**
   * WiFi: POST /command → resposta síncrona no body HTTP.
   */
  private async sendViaHttp(
    action: string,
    commandData: Record<string, unknown>,
  ): Promise<unknown> {
    const { buildLocalHttpUrl } = await import('@/utils/localNetworkGuard');
    const esp32Ip = localStorage.getItem('esp32_wifi_ip') ?? '192.168.4.1';
    const url = buildLocalHttpUrl(esp32Ip, '/command');

    const controller = new AbortController();
    const timeoutMs = ACTION_TIMEOUT_MS[action] ?? DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload = { action, ...commandData };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`ESP32 não respondeu (timeout ${timeoutMs / 1000}s)`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * BLE / USB OTG: usa esp32Service.sendCommand() e aguarda o primeiro
   * JSON recebido via listeners de dados (mesma linha que o ESP32Context usa).
   *
   * Listeners são registrados ANTES do envio para evitar race condition.
   * São removidos assim que a resposta chega ou o timeout expira.
   *
   * Filtragem de respostas:
   *  - JSONs sem campo `type` são ignorados (podem ser echo do write BLE no Android)
   *  - Respostas `type: "pong"` são ignoradas para comandos que não sejam `ping`
   *    (o heartbeat autônomo do ESP32 envia pong periodicamente e pode chegar primeiro)
   *
   * Retry: se sendCommand retornar false (BLE ocupado com heartbeat), tenta mais
   * 2 vezes com 400ms de intervalo antes de rejeitar.
   */
  private sendViaBleOrUsb(
    action: string,
    commandData: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubBle();
        unsubUsb();
        fn();
      };

      const isPingCommand = action === 'ping';
      // 🔒 Multi-Tablet: Se o comando inclui tapId, só aceitar respostas do mesmo tap
      const expectedTapId = (commandData as Record<string, unknown>)?.tapId;

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) return;
        try {
          const json = JSON.parse(trimmed) as Record<string, unknown>;

          // Ignorar echo do write BLE (Android): JSONs sem campo `type` são comandos enviados, não respostas
          if (typeof json.type !== 'string') return;

          // Ignorar pong do heartbeat autônomo para comandos que não sejam ping
          if (!isPingCommand && json.type === 'pong') return;

          // 🔒 Multi-Tablet: Ignorar respostas de outro tap (progress/status broadcast BLE)
          if (expectedTapId !== undefined && json.tapId !== undefined && json.tapId !== expectedTapId) {
            console.debug(`[TerminalRelay] Ignorando resposta de tap ${json.tapId} (esperado: ${expectedTapId})`);
            return;
          }

          settle(() => resolve(json));
        } catch {
          // fragmento ou linha não-JSON — aguardar próxima
        }
      };

      // Registrar listeners ANTES de enviar (sem race condition)
      const unsubBle = esp32Service.addBleDataListener(handleLine);
      const unsubUsb = esp32Service.addUsbDataListener(handleLine);

      const timeoutMs = ACTION_TIMEOUT_MS[action] ?? DEFAULT_TIMEOUT_MS;

      const timeoutId = setTimeout(() => {
        settle(() =>
          reject(
            new Error(`ESP32 não respondeu (timeout ${timeoutMs / 1000}s)`),
          ),
        );
      }, timeoutMs);

      // Envio com retry: BLE não suporta writes concorrentes. Se o heartbeat estiver
      // em voo no momento do envio, sendCommand retorna false. Tentar até 3x com 400ms.
      const data = Object.keys(commandData).length > 0 ? commandData : undefined;
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 400;

      const trySend = (attempt: number): void => {
        esp32Service
          .sendCommand(action, data)
          .then((sent) => {
            if (sent) return; // Enviado com sucesso — aguardar resposta via listener
            if (attempt < MAX_RETRIES) {
              console.warn(`[TerminalRelay] sendCommand retornou false (tentativa ${attempt}/${MAX_RETRIES}), retentando em ${RETRY_DELAY_MS}ms...`);
              setTimeout(() => trySend(attempt + 1), RETRY_DELAY_MS);
            } else {
              settle(() =>
                reject(new Error('Falha ao enviar comando ao ESP32 (transport layer)')),
              );
            }
          })
          .catch((err: unknown) => {
            settle(() => reject(err));
          });
      };

      trySend(1);
    });
  }
}

export const terminalRelayService = new TerminalRelayService();
