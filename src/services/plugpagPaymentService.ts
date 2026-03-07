/**
 * ============================================================================
 * PlugPag Payment Service
 * ============================================================================
 *
 * Serviço de pagamento card-present via terminal PlugPag (Moderninha Pro 2, etc).
 * Gerencia o ciclo de vida completo: inicialização → conexão → pagamento → feedback.
 *
 * Arquitetura:
 *   - MAC do terminal vinculado ao tablet via localStorage (kiosk_plugpag_mac)
 *   - Referência MAC também em taps[].plugpagDeviceId para organização no admin
 *   - Auth Token configurado nas Functions (.env) — NÃO é necessário clientId
 *   - PIX dual-display: QR exibido no tablet E no terminal simultaneamente
 *
 * Segurança:
 *   - PAN/CVV nunca cruzam a bridge nativa (allowlist no plugin Java)
 *   - holderName é PII — mascarado antes de persistir
 *   - Apenas campos seguros são salvos no Firestore
 *
 * @version 1.0.0
 */

import {
  PlugPagTerminal,
  PlugPagEventCodes,
  type PlugPagPaymentOptions,
  type PlugPagPaymentResult,
  type PlugPagStatusResult,
  type PlugPagEventData,
  type PlugPagConnectionEvent,
  type PlugPagPaymentType,
} from '@/plugins/plugpagTerminal';
import type { PluginListenerHandle } from '@capacitor/core';
import { getPlugPagMac } from '@/components/TapSettingsSync';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Timeout for a payment operation (120s covers card insert + PIN + auth + print) */
const PAYMENT_TIMEOUT_MS = 120_000;

/** Max PlugPag payment retries before forcing full flow reset */
export const MAX_PLUGPAG_RETRIES = 3;

// ============================================================================
// TYPES
// ============================================================================

export type PlugPagTerminalState =
  | 'idle'               // Não inicializado
  | 'initializing'       // Inicializando SDK
  | 'disconnected'       // SDK pronto, sem conexão BT
  | 'connecting'         // Conectando ao terminal
  | 'connected'          // Conectado e pronto para transação
  | 'waiting_card'       // Aguardando inserção/aproximação do cartão
  | 'processing'         // Processando transação (PIN, autorização)
  | 'approved'           // Transação aprovada
  | 'rejected'           // Transação rejeitada
  | 'error';             // Erro genérico

export interface PlugPagPaymentRequest {
  /** Valor em centavos (ex: 1500 = R$15,00) */
  amountCents: number;
  /** Tipo: crédito, débito, voucher ou PIX */
  type: 'credit' | 'debit' | 'voucher' | 'pix';
  /** Parcelas (1 = à vista) */
  installments?: number;
  /** Referência do pedido (orderId para reconciliação, max 10 chars) */
  orderId?: string;
}

export interface PlugPagPaymentResponse {
  success: boolean;
  result?: PlugPagPaymentResult;
  error?: string;
}

export type PlugPagStateListener = (state: PlugPagTerminalState, message?: string) => void;

// ============================================================================
// SERVICE
// ============================================================================

class PlugPagPaymentService {
  private state: PlugPagTerminalState = 'idle';
  private listeners: Set<PlugPagStateListener> = new Set();
  private eventHandle: PluginListenerHandle | null = null;
  private connectionHandle: PluginListenerHandle | null = null;
  private connectedMac: string | null = null;

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  getState(): PlugPagTerminalState {
    return this.state;
  }

  private setState(newState: PlugPagTerminalState, message?: string): void {
    this.state = newState;
    console.log(`[PlugPagService] Estado: ${newState}${message ? ` — ${message}` : ''}`);
    this.listeners.forEach(fn => {
      try { fn(newState, message); } catch (e) { console.error('[PlugPagService] Listener error:', e); }
    });
  }

