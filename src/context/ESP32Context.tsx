/**
 * ESP32Context - Contexto global para gerenciar conexão ESP32
 * 
 * Mantém estado de conexão persistente entre navegações de página.
 * Gerencia heartbeat, auto-reconexão e eventos de conexão.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import esp32Service, { ConnectionStatus, ConnectionType, ConnectionSupervisorStatus, ESP32Device, getESP32WiFiIP } from '@/services/esp32CommunicationService';
import esp32Serial, { ESP32Response } from '@/services/esp32SerialService';
import { useStoreContext } from '@/context/StoreContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { getCurrentFranchiseId, getCurrentStoreId } from '@/services/firebase';
import { hardwareStatusService } from '@/services/hardwareStatusService';
import { persistSession } from '@/services/servingSessionService';
import { salesService } from '@/services/salesService';
import { persistFailedDispense, reconcileOnStartup } from '@/services/dispenseRecoveryService';
import { systemLogService } from '@/services/systemLogService';
import { useToast } from '@/hooks/use-toast';
import {
  TapStatus,
  TapConfig,
  ESP32State,
  ESP32DispensingProgress,
  ESP32Settings,
  ESP32LogEntry,
  ESP32ContextValue,
} from '@/types/esp32ContextTypes';

// ============================================
// CONTEXTO
// ============================================

const ESP32Context = createContext<ESP32ContextValue | null>(null);

// Helper: retry Firestore updates with exponential backoff, persist locally on final failure
async function updateDispenseStatusWithRetry(
  orderId: string,
  status: 'dispensing' | 'dispensed' | 'failed_dispense',
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await salesService.updateOrderDispenseStatus(orderId, status);
      return;
    } catch (err) {
      console.error(`[ESP32Context] Firestore update attempt ${attempt}/${maxRetries} failed:`, err);
      if (attempt === maxRetries) {
        // All retries failed - persist locally for reconciliation on next startup
        await persistFailedDispense(orderId, `firestore_update_failed_${status}`);
        return;
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
}

// ============================================
// PROVIDER
// ============================================

interface ESP32ProviderProps {
  children: React.ReactNode;
  heartbeatInterval?: number;
  autoReconnect?: boolean;
}

export const ESP32Provider: React.FC<ESP32ProviderProps> = ({
  children,
  heartbeatInterval = 60000,  // 🔧 60 segundos (antes: 15s) - reduz spam de ping
  autoReconnect = true,
}) => {
  const { toast } = useToast();
  const { settings: storeSettings } = useStoreSettings();

  // Estado
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, type: 'none' });
  const [supervisorStatus, setSupervisorStatus] = useState<ConnectionSupervisorStatus>(esp32Service.getConnectionSupervisorStatus());
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDispensing, setIsDispensing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<ESP32DispensingProgress | null>(null);
  const [settings, setSettings] = useState<ESP32Settings | null>(null);

  // 🆕 Multi-Tap state
  const [numTaps, setNumTaps] = useState<number>(1);
  const [taps, setTaps] = useState<TapStatus[]>([]);
  const [selectedTapId, setSelectedTapId] = useState<number>(0);

  // Logs persistentes
  const [logs, setLogs] = useState<ESP32LogEntry[]>([]);
  const logIdRef = useRef(0);

  // Dedup guard: evitar logs repetidos de "Conexão estabelecida" quando já conectado
  const lastConnectionKeyRef = useRef<string>('none');

  // ServingSession: capture progress ref for persistence before state clear
  const currentProgressRef = useRef<ESP32DispensingProgress | null>(null);
  const dispensingStartedAtRef = useRef<Date | null>(null);

  // Dispense timeout: marca como failed_dispense se ESP32 não responder
  const dispenseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DISPENSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

  // Grace period: tolerar BLE drop transitório durante dispense ativo sem declarar falha imediatamente
  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DISCONNECT_GRACE_MS = 15_000; // 15s para reconectar antes de declarar falha

  // Inicializar systemLogService
  useEffect(() => {
    const deviceId = localStorage.getItem('deviceId') || undefined;
    systemLogService.start(deviceId);
    systemLogService.info('kiosk', 'Kiosk inicializado');
    return () => systemLogService.stop();
  }, []);

  // Concurrency guard: prevent double dispense
  const isReleasingRef = useRef<boolean>(false);

  // ✅ Taps Configuration Sync Logic
  const { taps: storeTaps, tapsVersion, reportTapApplied } = useStoreContext();
  const appliedVersionRef = useRef<number>(0);
  const applyInFlightRef = useRef<boolean>(false);
  const applyRetryCountRef = useRef<number>(0);
  const applyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Load appliedVersion on mount
  useEffect(() => {
    const fid = getCurrentFranchiseId();
    const sid = getCurrentStoreId();
    if (fid && sid) {
      const key = `applied_taps_version:${fid}:${sid}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        appliedVersionRef.current = parseInt(saved, 10);
        console.log('[ESP32Context] Loaded appliedVersion:', appliedVersionRef.current);
      }
    }
  }, [storeSettings?.esp32HeartbeatIntervalMs]);

  // 2. Sync effect: Detect version changes or connection
  useEffect(() => {
    if (!status.connected || tapsVersion <= appliedVersionRef.current || storeTaps.length === 0) {
      return;
    }

    if (applyInFlightRef.current) return;

    // Debounce to avoid rapid changes
    if (applyTimeoutRef.current) clearTimeout(applyTimeoutRef.current);

    applyTimeoutRef.current = setTimeout(async () => {
      applyInFlightRef.current = true;
      console.log(`[ESP32Context] 🔄 Syncing taps to v${tapsVersion}...`);

      try {
        const success = await esp32Service.configureMultipleTaps(storeTaps);

        if (success) {
          console.log('[ESP32Context] ✅ Taps configured successfully to v', tapsVersion);
          appliedVersionRef.current = tapsVersion;

          // Persist locally
          const fid = getCurrentFranchiseId();
          const sid = getCurrentStoreId();
          if (fid && sid) {
            localStorage.setItem(`applied_taps_version:${fid}:${sid}`, tapsVersion.toString());
          }

          // Standardized report
          await reportTapApplied(tapsVersion, { status: 'success' });
          applyRetryCountRef.current = 0;
        } else {
          throw new Error('ESP32 NACK or timeout on configure_taps');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown hardware error';
        console.error('[ESP32Context] ❌ Sync failed:', errorMsg);

        // Limited retry for transient errors
        if (applyRetryCountRef.current < 3 && status.connected) {
          applyRetryCountRef.current++;
          console.log(`[ESP32Context] Retrying apply (${applyRetryCountRef.current}/3)...`);
          // Logic to retry: let the next tick or effect trigger it again
          // by keeping appliedVersionRef < tapsVersion and clearing inFlight
        } else {
          await reportTapApplied(tapsVersion, { status: 'error', errorMsg });
          applyRetryCountRef.current = 0;
        }
      } finally {
        applyInFlightRef.current = false;
        applyTimeoutRef.current = null;
      }
    }, 500);

    return () => {
      if (applyTimeoutRef.current) clearTimeout(applyTimeoutRef.current);
    };
  }, [status.connected, tapsVersion, storeTaps, reportTapApplied]);

  // 🆕 HEARTBEAT: Removido heartbeat duplicado do Context.
  // O supervisor healthcheck (7s) no esp32CommunicationService já monitora a conexão.
  // Ter 3 heartbeats concorrentes (Context + Legacy + Supervisor) causava spam e triggers duplos.
  // Se esp32HeartbeatIntervalMs estiver configurado, ele é ignorado aqui — configurar via supervisor.

  // Refs para listeners
  const responseListeners = useRef<Set<(response: ESP32Response) => void>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================
  // FUNÇÕES DE LOG
  // ============================================

  const addLog = useCallback((type: ESP32LogEntry['type'], message: string, json?: ESP32Response) => {
    setLogs(prev => [
      ...prev.slice(-199), // Manter últimos 200 logs
      {
        id: ++logIdRef.current,
        timestamp: new Date(),
        type,
        message,
        json,
      },
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    logIdRef.current = 0;
  }, []);

  // ============================================
  // HANDLERS DE RESPOSTA
  // ============================================

  // 🔧 CORREÇÃO: Ref para rastrear último pong e evitar logs duplicados
  const lastPongTimeRef = useRef<number>(0);

  const handleESP32Response = useCallback((response: ESP32Response) => {
    // 🔧 CORREÇÃO: Filtrar pongs repetidos (menos de 5s entre eles)
    let skipLog = false;
    if (response.type === 'pong') {
      const now = Date.now();
      skipLog = now - lastPongTimeRef.current < 5000;
      lastPongTimeRef.current = now;
      // KIO-09 fix: removed early return — pong data (num_taps, ip, etc.) must always be processed

      // 🆕 Atualizar status remoto com dados do pong (ip, firmware_version, mac, num_taps)
      if (!skipLog) {
        hardwareStatusService.updateStatus({
          esp32Connected: true,
          lastSyncAt: new Date(),
          ...(response.ip ? { esp32Ip: response.ip } : {}),
          ...(response.mac ? { macAddress: response.mac } : {}),
          ...(response.firmware_version ? { firmwareVersion: response.firmware_version } : {}),
          ...(response.num_taps ? { numTaps: response.num_taps } : {}),
          // KIO-07: capture finish_types and taps config from pong
          ...(response.finish_types ? { finishTypes: response.finish_types } : {}),
          ...(response.taps ? { tapsConfig: response.taps } : {}),
        });
      }
    }

    if (response.type !== 'pong' || !skipLog) {
      console.debug('[ESP32Context] Resposta recebida:', response);
    }

    // Adicionar ao log persistente
    addLog('received', JSON.stringify(response), response);

    // 🆕 Multi-Tap: Processar num_taps de QUALQUER resposta que inclua
    if (response.num_taps !== undefined && response.num_taps > 0) {
      console.debug('[ESP32Context] 🚰 num_taps detectado:', response.num_taps);
      setNumTaps(response.num_taps);
    }

    // Notificar todos os listeners
    responseListeners.current.forEach(listener => {
      try {
        listener(response);
      } catch (error) {
        console.error('[ESP32Context] Erro em listener:', error);
      }
    });

    // 🆕 CORREÇÃO: Detectar tipo por campos quando 'type' está ausente
    // Isso é necessário porque mensagens BLE podem chegar fragmentadas ou em ordem diferente
    let responseType = response.type;
    if (!responseType) {
      // Detectar tipo por campos característicos
      if (response.percent !== undefined || response.flow_started !== undefined ||
        (response.ml !== undefined && response.target !== undefined)) {
        responseType = 'progress';
        console.debug('[ESP32Context] Tipo detectado por campos: progress');
      } else if (response.stage !== undefined) {
        responseType = 'status';
        console.debug('[ESP32Context] Tipo detectado por campos: status');
      } else if (response.pulses !== undefined && response.duration_ms !== undefined) {
        responseType = response.ml_calculated !== undefined ? 'flow_test' : 'calibration';
        console.debug('[ESP32Context] Tipo detectado por campos:', responseType);
      } else if (response.timestamp !== undefined && Object.keys(response).length <= 2) {
        responseType = 'pong';
        console.debug('[ESP32Context] Tipo detectado por campos: pong');
      }
    }

    // Processar tipos específicos
    switch (responseType) {
      case 'progress':
        setIsDispensing(true);
        {
          const progressData: ESP32DispensingProgress = {
            orderId: response.orderId || '',
            cup: response.cup || 1,
            totalCups: response.total_cups || 1,
            ml: response.ml || 0,
            targetMl: response.target || response.target_ml || 0,
            percent: response.percent || 0,
            flowStarted: response.flow_started ?? false,
            elapsedSeconds: response.elapsed_seconds ?? 0,
            remainingSeconds: response.remaining_seconds ?? 300,
            tapId: response.tapId, // Multi-Tap: incluir tapId no progresso
          };
          setCurrentProgress(progressData);
          currentProgressRef.current = progressData; // keep ref in sync for persistSession
        }

        // 🆕 Multi-Tap: Atualizar status do tap específico
        if (response.tapId !== undefined) {
          setTaps(prev => {
            const updated = [...prev];
            const tapIndex = updated.findIndex(t => t.id === response.tapId);
            const tapStatus: TapStatus = {
              id: response.tapId,
              isDispensing: true,
              orderId: response.orderId,
              currentCup: response.cup || 1,
              totalCups: response.total_cups || 1,
              mlDispensed: response.ml || 0,
              targetMl: response.target || response.target_ml || 0,
              flowStarted: response.flow_started ?? false,
              progress: response.percent || 0,
            };
            if (tapIndex >= 0) {
              updated[tapIndex] = tapStatus;
            } else {
              updated.push(tapStatus);
            }
            return updated;
          });
        }
        break;

      case 'status':
        // Persist per-cup session on cup_complete (multi-cup orders)
        if (response.stage === 'cup_complete') {
          const cupProgressSnapshot = currentProgressRef.current;
          if (cupProgressSnapshot && cupProgressSnapshot.orderId) {
            persistSession({
              progress: cupProgressSnapshot,
              stage: 'completed',
              startedAt: dispensingStartedAtRef.current || undefined,
            }).catch((err) => {
              console.error('[ESP32Context] Failed to persist cup session:', err);
            });
          }
        }

        // ⚡ Detectar ESP32 reboot durante dispense ativo (brownout, watchdog, etc.)
        // Quando stage === 'ready' mas ainda temos um dispense em andamento,
        // significa que o ESP32 reiniciou e perdeu o estado da dispensação.
        if (response.stage === 'ready' && currentProgressRef.current) {
          console.error('[ESP32Context] ⚡ ESP32 reiniciou durante dispense ativo! orderId:', currentProgressRef.current.orderId);
          
          // Limpar timeout de segurança
          if (dispenseTimeoutRef.current) {
            clearTimeout(dispenseTimeoutRef.current);
            dispenseTimeoutRef.current = null;
          }

          // Persist session como falha
          const rebootProgress = currentProgressRef.current;
          persistSession({
            progress: rebootProgress,
            stage: 'error',
            errorMessage: 'ESP32 reiniciou durante dispensação (possível brownout)',
            startedAt: dispensingStartedAtRef.current || undefined,
          }).catch((err) => {
            console.error('[ESP32Context] Failed to persist reboot serving session:', err);
          });

          updateDispenseStatusWithRetry(rebootProgress.orderId, 'failed_dispense');
          persistFailedDispense(rebootProgress.orderId, 'esp32_reboot_during_dispense', {
            mlDispensed: rebootProgress.ml,
            targetMl: rebootProgress.targetMl,
            cup: rebootProgress.cup,
            totalCups: rebootProgress.totalCups,
            tapId: rebootProgress.tapId,
          });

          systemLogService.error('dispense', `Dispense interrompido por reboot: ${rebootProgress.orderId}`, {
            ml: rebootProgress.ml, targetMl: rebootProgress.targetMl,
            cup: rebootProgress.cup, totalCups: rebootProgress.totalCups,
          });

          if (disconnectGraceTimerRef.current) { clearTimeout(disconnectGraceTimerRef.current); disconnectGraceTimerRef.current = null; }
          setIsDispensing(false);
          setCurrentProgress(null);
          currentProgressRef.current = null;
          dispensingStartedAtRef.current = null;
          esp32Service.setDispensingInProgress(false); // 🔧 FIX: Liberar healthcheck (reboot path)

          // Notificar listeners como erro para DrinkPickupScreen mostrar estado de erro
          responseListeners.current.forEach(listener => {
            try {
              listener({
                type: 'status',
                stage: 'error',
                orderId: rebootProgress.orderId,
                tapId: rebootProgress.tapId,
                message: 'ESP32 reiniciou durante dispensação (possível brownout)',
              } as ESP32Response);
            } catch (e) { /* ignore */ }
          });
        }

        if (response.stage === 'completed' || response.stage === 'error') {
          // Limpar timeout de segurança
          if (dispenseTimeoutRef.current) {
            clearTimeout(dispenseTimeoutRef.current);
            dispenseTimeoutRef.current = null;
          }

          // Persist ServingSession BEFORE clearing state
          const progressSnapshot = currentProgressRef.current;
          if (progressSnapshot && progressSnapshot.orderId) {
            persistSession({
              progress: progressSnapshot,
              stage: response.stage,
              errorMessage: response.error || response.message,
              startedAt: dispensingStartedAtRef.current || undefined,
            }).catch((err) => {
              console.error('[ESP32Context] Failed to persist serving session:', err);
            });

            // Atualizar status do pedido no Firestore
            const dispenseResult = response.stage === 'completed' ? 'dispensed' : 'failed_dispense';
            updateDispenseStatusWithRetry(progressSnapshot.orderId, dispenseResult);

            // Log de dispense completo ou falho
            if (response.stage === 'completed') {
              systemLogService.info('dispense', `Dispense concluído: ${progressSnapshot.orderId}`, {
                ml: progressSnapshot.ml, targetMl: progressSnapshot.targetMl, cup: progressSnapshot.cup, totalCups: progressSnapshot.totalCups,
              });
            } else {
              systemLogService.error('dispense', `Dispense falhou: ${progressSnapshot.orderId}`, {
                ml: progressSnapshot.ml, targetMl: progressSnapshot.targetMl, error: response.error || response.message,
              });
            }

            // Se falhou, persistir localmente para reconciliação
            if (response.stage === 'error') {
              persistFailedDispense(progressSnapshot.orderId, response.error || 'esp32_error', {
                mlDispensed: progressSnapshot.ml,
                targetMl: progressSnapshot.targetMl,
                cup: progressSnapshot.cup,
                totalCups: progressSnapshot.totalCups,
                tapId: progressSnapshot.tapId,
              });
            }
          }

          if (disconnectGraceTimerRef.current) { clearTimeout(disconnectGraceTimerRef.current); disconnectGraceTimerRef.current = null; }
          setIsDispensing(false);
          setCurrentProgress(null);
          currentProgressRef.current = null;
          dispensingStartedAtRef.current = null;
          esp32Service.setDispensingInProgress(false); // 🔧 FIX: Liberar healthcheck

          // Multi-Tap: Atualizar tap como não dispensando
          if (response.tapId !== undefined) {
            setTaps(prev => prev.map(t =>
              t.id === response.tapId
                ? { ...t, isDispensing: false, progress: response.stage === 'completed' ? 100 : t.progress }
                : t
            ));
          }
        }

        // 🆕 Multi-Tap: Processar num_taps do status
        if (response.num_taps !== undefined) {
          setNumTaps(response.num_taps);

          // Atualizar status remoto com info multi-tap
          hardwareStatusService.updateStatus({
            numTaps: response.num_taps,
            hardwareId: response.chip_id || response.hardware_id,
            lastSyncAt: new Date() // 🆕 Sync detectado
          });
        }

        // 🆕 Multi-Tap: Processar array de taps
        if (response.taps && Array.isArray(response.taps)) {
          const tapsData = response.taps.map((t: Record<string, unknown>) => ({
            id: t.id as number,
            isDispensing: t.isDispensing as boolean ?? false,
            orderId: t.orderId as string | undefined,
            currentCup: t.currentCup as number ?? 0,
            totalCups: t.totalCups as number ?? 0,
            mlDispensed: t.mlDispensed as number ?? 0,
            targetMl: t.targetMl as number ?? 0,
            flowStarted: t.flowStarted as boolean ?? false,
            progress: t.progress as number ?? 0,
          }));
          setTaps(tapsData);

          // Atualizar status remoto com estado dos taps
          hardwareStatusService.updateStatus({
            taps: tapsData.map(t => ({
              id: t.id,
              isDispensing: t.isDispensing,
              orderId: t.orderId,
              progress: t.progress,
            })),
          });
        }
        break;

      // 🆕 Resposta específica de get_taps
      case 'taps_status':
        if (response.num_taps !== undefined) {
          setNumTaps(response.num_taps);
        }
        if (response.taps && Array.isArray(response.taps)) {
          const tapsData = response.taps.map((t: Record<string, unknown>) => ({
            id: t.id as number,
            isDispensing: t.isDispensing as boolean ?? false,
            orderId: t.orderId as string | undefined,
            currentCup: t.currentCup as number ?? 0,
            totalCups: t.totalCups as number ?? 0,
            mlDispensed: t.mlDispensed as number ?? 0,
            targetMl: t.targetMl as number ?? 0,
            flowStarted: t.flowStarted as boolean ?? false,
            progress: t.progress as number ?? 0,
          }));
          setTaps(tapsData);
          console.log('[ESP32Context] 🚰 Taps atualizados:', tapsData);
        }
        break;

      // Handle config_applied ACK from firmware (set_config / configure_taps response)
      case 'config_applied':
        if (response.applied && response.tapsVersion) {
          console.log('[ESP32Context] Config applied ACK received, version:', response.tapsVersion);
          appliedVersionRef.current = response.tapsVersion;
          const fid = getCurrentFranchiseId();
          const sid = getCurrentStoreId();
          if (fid && sid) {
            localStorage.setItem(`applied_taps_version:${fid}:${sid}`, String(response.tapsVersion));
          }
          reportTapApplied(response.tapsVersion, { status: 'success' });
          applyRetryCountRef.current = 0;
        }
        break;

      case 'settings':
        setSettings({
          firmwareVersion: response.firmware_version || 'unknown',
          pulsosPorLitro: response.pulsos_por_litro || 450,
          mlPorSegundo: response.ml_por_segundo || 50,
          wifiSsid: response.wifi_ssid,
          wifiIp: response.wifi_ip,
          mdnsHostname: response.mdns_hostname,
          bleName: response.ble_name,
        });
        // Atualizar status remoto com todos os dados do ESP32
        hardwareStatusService.updateStatus({
          firmwareVersion: response.firmware_version,
          esp32Ip: response.wifi_ip,
          macAddress: response.mac,
          lastSyncAt: new Date()
        });
        systemLogService.info('firmware', `Firmware ${response.firmware_version || 'unknown'} detectado`, {
          ip: response.wifi_ip, mac: response.mac, pulsosPorLitro: response.pulsos_por_litro,
        });
        break;

      case 'error':
        setLastError(response.message || 'Erro desconhecido');
        systemLogService.error('esp32', `Erro ESP32: ${response.message || 'desconhecido'}`, {
          stage: response.stage, orderId: currentProgressRef.current?.orderId,
        });
        if (response.stage === 'error') {
          // Persist ServingSession for error case
          const errorProgressSnapshot = currentProgressRef.current;
          if (errorProgressSnapshot && errorProgressSnapshot.orderId) {
            persistSession({
              progress: errorProgressSnapshot,
              stage: 'error',
              errorMessage: response.message || 'Erro desconhecido',
              startedAt: dispensingStartedAtRef.current || undefined,
            }).catch((err) => {
              console.error('[ESP32Context] Failed to persist error serving session:', err);
            });
          }
          if (disconnectGraceTimerRef.current) { clearTimeout(disconnectGraceTimerRef.current); disconnectGraceTimerRef.current = null; }
          setIsDispensing(false);
          setCurrentProgress(null);
          currentProgressRef.current = null;
          dispensingStartedAtRef.current = null;
        }
        break;
    }
  }, []);

  // ============================================
  // GERENCIAMENTO DE CONEXÃO
  // ============================================

  const updateConnectionStatus = useCallback((newStatus: ConnectionStatus) => {
    console.debug('[ESP32Context] updateConnectionStatus recebido:', JSON.stringify(newStatus));
    setStatus(newStatus);

    // Persistir status no Firestore para monitoramento remoto (Admin)
    hardwareStatusService.updateStatus({
      esp32Connected: newStatus.connected,
      esp32Type: newStatus.type !== 'none' ? newStatus.type as 'usb' | 'wifi' | 'bluetooth' : undefined,
      esp32Port: newStatus.deviceName,
    });

    if (newStatus.connected) {
      setLastError(null);

      // ✅ Reconexão durante grace period → dispense continua normalmente
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
        console.log('[ESP32Context] ✅ Reconectado durante grace period — dispense ativo continua');
        systemLogService.info('dispense', 'Reconexão BLE durante dispense ativo, continuando');
      }

      // Dedup: só logar se tipo/device mudou (evita 6x "Conexão estabelecida" no startup)
      const connectionKey = `${newStatus.type}:${newStatus.deviceName || ''}`;
      if (lastConnectionKeyRef.current !== connectionKey) {
        lastConnectionKeyRef.current = connectionKey;
        systemLogService.info('esp32', `Conexão ${newStatus.type} estabelecida`, { device: newStatus.deviceName });
      }

      // Iniciar heartbeat remoto com o mesmo intervalo (heartbeat local é gerenciado pelo useEffect dinâmico)
      const interval = storeSettings?.esp32HeartbeatIntervalMs || 60000;
      hardwareStatusService.startHeartbeat(interval);
    } else {
      // Parar heartbeat local e remoto
      lastConnectionKeyRef.current = 'none'; // Reset para logar na próxima conexão
      hardwareStatusService.stopHeartbeat();
      systemLogService.warn('esp32', 'Conexão perdida', { lastType: newStatus.type });

      // Parar heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // 🔧 FIX: Desconexão durante dispense ativo — grace period para reconexão
      // ESP32 continua dispensando localmente mesmo se BLE cai. Se reconectar a tempo,
      // o app retoma recebimento de progress normalmente. Só declara falha se grace expirar.
      const activeProgress = currentProgressRef.current;
      if (activeProgress && activeProgress.orderId) {
        console.warn('[ESP32Context] ⚡ Conexão perdida durante dispense ativo, aguardando reconexão...', activeProgress.orderId);
        systemLogService.warn('dispense', `Conexão perdida durante dispense, grace period ${DISCONNECT_GRACE_MS}ms`, {
          orderId: activeProgress.orderId,
          ml: activeProgress.ml, targetMl: activeProgress.targetMl,
          cup: activeProgress.cup, totalCups: activeProgress.totalCups,
        });

        // Apenas iniciar grace timer se ainda não tiver um ativo
        if (!disconnectGraceTimerRef.current) {
          disconnectGraceTimerRef.current = setTimeout(() => {
            disconnectGraceTimerRef.current = null;

            // Verificar se ainda está desconectado E dispense ainda ativo
            const stillActive = currentProgressRef.current;
            const stillDisconnected = !esp32Service.getConnectionStatus().connected;

            if (stillActive && stillActive.orderId && stillDisconnected) {
              console.error('[ESP32Context] ❌ Grace period expirado — declarando falha de dispense:', stillActive.orderId);
              systemLogService.error('dispense', `Grace period expirado, dispense falhou: ${stillActive.orderId}`);

              // Limpar timeout de segurança
              if (dispenseTimeoutRef.current) {
                clearTimeout(dispenseTimeoutRef.current);
                dispenseTimeoutRef.current = null;
              }

              // Persist serving session como erro
              persistSession({
                progress: stillActive,
                stage: 'error',
                errorMessage: 'Conexão perdida durante dispensação (grace expirado)',
                startedAt: dispensingStartedAtRef.current || undefined,
              }).catch((err) => {
                console.error('[ESP32Context] Failed to persist disconnect session:', err);
              });

              updateDispenseStatusWithRetry(stillActive.orderId, 'failed_dispense');
              persistFailedDispense(stillActive.orderId, 'ble_disconnect', {
                mlDispensed: stillActive.ml,
                targetMl: stillActive.targetMl,
                cup: stillActive.cup,
                totalCups: stillActive.totalCups,
                tapId: stillActive.tapId,
              });

              // Notificar listeners como erro
              responseListeners.current.forEach(listener => {
                try {
                  listener({
                    type: 'status',
                    stage: 'error',
                    orderId: stillActive.orderId,
                    tapId: stillActive.tapId,
                    message: 'Conexão perdida durante dispensação',
                  } as ESP32Response);
                } catch (e) { /* ignore */ }
              });

              esp32Service.setDispensingInProgress(false);
              setIsDispensing(false);
              setCurrentProgress(null);
              currentProgressRef.current = null;
              dispensingStartedAtRef.current = null;
            } else {
              console.log('[ESP32Context] Grace period expirado mas dispense já resolvido ou reconectado');
            }
          }, DISCONNECT_GRACE_MS);
        }
      }
    }
  }, [storeSettings]); // KIO-10 fix: storeSettings dependency to avoid stale closure on heartbeat interval

  // 🆕 Força sincronização do status de conexão com o serviço
  const refreshConnectionStatus = useCallback(() => {
    const currentStatus = esp32Service.getConnectionStatus();
    console.log('[ESP32Context] refreshConnectionStatus:', JSON.stringify(currentStatus));
    if (currentStatus.connected !== status.connected || currentStatus.type !== status.type) {
      console.log('[ESP32Context] Status diferente, atualizando...');
      updateConnectionStatus(currentStatus);
    }
  }, [status, updateConnectionStatus]);

  // Registrar listener no serviço de comunicação
  useEffect(() => {
    // Listener para mudanças de conexão
    const unsubConnectionChange = esp32Service.setOnConnectionChange(updateConnectionStatus);
    const unsubSupervisor = esp32Service.addConnectionSupervisorListener((nextStatus) => {
      setSupervisorStatus(nextStatus);
    });

    // Listener para respostas Serial/USB (JSON parsed)
    const unsubscribeMessage = esp32Serial.onMessage(handleESP32Response);

    // Listener para linhas raw (não-JSON)
    const unsubscribeRaw = esp32Serial.onRawLine((line: string) => {
      if (!line.startsWith('{')) {
        addLog('received', line);
      }
    });

    // 🆕 Listener para dados recebidos via Bluetooth
    // NOTA: O serviço agora envia linhas completas (já processou o buffer)
    const unsubBleData = esp32Service.setOnBleDataReceived((line: string) => {
      console.log('[ESP32Context] BLE linha recebida:', line);

      // Tentar parsear como JSON
      if (line.startsWith('{')) {
        try {
          const json = JSON.parse(line);
          addLog('received', line, json);
          handleESP32Response(json);
        } catch (e) {
          // Não é JSON válido, logar como texto
          console.warn('[ESP32Context] JSON inválido:', line, e);
          addLog('received', line);
        }
      } else if (line.trim()) {
        // Linha de texto normal
        addLog('received', line);
      }
    });

    // 🆕 Listener para dados recebidos via USB OTG nativo (Android)
    // NOTA: O serviço agora envia linhas completas (já processou o buffer)
    const unsubUsbData = esp32Service.setOnUsbDataReceived((line: string) => {
      console.log('[ESP32Context] USB OTG linha recebida:', line);

      // Tentar parsear como JSON
      if (line.startsWith('{')) {
        try {
          const json = JSON.parse(line);
          addLog('received', line, json);
          handleESP32Response(json);
        } catch (e) {
          // Não é JSON válido, logar como texto
          console.warn('[ESP32Context] JSON inválido:', line, e);
          addLog('received', line);
        }
      } else if (line.trim()) {
        // Linha de texto normal
        addLog('received', line);
      }
    });

    // Listener para mudanças de conexão Serial
    const unsubscribeConnection = esp32Serial.onConnectionChange((connected: boolean) => {
      // 🔧 FIX: Sincronizar estado com esp32CommunicationService
      // Isso garante que sendCommand() funcione quando conexão foi feita via esp32Serial
      esp32Service.syncExternalUSBConnection(connected);

      if (connected) {
        addLog('info', '✅ Connected USB Serial');
        // Usar updateConnectionStatus para também persistir no Firestore
        updateConnectionStatus({ connected: true, type: 'usb', deviceName: 'USB Serial' });
        systemLogService.info('serial', 'Conexão USB Serial estabelecida');
      } else {
        addLog('info', '🔌 Disconnected');
        updateConnectionStatus({ connected: false, type: 'none' });
        systemLogService.warn('serial', 'Conexão USB Serial perdida');
      }
    });

    // Verificar conexão inicial
    const initialStatus = esp32Service.getConnectionStatus();
    // PR1: Sincronizar connectionOrder das settings com o serviço
    const savedOrder = storeSettings?.esp32ConnectionOrder;
    if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
      esp32Service.setConnectionOrder(savedOrder as import('@/services/esp32CommunicationService').ConnectionType[]);
    }
    esp32Service.activateConnectionSupervisor(autoReconnect);
    if (initialStatus.connected) {
      updateConnectionStatus(initialStatus);
    }

    return () => {
      if (typeof unsubConnectionChange === 'function') unsubConnectionChange();
      unsubSupervisor();
      if (typeof unsubBleData === 'function') unsubBleData();
      if (typeof unsubUsbData === 'function') unsubUsbData();
      unsubscribeMessage();
      unsubscribeRaw();
      unsubscribeConnection();

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [updateConnectionStatus, handleESP32Response, addLog, autoReconnect, toast]);

  // ============================================
  // MÉTODOS DE CONEXÃO
  // ============================================

  // 🆕 POLLING DE STATUS WiFi DURANTE DISPENSAÇÃO
  // Quando conectado via WiFi, fazer polling de /status para obter progresso
  useEffect(() => {
    if (!isDispensing || status.type !== 'wifi' || !status.connected) {
      return;
    }

    console.log('[ESP32Context] 📶 Iniciando polling WiFi durante dispensação...');

    const pollInterval = setInterval(async () => {
      try {
        // Buscar status via HTTP GET /status (usando IP configurável)
        const wifiIP = getESP32WiFiIP();
        const response = await fetch(`http://${wifiIP}/status`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[ESP32Context] 📶 Polling WiFi resposta:', data);

          // Processar resposta como se viesse de USB/BLE
          handleESP32Response(data);
        } else {
          console.warn('[ESP32Context] 📶 Polling WiFi falhou:', response.status);
        }
      } catch (error) {
        console.warn('[ESP32Context] 📶 Erro no polling WiFi:', error);
      }
    }, 500); // Polling a cada 500ms para feedback em tempo real

    return () => {
      console.log('[ESP32Context] 📶 Parando polling WiFi');
      clearInterval(pollInterval);
    };
  }, [isDispensing, status.type, status.connected, handleESP32Response]);

  // Reconcile failed dispenses on startup
  useEffect(() => {
    reconcileOnStartup()
      .then(() => console.log('[ESP32Context] Dispense reconciliation completed'))
      .catch(err => console.error('[ESP32Context] Dispense reconciliation error:', err));
  }, []);

  // Em foreground, forçar tentativa rápida de reconexão para Android/BLE após background/lock
  useEffect(() => {
    if (!autoReconnect) return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const currentStatus = esp32Service.getConnectionStatus();
      if (!currentStatus.connected) {
        void esp32Service.reconnectNow('app_foreground_resume');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [autoReconnect]);

  // Cleanup all timer refs on unmount
  useEffect(() => {
    return () => {
      if (dispenseTimeoutRef.current) {
        clearTimeout(dispenseTimeoutRef.current);
        dispenseTimeoutRef.current = null;
      }
      // 🔒 FIX Bug-25: Also clean up disconnectGraceTimerRef and applyTimeoutRef
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      if (applyTimeoutRef.current) {
        clearTimeout(applyTimeoutRef.current);
        applyTimeoutRef.current = null;
      }
    };
  }, []);

  const connect = useCallback(async (device: ESP32Device): Promise<boolean> => {
    setIsConnecting(true);
    setLastError(null);

    try {
      let success = false;

      switch (device.type) {
        case 'usb':
          // 🔧 FIX: connectUSB() agora detecta plataforma internamente
          success = await esp32Service.connectUSB();
          break;
        case 'wifi':
          if (device.ipAddress) {
            success = await esp32Service.connectWifi(device.ipAddress);
          }
          break;
        case 'bluetooth':
          success = await esp32Service.connectBluetooth(device.id);
          break;
      }

      if (success) {
        toast({
          title: 'ESP32 Conectado',
          description: `Conectado via ${device.type.toUpperCase()}`,
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão';
      setLastError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const connectUSB = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setLastError(null);

    try {
      // 🔧 FIX C1: connectUSB() agora é o único ponto de conexão USB.
      // Na Web, ele delega internamente para esp32SerialService.connect().
      // No Android, ele delega para connectUSBNative().
      // NÃO chamar esp32Serial.connect() separadamente (dupla invocação).
      const success = await esp32Service.connectUSB();

      if (success) {
        toast({
          title: 'ESP32 Conectado',
          description: 'Conectado via USB Serial',
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão USB';
      setLastError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const connectWifi = useCallback(async (ip: string): Promise<boolean> => {
    setIsConnecting(true);
    setLastError(null);

    try {
      const success = await esp32Service.connectWifi(ip);

      if (success) {
        toast({
          title: 'ESP32 Conectado',
          description: `Conectado via WiFi (${ip})`,
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão WiFi';
      setLastError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      // If dispense is in progress, persist failure before clearing state
      const activeProgress = currentProgressRef.current;
      if (activeProgress && activeProgress.orderId) {
        console.error('[ESP32Context] Disconnect during active dispense:', activeProgress.orderId);
        await persistFailedDispense(activeProgress.orderId, 'disconnect_during_dispense', {
          mlDispensed: activeProgress.ml,
          targetMl: activeProgress.targetMl,
          cup: activeProgress.cup,
          totalCups: activeProgress.totalCups,
          tapId: activeProgress.tapId,
        });
        if (dispenseTimeoutRef.current) {
          clearTimeout(dispenseTimeoutRef.current);
          dispenseTimeoutRef.current = null;
        }
      }

      // KIO-13 fix: esp32Service.disconnect() already closes USB/BLE/Serial internally;
      // calling esp32Serial.disconnect() separately caused double-close race conditions.
      await esp32Service.disconnect();

      updateConnectionStatus({ connected: false, type: 'none' });
      setIsDispensing(false);
      setCurrentProgress(null);
      currentProgressRef.current = null;

      toast({
        title: 'Desconectado',
        description: 'ESP32 desconectado',
      });
    } catch (error) {
      console.error('[ESP32Context] Erro ao desconectar:', error);
    }
  }, [toast]);

  const reconnectNow = useCallback(async (reason: string = 'context_manual_reconnect'): Promise<boolean> => {
    addLog('info', `🔄 Reconnect solicitado (${reason})`);
    return esp32Service.reconnectNow(reason);
  }, [addLog]);

  // ============================================
  // MÉTODOS DE COMANDO
  // ============================================

  const sendCommand = useCallback(async (command: string, data?: object): Promise<boolean> => {
    return esp32Service.sendCommand(command, data);
  }, []);

  const releaseDrink = useCallback(async (
    orderId: string,
    mlPerUnit: number,
    quantity: number = 1,
    sizeLabel: string = 'Padrão',
    tapId: number = selectedTapId  // 🆕 Multi-Tap: usa tap selecionado por padrão
  ): Promise<boolean> => {
    // Concurrency guard - prevent double dispense
    if (isReleasingRef.current) {
      console.warn('[ESP32Context] releaseDrink already in progress, ignoring');
      return false;
    }
    isReleasingRef.current = true;

    try {
    console.log('[ESP32Context] releaseDrink chamado:', { orderId, mlPerUnit, quantity, sizeLabel, tapId });
    console.log('[ESP32Context] Status atual:', status);

    // 🆕 CORREÇÃO: Verificar conexão baseada no tipo atual (não apenas USB Serial)
    if (!status.connected) {
      console.log('[ESP32Context] Não conectado, tentando reconexão automática...');
      addLog('info', '🔄 Tentando reconectar para dispensar...');

      // Tentar reconexão via protocolo atual ou auto-reconexão
      let reconnected = false;

      // No Web, tentar USB Serial
      if (!Capacitor.isNativePlatform()) {
        reconnected = await esp32Serial.tryAutoReconnect();
      } else {
        // No Android, tentar reconectar via serviço (que usa último tipo conhecido)
        try {
          const lastConnection = esp32Service.getLastConnection();
          if (lastConnection) {
            reconnected = await esp32Service.connect({
              id: lastConnection.deviceId || 'auto',
              name: lastConnection.deviceName || 'ESP32',
              type: lastConnection.type,
              ipAddress: lastConnection.ipAddress,
            });
          }
        } catch (e) {
          console.error('[ESP32Context] Erro ao tentar reconectar:', e);
        }
      }

      if (!reconnected) {
        console.error('[ESP32Context] Falha na reconexão automática');
        addLog('error', '❌ Falha na reconexão - ESP32 não conectado');
        toast({
          title: '❌ ESP32 Desconectado',
          description: 'Conecte o ESP32 (USB, WiFi ou Bluetooth) antes de dispensar.',
          variant: 'destructive',
        });
        return false;
      }

      console.log('[ESP32Context] ✅ Reconexão automática bem-sucedida');
      addLog('info', '✅ Reconectado automaticamente');

      // Atualizar status após reconexão
      setStatus(esp32Service.getConnectionStatus());
    }

    // Verificar conexão real antes de dispensar (previne stale state BLE/USB)
    const isReallyConnected = await esp32Service.verifyConnection(3000);
    if (!isReallyConnected) {
      console.error('[ESP32Context] Verificação de conexão falhou (stale state?)');
      addLog('error', 'Conexão BLE/USB stale - verificação falhou');

      // Tentar reconectar uma vez
      const lastConn = esp32Service.getLastConnection();
      if (lastConn) {
        try {
          await esp32Service.connect({
            id: lastConn.deviceId || 'auto',
            name: lastConn.deviceName || 'ESP32',
            type: lastConn.type,
            ipAddress: lastConn.ipAddress,
          });
        } catch (e) {
          console.error('[ESP32Context] Reconexão após verify falhou:', e);
        }
      }

      // Verificar de novo após reconexão
      const retryConnected = await esp32Service.verifyConnection(3000);
      if (!retryConnected) {
        console.error('[ESP32Context] Verificação falhou mesmo após reconexão');
        addLog('error', '❌ ESP32 não respondeu ao ping - conexão perdida');
        toast({
          title: 'Conexão Instável',
          description: 'ESP32 não respondeu. Verifique a conexão.',
          variant: 'destructive',
        });
        return false;
      }
    }

    // Preparar UI para dispensação
    setIsDispensing(true);
    dispensingStartedAtRef.current = new Date(); // capture start time for ServingSession
    // 🔧 FIX: Sinalizar ao supervisor que dispense está ativo
    // Previne healthcheck pings durante dispensação — o ESP32 está ocupado com
    // solenóide/fluxo e pode não responder a pings, causando false disconnect
    esp32Service.setDispensingInProgress(true);
    const initialProgress: ESP32DispensingProgress = {
      orderId,
      cup: 1,
      totalCups: quantity,
      ml: 0,
      targetMl: mlPerUnit,
      percent: 0,
      flowStarted: false,
      elapsedSeconds: 0,
      remainingSeconds: 120,
      tapId,
    };
    setCurrentProgress(initialProgress);
    currentProgressRef.current = initialProgress;

    addLog('sent', `release_drink: ${orderId} (${mlPerUnit}ml x${quantity}) [Tap ${tapId}]`);

    try {
      // 🔒 FIX Bug-11: Mark as dispensing in Firestore BEFORE sending ESP32 command.
      // Prevents re-dispense of same orderId if browser crashes mid-dispense.
      await updateDispenseStatusWithRetry(orderId, 'dispensing');

      // 🆕 CORREÇÃO: Usar esp32Service.sendCommand que detecta automaticamente o tipo de conexão
      // Isso funciona para USB (Web Serial ou OTG nativo), WiFi e Bluetooth
      const success = await esp32Service.sendCommand('release_drink', {
        orderId,
        mlPerUnit,
        quantity,
        sizeLabel,
        tapId,
      });

      if (success) {
        console.log(`[ESP32Context] ✅ Comando de dispensação enviado via ${status.type} (Tap ${tapId})`);
        addLog('info', `✅ Comando enviado via ${status.type} (Tap ${tapId})`);
        systemLogService.info('dispense', `Dispense iniciado: ${orderId}`, {
          mlPerUnit, quantity, sizeLabel, tapId, connectionType: status.type,
        });

        // Iniciar timeout de segurança: se ESP32 não responder em 5min, marcar como falha
        if (dispenseTimeoutRef.current) {
          clearTimeout(dispenseTimeoutRef.current);
        }
        dispenseTimeoutRef.current = setTimeout(async () => {
          const progressSnap = currentProgressRef.current;
          if (progressSnap && progressSnap.orderId === orderId) {
            console.error(`[ESP32Context] Dispense timeout para ${orderId} - sem resposta do ESP32`);
            addLog('error', `Timeout: ESP32 não respondeu para ${orderId}`);
            systemLogService.error('dispense', `Timeout dispense: ${orderId}`, {
              elapsedMs: DISPENSE_TIMEOUT_MS, ml: progressSnap?.ml, targetMl: progressSnap?.targetMl,
            });

            // 🔧 FIX: Enviar comando stop ao ESP32 para fechar a solenoide
            try {
              await esp32Service.sendCommand('stop', {});
              addLog('sent', `stop (timeout safety) para ${orderId}`);
            } catch (e) {
              console.error('[ESP32Context] Falha ao enviar stop no timeout:', e);
            }

            await updateDispenseStatusWithRetry(orderId, 'failed_dispense');
            await persistFailedDispense(orderId, 'timeout', {
              mlDispensed: progressSnap?.ml,
              targetMl: progressSnap?.targetMl,
              cup: progressSnap?.cup,
              totalCups: progressSnap?.totalCups,
              tapId: progressSnap?.tapId,
            });
            esp32Service.setDispensingInProgress(false);
            setIsDispensing(false);
            setCurrentProgress(null);
            currentProgressRef.current = null;
          }
        }, DISPENSE_TIMEOUT_MS);
      } else {
        console.error('[ESP32Context] ❌ Falha ao enviar comando de dispensação');
        addLog('error', '❌ Falha ao enviar comando');
        await persistFailedDispense(orderId, 'command_failed', {
          mlDispensed: 0,
          targetMl: mlPerUnit,
          cup: 1,
          totalCups: quantity,
          tapId,
        });
        esp32Service.setDispensingInProgress(false);
        setIsDispensing(false);
        setCurrentProgress(null);
      }

      return success;
    } catch (error) {
      console.error('[ESP32Context] Erro ao dispensar:', error);
      addLog('error', `Erro: ${error instanceof Error ? error.message : 'Desconhecido'}`);
      await persistFailedDispense(orderId, 'exception', {
        mlDispensed: currentProgressRef.current?.ml ?? 0,
        targetMl: mlPerUnit,
        cup: currentProgressRef.current?.cup ?? 1,
        totalCups: quantity,
        tapId,
      });
      esp32Service.setDispensingInProgress(false);
      setIsDispensing(false);
      setCurrentProgress(null);
      return false;
    }
    } finally {
      isReleasingRef.current = false;
    }
  }, [status, selectedTapId, addLog, toast, DISPENSE_TIMEOUT_MS]);

  const ping = useCallback(async (): Promise<boolean> => {
    return esp32Service.ping();
  }, []);

  const testValve = useCallback(async (durationMs: number = 1000, tapId: number = selectedTapId): Promise<boolean> => {
    // Defense-in-depth: clamp duration to [500, 10000]ms regardless of caller
    const clampedMs = Math.min(10000, Math.max(500, durationMs));
    if (clampedMs !== durationMs) {
      console.warn(`[ESP32Context] testValve duration clamped: ${durationMs}ms → ${clampedMs}ms`);
    }
    // 🆕 Multi-Tap: Enviar test_valve com tapId
    addLog('sent', `test_valve: ${clampedMs}ms [Tap ${tapId}]`);

    // 🆕 CORREÇÃO: Usar sendCommand unificado que detecta automaticamente o tipo de conexão
    return esp32Service.sendCommand('test_valve', { duration: clampedMs, tapId });
  }, [selectedTapId, addLog]);

  const stopDispensing = useCallback(async (tapId?: number): Promise<boolean> => {
    // 🆕 Multi-Tap: Enviar stop com tapId opcional
    addLog('sent', tapId !== undefined ? `stop [Tap ${tapId}]` : 'stop [All Taps]');

    // 🆕 CORREÇÃO: Usar sendCommand unificado
    const params = tapId !== undefined ? { tapId } : {};
    await esp32Service.sendCommand('stop', params);

    setIsDispensing(false);
    setCurrentProgress(null);
    return true;
  }, [addLog]);

  const getSettingsCmd = useCallback(async (): Promise<boolean> => {
    return esp32Service.getSettings();
  }, []);

  const saveCalibration = useCallback(async (
    pulsosPorLitro: number,
    mlPorSegundo: number,
    tapId: number = selectedTapId  // 🆕 Multi-Tap
  ): Promise<boolean> => {
    addLog('sent', `save_calibration: ${pulsosPorLitro} pulsos/L, ${mlPorSegundo} ml/s [Tap ${tapId}]`);
    return esp32Service.saveCalibration(pulsosPorLitro, mlPorSegundo, tapId);
  }, [selectedTapId, addLog]);

  // ============================================
  // 🆕 FUNÇÕES MULTI-TAP
  // ============================================

  const getTapStatus = useCallback((tapId: number): TapStatus | undefined => {
    return taps.find(t => t.id === tapId);
  }, [taps]);

  const refreshTaps = useCallback(async (): Promise<void> => {
    // Buscar status de todas as torneiras via comando get_taps ou HTTP /taps
    try {
      // 🔧 FIX: Usar sendCommand unificado que funciona em todos os protocolos
      // Ao invés de fetch hardcoded que só funciona em WiFi
      const success = await esp32Service.sendCommand('get_taps');
      if (!success) {
        console.warn('[ESP32Context] Falha ao enviar comando get_taps');
      }
      // A resposta virá via callback handleESP32Response
    } catch (error) {
      console.warn('[ESP32Context] Erro ao buscar taps:', error);
    }
  }, []);

  // ============================================
  // GERENCIAMENTO DE LISTENERS
  // ============================================

  const addResponseListener = useCallback((callback: (response: ESP32Response) => void): () => void => {
    responseListeners.current.add(callback);
    return () => {
      responseListeners.current.delete(callback);
    };
  }, []);

  // ============================================
  // VALOR DO CONTEXTO
  // ============================================

  const value: ESP32ContextValue = {
    // Estado
    status,
    supervisorStatus,
    isConnecting,
    lastError,
    isDispensing,
    currentProgress,
    settings,

    // 🆕 Multi-Tap
    numTaps,
    taps,
    selectedTapId,

    // Métodos de conexão
    connect,
    connectUSB,
    connectWifi,
    disconnect,
    reconnectNow,
    refreshConnectionStatus,

    // Comandos
    sendCommand,
    releaseDrink,
    ping,
    testValve,
    stopDispensing,
    getSettings: getSettingsCmd,
    saveCalibration,

    // 🆕 Multi-Tap methods
    setSelectedTapId,
    getTapStatus,
    refreshTaps,

    // Listeners
    addResponseListener,

    // Logs
    logs,
    addLog,
    clearLogs,
  };

  return (
    <ESP32Context.Provider value={value}>
      {children}
    </ESP32Context.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useESP32 = (): ESP32ContextValue => {
  const context = useContext(ESP32Context);

  if (!context) {
    throw new Error('useESP32 deve ser usado dentro de um ESP32Provider');
  }

  return context;
};

export default ESP32Context;
