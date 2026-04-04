/**
 * DrinkPickupScreen - Tela de retirada de bebida com feedback em tempo real
 * 
 * Este componente mostra o progresso da dispensação em tempo real,
 * consumindo dados diretamente do ESP32 via useESP32() hook.
 * 
 * Fluxo com torneira italiana manual:
 * 1. Aguardando: Usuário posiciona copo e abre torneira (contador regressivo)
 * 2. Dispensando: Animação do copo enchendo + volume em tempo real
 * 3. Concluído: Sucesso + som de confirmação + fechamento automático
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle, Beer } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { Product } from "@/types/product";
import { useEffect, useState, useCallback, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/i18n";
import { useESP32 } from "@/context/ESP32Context";
import { CupFillAnimation } from "@/components/CupFillAnimation";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { systemLogService } from "@/services/systemLogService";
import { salesService } from "@/services/salesService";
import { RankingOptIn } from "@/components/checkout/RankingOptIn";
import { buildFingerprints, findCustomerByFingerprint } from "@/utils/knownCustomers";
import { useAudioVoice } from "@/hooks/useAudioVoice";

interface DrinkPickupScreenProps {
  isOpen: boolean;
  orderNumber: string;
  drinkData: {
    product: Product;
    sizeLabel: string;
    mlPerUnit: number;
    quantity: number;
    price: number;
    totalAmount: number;
  } | null;
  /** Enrichment data from payment for ranking opt-in fingerprinting */
  enrichData?: {
    customerName?: string;
    customerIdentification?: string;
    payerId?: string;
    cardFirstDigits?: string;
    cardLastDigits?: string;
  } | null;
  /** Store ID for ranking opt-in Firestore write */
  storeId?: string;
  /** Timeout em segundos (sobrescreve configuração do admin) */
  timeoutSeconds?: number;
  onComplete: () => void;
  onTimeout?: () => void;
}

type DispenseState = 'waiting' | 'dispensing' | 'completed' | 'error';

// Constantes de configuração padrão
const DEFAULT_PICKUP_TIMEOUT_SECONDS = 90;
const DEFAULT_SOUND_ENABLED = true;
const AUTO_CLOSE_DELAY_SECONDS = 5;