  onStateChange(listener: PlugPagStateListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getConnectedMac(): string | null {
    return this.connectedMac;
  }

  // --------------------------------------------------------------------------
  // Initialization & Connection
  // --------------------------------------------------------------------------

  /**
   * Inicializa o SDK PlugPag. Idempotente — chamadas subsequentes são no-op.
   */
  async initialize(): Promise<boolean> {
    if (this.state !== 'idle' && this.state !== 'error') {
      console.log('[PlugPagService] Já inicializado, estado:', this.state);
      return true;
    }

    this.setState('initializing');

    try {
      // Solicitar permissões Bluetooth
      const permResult = await PlugPagTerminal.requestPermissions();
      if (!permResult.granted) {
        this.setState('error', 'Permissões Bluetooth negadas');
        return false;
      }

      // Inicializar SDK
      const initResult = await PlugPagTerminal.initialize({
        appName: 'OpenKiosk',
        appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
      });

      if (!initResult.initialized) {
        this.setState('error', 'Falha ao inicializar SDK PlugPag');
        return false;
      }

      // Registrar listeners de eventos
      await this.setupEventListeners();

      this.setState('disconnected');
      return true;
    } catch (error: any) {
      this.setState('error', error?.message || 'Erro na inicialização');
      return false;
    }
  }

  /**
   * Conecta ao terminal PlugPag via Bluetooth Classic.
   * Usa o MAC salvo em localStorage (kiosk_plugpag_mac) se nenhum for fornecido.
   * Verifica autenticação (ativação) com PagBank e ativa automaticamente se necessário.
   */
  async connect(mac?: string, activationCode?: string): Promise<boolean> {
    const targetMac = mac || getPlugPagMac();
    if (!targetMac) {
      this.setState('error', 'Nenhum MAC de terminal configurado');
      return false;
    }

    // Se já conectado ao mesmo terminal, pular
    if (this.state === 'connected' && this.connectedMac === targetMac) {
      console.log('[PlugPagService] Já conectado ao terminal:', targetMac);
      return true;
    }

    // Garantir inicialização
    if (this.state === 'idle' || this.state === 'error') {
      const ok = await this.initialize();
      if (!ok) return false;
    }

    // PRIMEIRO: Conectar via Bluetooth ao terminal
    // Demo oficial PagSeguro exige initBTConnection() ANTES de qualquer operação (auth, pagamento, etc.)
    this.setState('connecting', `Conectando a ${targetMac}...`);

    try {
      const result = await PlugPagTerminal.connect({ deviceId: targetMac });
      if (!result.connected) {
        this.setState('disconnected', 'Falha na conexão Bluetooth');
        return false;
      }
      this.connectedMac = targetMac;
      console.log('[PlugPagService] ✅ BT conectado ao terminal:', targetMac);
    } catch (error: any) {
      this.setState('error', error?.message || 'Erro na conexão BT');
      return false;
    }

    // DEPOIS: Verificar e realizar ativação se necessário (precisa de BT ativo)
    try {
      const authResult = await PlugPagTerminal.isAuthenticated();
      if (!authResult.authenticated) {
        console.log('[PlugPagService] Terminal não autenticado, tentando ativação...');
        if (activationCode) {
          const activateResult = await PlugPagTerminal.requestAuthentication({ activationCode });
          if (!activateResult.authenticated) {
            this.setState('error', 'Falha na ativação do terminal — verifique o código de ativação');
            return false;
          }
          console.log('[PlugPagService] ✅ Terminal ativado com sucesso');
        } else {
          console.warn('[PlugPagService] ⚠️ Terminal não ativado e sem código de ativação — pagamentos podem falhar');
        }
      } else {
        console.log('[PlugPagService] ✅ Terminal já autenticado com PagBank');
      }
    } catch (e) {
      console.warn('[PlugPagService] Não foi possível verificar autenticação:', e);
    }

    this.setState('connected', `Conectado ao terminal ${targetMac}`);
    return true;
  }

  /**
   * Desconecta do terminal.
   */
  async disconnect(): Promise<void> {
    try {
      await PlugPagTerminal.disconnect();
    } catch (e) {
      console.warn('[PlugPagService] Erro ao desconectar:', e);
    }
    this.connectedMac = null;
    this.setState('disconnected');
  }

  // --------------------------------------------------------------------------
  // Payment
  // --------------------------------------------------------------------------

  /**
   * Inicia um pagamento card-present no terminal.
   *
   * Pre-condições:
   *   1. SDK inicializado
   *   2. Terminal conectado via Bluetooth
   *   3. Nenhuma transação em andamento
   *
   * Inclui:
   *   - Validação de conexão BT real via getStatus() (não apenas flag local)
   *   - Timeout de PAYMENT_TIMEOUT_MS para evitar trava se terminal congelar
   *   - Auto-abort no timeout para liberar o terminal
   */
  async startPayment(request: PlugPagPaymentRequest): Promise<PlugPagPaymentResponse> {
    // Garantir conexão (flag local)
    if (this.state !== 'connected') {
      const connected = await this.connect();
      if (!connected) {
        return { success: false, error: 'Terminal não conectado' };
      }
    }

    // Validar conexão BT real (não apenas flag local — BT pode ter caído)
    try {
      const status = await PlugPagTerminal.getStatus();
      if (!status.btConnected) {
        console.warn('[PlugPagService] BT caiu silenciosamente — tentando reconectar');
        this.connectedMac = null;
        this.setState('disconnected', 'Conexão BT perdida — reconectando...');
        const reconnected = await this.connect();
        if (!reconnected) {
          return { success: false, error: 'Conexão Bluetooth perdida. Reconexão falhou.' };
        }
      }
    } catch (e) {
      console.warn('[PlugPagService] getStatus falhou — continuando:', e);
    }

    this.setState('waiting_card', 'Insira ou aproxime o cartão');

    try {
      const options: PlugPagPaymentOptions = {
        amountCents: request.amountCents,
        type: request.type.toUpperCase() as PlugPagPaymentType,
        installments: request.installments || 1,
        userReference: request.orderId,
      };

      // Promise.race: pagamento vs timeout
      // Se o terminal travar, o timeout garante que o app não fica congelado
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Tempo esgotado: terminal não respondeu em 2 minutos'));
        }, PAYMENT_TIMEOUT_MS);
      });

      let result: PlugPagPaymentResult;
      try {
        result = await Promise.race([
          PlugPagTerminal.startPayment(options),
          timeoutPromise,
        ]);
      } catch (timeoutError: any) {
        // Timeout atingido — abortar pagamento no terminal
        if (timeoutId) clearTimeout(timeoutId);
        console.error('[PlugPagService] Timeout — abortando pagamento');
        await this.abortPayment();
        this.setState('error', 'Tempo esgotado');
        return { success: false, error: timeoutError?.message || 'Tempo esgotado' };
      }

      // Limpar timeout — pagamento retornou a tempo
      if (timeoutId) clearTimeout(timeoutId);

      if (result.approved) {
        this.setState('approved', result.message || 'Pagamento aprovado');
        // Voltar para connected após um breve delay
        setTimeout(() => {
          if (this.state === 'approved') this.setState('connected');
        }, 5000);
        return { success: true, result };
      } else {
        this.setState('rejected', result.message || 'Pagamento não aprovado');
        setTimeout(() => {
          if (this.state === 'rejected') this.setState('connected');
        }, 3000);
        return { success: false, result, error: result.message || 'Negado' };
      }
    } catch (error: any) {
      this.setState('error', error?.message || 'Erro no pagamento');
      // Tentar reconectar após erro
      setTimeout(() => { this.connect(); }, 2000);
      return { success: false, error: error?.message || 'Erro desconhecido' };
    }
  }

  /**
   * Aborta o pagamento em andamento.
   *
   * O abort roda em thread separada no Java (não enfileirado atrás do doPayment).
   * Se o abort falhar (ex: cartão já autorizando), retorna false e NÃO
   * altera o estado — o resultado final virá do doPayment em andamento.
   */
  async abortPayment(): Promise<boolean> {
    try {
      const result = await PlugPagTerminal.abortPayment();
      if (result.aborted) {
        this.setState('connected', 'Pagamento cancelado');
        return true;
      } else {
        // Abort falhou — transação pode estar em autorização e não pode ser cancelada.
        // NÃO alterar estado para 'connected' — deixar o doPayment terminar.
        console.warn('[PlugPagService] Abort retornou false — transação pode estar em autorização, aguardando resultado');
        return false;
      }
    } catch (error: any) {
      console.error('[PlugPagService] Erro ao abortar:', error);
      return false;
    }
  }

  /**
   * Estorno da última transação aprovada.
   */
  async voidLastPayment(): Promise<PlugPagPaymentResponse> {
    if (this.state !== 'connected') {
      return { success: false, error: 'Terminal não conectado' };
    }

    this.setState('processing', 'Processando estorno...');

    try {
      const result = await PlugPagTerminal.voidPayment({});
      if (result.approved) {
        this.setState('connected', 'Estorno aprovado');
        return { success: true, result };
      } else {
        this.setState('connected', 'Estorno negado');
        return { success: false, result, error: result.message || 'Estorno negado' };
      }
    } catch (error: any) {
      this.setState('error', error?.message || 'Erro no estorno');
      return { success: false, error: error?.message };
    }
  }

  // --------------------------------------------------------------------------
  // PIX Dual Display
  // --------------------------------------------------------------------------

  /**
   * Exibe QR Code PIX na tela do terminal (dual-display).
   * O tablet mostra o QR na tela capacitiva, e o terminal mostra na tela própria.
   */
  async displayPixQR(qrCodeText: string): Promise<boolean> {
    if (this.state !== 'connected') {
      console.warn('[PlugPagService] Não conectado — não é possível exibir QR no terminal');
      return false;
    }

    try {
      const result = await PlugPagTerminal.displayPixQR({ qrCodeText });
      return result.displayed;
    } catch (error: any) {
      console.error('[PlugPagService] Erro ao exibir QR no terminal:', error);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  /**
   * Consulta status atual do SDK/terminal.
   */
  async getStatus(): Promise<PlugPagStatusResult | null> {
    try {
      return await PlugPagTerminal.getStatus();
    } catch (e) {
      console.error('[PlugPagService] Erro ao obter status:', e);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Event Listeners (internal)
  // --------------------------------------------------------------------------

  private async setupEventListeners(): Promise<void> {
    // Limpar listeners anteriores
    await this.removeEventListeners();

    // Eventos do fluxo de pagamento (WAITING_CARD, PIN, AUTHORIZING, etc)
    this.eventHandle = await PlugPagTerminal.addListener('plugpagEvent', (data: PlugPagEventData) => {
      console.log(`[PlugPagService] Evento SDK: code=${data.eventCode}, msg=${data.message}`);

      switch (data.eventCode) {
        case PlugPagEventCodes.WAITING_CARD:
          this.setState('waiting_card', data.message || 'Insira ou aproxime o cartão');
          break;
        case PlugPagEventCodes.INSERTED_CARD:
          this.setState('processing', data.message || 'Cartão detectado...');
          break;
        case PlugPagEventCodes.PIN_REQUESTED:
          this.setState('processing', 'Digite a senha no terminal');
          break;
        case PlugPagEventCodes.PIN_OK:
          this.setState('processing', 'Senha validada');
          break;
        case PlugPagEventCodes.AUTHORIZING:
          this.setState('processing', data.message || 'Autorizando...');
          break;
        case PlugPagEventCodes.SALE_END:
          // Fim da transação — resultado completo vem no Promise de startPayment
          break;
        case PlugPagEventCodes.INSERTED_KEY:
          this.setState('processing', 'Senha digitada...');
          break;
        case PlugPagEventCodes.WAITING_REMOVE_CARD:
          this.setState('processing', 'Retire o cartão');
          break;
        case PlugPagEventCodes.REMOVED_CARD:
          this.setState('processing', 'Cartão removido');
          break;
        default:
          // Evento desconhecido — logar mas manter estado atual
          console.log(`[PlugPagService] Evento SDK não mapeado: code=${data.eventCode}`);
          break;
      }
    });

    // Eventos de conexão Bluetooth
    this.connectionHandle = await PlugPagTerminal.addListener('plugpagConnection', (data: PlugPagConnectionEvent) => {
      console.log(`[PlugPagService] Conexão: ${data.status}`);
      if (data.status === 'disconnected') {
        this.connectedMac = null;
        this.setState('disconnected', 'Terminal desconectado');
      }
    });
  }

  private async removeEventListeners(): Promise<void> {
    if (this.eventHandle) {
      await this.eventHandle.remove();
      this.eventHandle = null;
    }
    if (this.connectionHandle) {
      await this.connectionHandle.remove();
      this.connectionHandle = null;
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  async cleanup(): Promise<void> {
    await this.removeEventListeners();
    await this.disconnect();
    this.setState('idle');
  }
}

// Singleton
export const plugpagPaymentService = new PlugPagPaymentService();
export default plugpagPaymentService;