const DrinkPickupScreen = ({ 
  isOpen, 
  orderNumber, 
  drinkData, 
  enrichData,
  storeId,
  timeoutSeconds,
  onComplete,
  onTimeout 
}: DrinkPickupScreenProps) => {
  const { currentCurrency } = useSettings();
  const { settings } = useStoreSettings();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentProgress, isDispensing, addResponseListener, selectedTapId } = useESP32();
  
  // Configurações do admin (com fallback para defaults)
  const pickupTimeout = timeoutSeconds ?? settings?.drinkPickupTimeoutSeconds ?? DEFAULT_PICKUP_TIMEOUT_SECONDS;
  const soundEnabled = settings?.drinkPickupSoundEnabled ?? DEFAULT_SOUND_ENABLED;

  const { playGuarded, playGuardedDelayed, clearScope } = useAudioVoice(soundEnabled);
  const pickupScopeRef = useRef('');
  
  // Estado local
  const [dispenseState, setDispenseState] = useState<DispenseState>('waiting');
  const [pickupCountdown, setPickupCountdown] = useState(pickupTimeout);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState(AUTO_CLOSE_DELAY_SECONDS);
  const [currentCupDisplay, setCurrentCupDisplay] = useState(1);
  const [totalCupsDisplay, setTotalCupsDisplay] = useState(1);
  const [showRanking, setShowRanking] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTriggeredRef = useRef(false);
  const lastCupCompletedRef = useRef(0);
  const currentProgressRef = useRef(currentProgress);
  const onCompleteRef = useRef(onComplete);
  const onTimeoutRef = useRef(onTimeout);

  // Manter refs atualizadas
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onTimeoutRef.current = onTimeout;
  }, [onComplete, onTimeout]);

  // 🔧 FIX Bug #26: Cancelar autoCloseTimer no unmount do componente.
  // Sem isso, se o parent desmontar DrinkPickupScreen (navegação ou React StrictMode),
  // o setTimeout ainda está vivo e chama onCompleteRef.current() sobre componente desmontado.
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, []);

  // ============================================
  // VOZ — ABRIR / FECHAR TELA
  // ============================================

  useEffect(() => {
    if (isOpen && orderNumber) {
      pickupScopeRef.current = `pickup-${orderNumber}`;
      playGuarded('place_cup', pickupScopeRef.current);
      playGuardedDelayed(4000, 'how_to_pour_full', pickupScopeRef.current);
    }
    if (!isOpen) {
      clearScope(pickupScopeRef.current);
      pickupScopeRef.current = '';
    }
   
  }, [isOpen, orderNumber]);

  // Start flow hint após 20 s em estado waiting
  // (garante que place_cup + how_to_pour_full (~4s+14s) terminaram antes)
  useEffect(() => {
    if (!isOpen || dispenseState !== 'waiting') return;
    const stateSnapshot = dispenseState;
    const timer = setTimeout(() => {
      if (stateSnapshot === 'waiting') {
        playGuarded('start_flow_hint', pickupScopeRef.current);
      }
    }, 20000);
    return () => clearTimeout(timer);
   
  }, [isOpen, dispenseState]);

  // ============================================
  // FEEDBACK SONORO (SEM VIBRAÇÃO)
  // ============================================
  
  const playCompletionSound = useCallback(() => {
    // Verificar se som está habilitado nas configurações
    if (!soundEnabled) {
      console.log('[DrinkPickupScreen] Som desabilitado nas configurações');
      return;
    }
    
    // Som de sucesso (usando Web Audio API)
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Melodia de sucesso: C5 -> E5 -> G5 (acorde maior)
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3); // G5
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log('[DrinkPickupScreen] Não foi possível reproduzir som:', e);
    }
  }, [soundEnabled]);

  // Manter ref atualizada com currentProgress
  useEffect(() => {
    currentProgressRef.current = currentProgress;
  }, [currentProgress]);

  // ============================================
  // SINCRONIZAR ESTADO COM ESP32
  // ============================================
  
  useEffect(() => {
    if (!isOpen) {
      // Reset quando fechar
      setDispenseState('waiting');
      setPickupCountdown(pickupTimeout);
      setAutoCloseCountdown(AUTO_CLOSE_DELAY_SECONDS);
      setCurrentCupDisplay(1);
      setTotalCupsDisplay(1);
      setShowRanking(false);
      completionTriggeredRef.current = false;
      lastCupCompletedRef.current = 0;
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      return;
    }

    // Listener para eventos de status do ESP32
    const unsubscribe = addResponseListener((response) => {
      // 🔒 Multi-Tablet: Defesa em profundidade — ignorar respostas de outro tap
      if (response.tapId !== undefined && response.tapId !== selectedTapId) {
        console.debug(`[DrinkPickupScreen] Ignorando resposta de tap ${response.tapId} (local: ${selectedTapId})`);
        return;
      }
      console.log('[DrinkPickupScreen] Evento recebido:', response.type, response.type === 'status' ? response.stage : `${response.percent ?? 0}%`);
      
      if (response.type === 'status') {
        // Copo individual concluído - mostrar toast
        if (response.stage === 'cup_complete') {
          const progress = currentProgressRef.current;
          const cupNum = progress?.cup ?? 1;
          const totalCups = progress?.totalCups ?? 1;
          
          // Evitar toast duplicado para o mesmo copo
          if (cupNum !== lastCupCompletedRef.current) {
            lastCupCompletedRef.current = cupNum;
            
            toast({
              title: `✅ ${t('drinkPickup.cupCompleteTitle', { cup: cupNum })}`,
              description: t('drinkPickup.cupCompleteDesc', { next: cupNum + 1, total: totalCups }),
            });

            playGuarded('cup_complete', `${pickupScopeRef.current}-cup-${cupNum}`);
          }
        }
        
        // Aguardando próximo copo - voltar para estado waiting
        if (response.stage === 'waiting_next') {
          setDispenseState('waiting');
          // Resetar countdown para o próximo copo (evita timeout imediato)
          setPickupCountdown(pickupTimeout);
          // NÃO incrementar manualmente aqui - o useEffect de currentProgress
          // vai atualizar currentCupDisplay quando receber o próximo progress do ESP32
          const nextCupNum = currentProgressRef.current?.cup ?? 1;
          playGuarded('next_cup', `${pickupScopeRef.current}-next-${nextCupNum}`);
        }
        
        // Todos os copos concluídos
        if (response.stage === 'completed' && !completionTriggeredRef.current) {
          console.log('[DrinkPickupScreen] ✅ Pedido CONCLUÍDO! Ativando fechamento automático...');
          completionTriggeredRef.current = true;
          setDispenseState('completed');
          playCompletionSound();
          playGuarded('done', pickupScopeRef.current);
          
          // Verificar se devemos mostrar ranking opt-in
          const shouldShowRanking = (() => {
            if (!enrichData || !storeId) return false;
            const name = enrichData.customerName || '';
            // Se já temos nome real (não "Cervejeiro #xxx"), pular ranking
            if (name && !name.startsWith('Cervejeiro')) return false;
            // Verificar se há dados para fingerprinting
            const fps = buildFingerprints({
              cpf: enrichData.customerIdentification,
              payerId: enrichData.payerId,
              cardFirstDigits: enrichData.cardFirstDigits,
              cardLastDigits: enrichData.cardLastDigits,
            });
            if (fps.length === 0) return false;
            // Se cliente já é reconhecido (já participou do ranking antes),
            // auto-enrich com dados salvos e pular formulário
            const recognized = findCustomerByFingerprint(fps);
            if (recognized) {
              console.log('[DrinkPickupScreen] 🔁 Cliente reconhecido:', recognized.name, '- auto-enrich sem formulário');
              // Fire-and-forget: gravar nome/CPF do cliente reconhecido no pedido
              salesService.enrichOrderWithCustomerData(
                orderNumber,
                {
                  customerName: recognized.name,
                  customerIdentification: recognized.cpf || undefined,
                },
                storeId!,
              ).catch(err => console.warn('[DrinkPickupScreen] Auto-enrich falhou (não-bloqueante):', err));
              return false; // Não mostrar form
            }
            return true; // Cliente novo — mostrar form
          })();
          
          if (shouldShowRanking) {
            console.log('[DrinkPickupScreen] 🏆 Mostrando ranking opt-in...');
            setShowRanking(true);
            // NÃO iniciar auto-close: esperar ranking done/skip
          } else {
            // Auto-fechar após countdown - usar ref para evitar dependência
            autoCloseTimerRef.current = setTimeout(() => {
              console.log('[DrinkPickupScreen] Auto-fechando modal...');
              onCompleteRef.current();
            }, AUTO_CLOSE_DELAY_SECONDS * 1000);
          }
        } else if (response.stage === 'error') {
          setDispenseState('error');
          systemLogService.error('dispense', `ESP32 erro durante dispense: ${orderNumber}`, { orderNumber });
          playGuarded('dispense_error', pickupScopeRef.current);
        }
      }
    });

    return () => {
      unsubscribe();
      // NÃO cancelar o timer de auto-close aqui - ele deve continuar rodando
    };
  }, [isOpen, addResponseListener, playCompletionSound, toast, t, selectedTapId]);

  // ============================================
  // AUTO-CLOSE NO ESTADO DE ERRO (safety net)
  // ============================================
  // Garante que o modal nunca fique congelado se o estado de erro for atingido.
  // Sem isso, disabled={dispenseState !== 'completed'} + ausência de onError handler
  // bloqueia a tela permanentemente (F1 + F2 juntos = freeze eterno confirmado em logcat).
  useEffect(() => {
    if (!isOpen || dispenseState !== 'error') return;

    const timer = setTimeout(() => {
      systemLogService.warn('dispense', `Auto-fechando tela de erro após timeout: ${orderNumber}`, { orderNumber });
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      } else {
        onCompleteRef.current();
      }
    }, 60_000); // 60s de safety net — dá tempo para atendente agir antes de fechar sozinho

    return () => clearTimeout(timer);
     
  }, [isOpen, dispenseState]);

  // ============================================
  // ATUALIZAR ESTADO BASEADO NO PROGRESSO
  // ============================================
  
  useEffect(() => {
    if (!isOpen || !currentProgress) return;

    if (currentProgress.flowStarted) {
      setDispenseState('dispensing');
    } else if (isDispensing) {
      setDispenseState('waiting');
    }
    
    // Manter display de copo sincronizado
    if (currentProgress.cup) {
      setCurrentCupDisplay(currentProgress.cup);
    }
    if (currentProgress.totalCups) {
      setTotalCupsDisplay(currentProgress.totalCups);
    }
  }, [isOpen, currentProgress, isDispensing]);

  // ============================================
  // CONTADOR REGRESSIVO - FASE AGUARDANDO
  // ============================================
  
  useEffect(() => {
    if (!isOpen || dispenseState !== 'waiting') return;
    
    const interval = setInterval(() => {
      setPickupCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Timeout: usuário não iniciou o fluxo a tempo
          systemLogService.warn('dispense', `Pickup timeout: ${orderNumber}`, { orderNumber, timeoutSeconds: pickupTimeout });          playGuarded('pickup_timeout', pickupScopeRef.current);          if (onTimeoutRef.current) {
            onTimeoutRef.current();
          } else {
            onCompleteRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
   
  }, [isOpen, dispenseState]); // onTimeout/onComplete acessados via ref — não precisam de dep

  // ============================================
  // CONTADOR REGRESSIVO - FASE CONCLUÍDO
  // ============================================
  
  useEffect(() => {
    // Não iniciar countdown enquanto ranking está sendo exibido
    if (dispenseState !== 'completed' || showRanking) return;
    
    const interval = setInterval(() => {
      setAutoCloseCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [dispenseState, showRanking]);

  // ============================================
  // RANKING OPT-IN HANDLERS
  // ============================================

  const handleRankingDone = useCallback(() => {
    console.log('[DrinkPickupScreen] 🏆 Ranking opt-in concluído!');
    setShowRanking(false);
    setAutoCloseCountdown(AUTO_CLOSE_DELAY_SECONDS);
    // Iniciar auto-close após ranking
    autoCloseTimerRef.current = setTimeout(() => {
      console.log('[DrinkPickupScreen] Auto-fechando modal após ranking...');
      onCompleteRef.current();
    }, AUTO_CLOSE_DELAY_SECONDS * 1000);
  }, []);

  const handleRankingSkip = useCallback(() => {
    console.log('[DrinkPickupScreen] ⏭️ Ranking opt-in pulado');
    setShowRanking(false);
    setAutoCloseCountdown(AUTO_CLOSE_DELAY_SECONDS);
    // Iniciar auto-close após skip
    autoCloseTimerRef.current = setTimeout(() => {
      console.log('[DrinkPickupScreen] Auto-fechando modal após skip...');
      onCompleteRef.current();
    }, AUTO_CLOSE_DELAY_SECONDS * 1000);
  }, []);

  // Dados computados para ranking (memoized)
  const rankingFingerprints = enrichData ? buildFingerprints({
    cpf: enrichData.customerIdentification,
    payerId: enrichData.payerId,
    cardFirstDigits: enrichData.cardFirstDigits,
    cardLastDigits: enrichData.cardLastDigits,
  }) : [];
  const rankingRecognizedCustomer = rankingFingerprints.length > 0 ? findCustomerByFingerprint(rankingFingerprints) : null;

  if (!drinkData) return null;

  // ============================================
  // VALORES DE EXIBIÇÃO
  // ============================================
  
  const displayMl = currentProgress?.ml ?? 0;
  const displayTargetMl = currentProgress?.targetMl ?? drinkData.mlPerUnit;
  const displayPercent = currentProgress?.percent ?? 0;
  const displayTotalCups = totalCupsDisplay > 1 ? totalCupsDisplay : drinkData.quantity;
  // Validar para nunca mostrar "6 de 5" - sempre respeitar o limite máximo
  const displayCup = Math.min(currentCupDisplay, displayTotalCups);
  const elapsedSeconds = currentProgress?.elapsedSeconds ?? 0;

  const isUrgent = pickupCountdown <= 30;
  const isMultipleCups = displayTotalCups > 1;

  // ============================================
  // RENDER
  // ============================================

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && dispenseState === 'completed' && onComplete()}>
      <DialogContent
        className="w-full sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby="drink-pickup-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xl">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
              {dispenseState === 'completed' 
                ? t('drinkPickup.complete')
                : t('drinkPickup.drinkReady')}
            </div>
            
            <div className="flex items-center gap-2">
              {/* 🆕 Multi-Tap: Indicador de torneira */}
              {currentProgress?.tapId !== undefined && dispenseState !== 'completed' && (
                <div className="flex items-center gap-1.5 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
                  <span className="font-bold text-sm">
                    🚰 {t('drinkPickup.tapIndicator', { tap: (currentProgress.tapId + 1) })}
                  </span>
                </div>
              )}
              
              {/* Indicador de copo proeminente */}
              {isMultipleCups && dispenseState !== 'completed' && (
                <div className="flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full">
                  <Beer className="w-5 h-5" />
                  <span className="font-bold text-base">
                    {t('drinkPickup.cupIndicator', { current: displayCup, total: displayTotalCups })}
                  </span>
                </div>
              )}
            </div>
          </DialogTitle>
          <DialogDescription id="drink-pickup-description" className="sr-only">
            {t('drinkPickup.drinkReady')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {/* ========== ESTADO: AGUARDANDO FLUXO ========== */}
            {dispenseState === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-4"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <CupFillAnimation
                    percent={0}
                    ml={0}
                    targetMl={displayTargetMl}
                    flowStarted={false}
                    size="lg"
                  />
                </motion.div>
                
                {/* Instruções da torneira - Design moderno */}
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800">
                      {t('drinkPickup.positionCup')}
                    </p>
                    <p className="text-gray-600 mt-1">
                      {t('drinkPickup.waitingForFlow')}
                    </p>
                  </div>
                  
                  {/* Cards de instrução lado a lado */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Card Líquido */}
                    <div className="bg-gradient-to-b from-amber-50 to-amber-100/50 rounded-xl p-4 text-center shadow-sm">
                      <div className="text-3xl mb-2">🍺</div>
                      <p className="font-bold text-amber-800 text-sm">
                        {t('drinkPickup.instructionLiquid')}
                      </p>
                      <p className="text-amber-700 text-base font-semibold mt-1">
                        {t('drinkPickup.instructionLiquidDir')}
                      </p>
                    </div>
                    
                    {/* Card Creme/Espuma */}
                    <div className="bg-gradient-to-b from-orange-50 to-orange-100/50 rounded-xl p-4 text-center shadow-sm">
                      <div className="text-3xl mb-2">☁️</div>
                      <p className="font-bold text-orange-800 text-sm">
                        {t('drinkPickup.instructionFoam')}
                      </p>
                      <p className="text-orange-700 text-base font-semibold mt-1">
                        {t('drinkPickup.instructionFoamDir')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Contador regressivo */}
                <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${
                  isUrgent 
                    ? 'bg-red-100 text-red-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <Clock className="w-5 h-5" />
                  <span className="text-lg font-semibold">
                    {t('drinkPickup.closingIn', { seconds: pickupCountdown })}
                  </span>
                </div>
              </motion.div>
            )}

            {/* ========== ESTADO: DISPENSANDO ========== */}
            {dispenseState === 'dispensing' && (
              <motion.div
                key="dispensing"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-4"
              >
                <CupFillAnimation
                  percent={displayPercent}
                  ml={displayMl}
                  targetMl={displayTargetMl}
                  flowStarted={true}
                  size="xl"
                />
                
                <div className="rounded-xl p-5 bg-gradient-to-b from-blue-50 to-white shadow-sm">
                  <p className="text-4xl font-bold text-blue-600">
                    {t('drinkPickup.mlProgress', { current: displayMl, total: displayTargetMl })}
                  </p>
                  
                  <Progress 
                    value={displayPercent} 
                    className="mt-3 h-4" 
                  />
                </div>

                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">
                    {t('drinkPickup.elapsedSeconds', { seconds: elapsedSeconds })}
                  </span>
                </div>
              </motion.div>
            )}

            {/* ========== ESTADO: CONCLUÍDO ========== */}
            {dispenseState === 'completed' && (
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="text-center space-y-4"
              >
                {showRanking ? (
                  /* ---- Ranking Opt-In Form ---- */
                  <RankingOptIn
                    orderNumber={orderNumber}
                    storeId={storeId || ''}
                    fingerprints={rankingFingerprints}
                    recognizedCustomer={rankingRecognizedCustomer}
                    onDone={handleRankingDone}
                    onSkip={handleRankingSkip}
                    soundEnabled={soundEnabled}
                  />
                ) : (
                  /* ---- Tela de sucesso padrão ---- */
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ 
                        type: "spring",
                        stiffness: 260,
                        damping: 20
                      }}
                    >
                      <CheckCircle2 className="w-24 h-24 text-green-500 mx-auto" />
                    </motion.div>
                    
                    <div className="rounded-xl p-6 bg-gradient-to-b from-green-50 to-white shadow-sm">
                      <p className="text-2xl font-bold text-green-700">
                        {t('drinkPickup.enjoyDrink')}
                      </p>
                      <p className="text-green-600 mt-2">
                        {t('drinkPickup.mlDispensed', { ml: displayTargetMl })}
                      </p>
                    </div>

                    <p className="text-sm text-gray-500">
                      {t('drinkPickup.closingIn', { seconds: autoCloseCountdown })}
                    </p>
                  </>
                )}
              </motion.div>
            )}

            {/* ========== ESTADO: ERRO ========== */}
            {dispenseState === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-4"
              >
                <AlertCircle className="w-24 h-24 text-red-500 mx-auto" />
                
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                  <p className="text-xl font-bold text-red-700">
                    {t('drinkPickup.error')}
                  </p>
                  <p className="text-red-600 mt-2">
                    {t('drinkPickup.contactSupport')}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ========== INFO DO PEDIDO ========== */}
          <div className="bg-gray-50 border rounded-lg p-4 text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.order')}</span>
              <span className="font-semibold">#{orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.product')}</span>
              <span className="font-medium">{drinkData.product.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.size')}</span>
              <span className="font-medium">{drinkData.sizeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.quantity')}</span>
              <span className="font-medium">{drinkData.quantity} x {drinkData.mlPerUnit}ml</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('drinkPickup.total')}</span>
              <span className="font-semibold">
                {currentCurrency.symbol}
                {drinkData.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* ========== BOTÃO DE AÇÃO ========== */}
          <Button 
            className="w-full" 
            onClick={onComplete} 
            size="lg"
            variant={dispenseState === 'completed' ? 'default' : 'outline'}
            disabled={dispenseState === 'dispensing'}
          >
            {dispenseState === 'completed'
              ? t('drinkPickup.close')
              : t('drinkPickup.drinkPickedUp')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DrinkPickupScreen;
