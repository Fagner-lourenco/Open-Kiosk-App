/**
 * ============================================================================
 * PlugPag Payment Service
 * ============================================================================
 *
 * Serviço de pagamento card-present via terminal PlugPag (Moderninha Pro 2, etc).
 * Gerencia o ciclo de vida completo: inicialização → conexão → pagamento → feedback.
 *
 * Arquitetura:
 *   - Identificador do terminal vinculado ao tablet via localStorage
 *   - Esse identificador também em taps[].plugpagDeviceId para organização no admin
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
  type PlugPagAuthEvent,
} from '@/plugins/plugpagTerminal';
import type { PluginListenerHandle } from '@capacitor/core';
import { getPlugPagDeviceId, setPlugPagDeviceId } from '@/components/TapSettingsSync';

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
  | 'connected_but_unauthenticated' // BT pronto, mas conta PagBank ainda sem autenticação
  | 'authenticating'     // Fluxo interativo de autenticação em andamento
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
  errorCode?: string;
}

export interface PlugPagAuthResponse {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export type PlugPagStateListener = (state: PlugPagTerminalState, message?: string) => void;

/**
 * Códigos de erro do SDK que indicam "terminal não pronto — tente novamente".
 *
 * PP1003 = "Terminal não está pronto para transacionar" — pode ser token vazio ou transitório
 * PP1025 = "Falha ao adquirir as informações do leitor" — RFCOMM timeout
 *
 * No SDK 4.x, PP1003 pode indicar que requestAuthentication() ainda não foi feito
 * (Token len: 0). Se o token já existe, retry pode resolver erros transitórios.
 */
const SDK_TERMINAL_NOT_READY_CODES = ['PP1003', 'PP1025'];

/** Máximo de retries automáticos para erros de "terminal não pronto" */
const MAX_TERMINAL_NOT_READY_RETRIES = 2;

/** Delay entre retries (ms) — dá tempo ao terminal de estabilizar RFCOMM */
const TERMINAL_RETRY_DELAY_MS = 3000;

// ============================================================================
// SERVICE
// ============================================================================

class PlugPagPaymentService {
  private state: PlugPagTerminalState = 'idle';
  private listeners: Set<PlugPagStateListener> = new Set();
  private eventHandle: PluginListenerHandle | null = null;
  private connectionHandle: PluginListenerHandle | null = null;
  private authHandle: PluginListenerHandle | null = null;
  private connectedDeviceId: string | null = null;
  private requestedDeviceId: string | null = null;
  private authenticated = false;
  private lastAuthEvent: PlugPagAuthEvent | null = null;

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

  getConnectedDeviceId(): string | null {
    return this.connectedDeviceId;
  }

  /** @deprecated Compat alias kept while components migrate away from MAC terminology. */
  getConnectedMac(): string | null {
    return this.getConnectedDeviceId();
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  getRequestedDeviceId(): string | null {
    return this.requestedDeviceId;
  }

  private extractPluginErrorCode(error: any): string | undefined {
    if (!error) {
      return undefined;
    }

    return error.code
      || error.errorCode
      || error?.result?.errorCode
      || undefined;
  }

  private async syncAuthenticationState(): Promise<boolean> {
    try {
      const authResult = await PlugPagTerminal.isAuthenticated();
      this.authenticated = authResult.authenticated;

      // Para terminais standalone (Moderninha PRO), isAuthenticated() é
      // informativo apenas — o terminal gerencia sua própria autenticação.
      // NÃO regredir o estado de 'connected' para 'connected_but_unauthenticated'.
      console.log(`[PlugPagService] syncAuth: isAuthenticated=${authResult.authenticated}`);

      return authResult.authenticated;
    } catch (error: any) {
      this.authenticated = false;
      console.warn('[PlugPagService] syncAuth: falha ao verificar autenticação:', error?.message);
      return false;
    }
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
   *
   * Fluxo oficial adotado no kiosk:
   *   1. Inicializar SDK
   *   2. Conectar ao terminal pelo identificador configurado
   *   3. Atualizar o estado de autenticação local sem abrir login automaticamente
   *
   * O login PagBank fica fora do boot e do auto-connect. Ele só acontece por
   * ação explícita do operador via authenticateInteractive().
   */
  async connect(deviceId?: string): Promise<boolean> {
    const targetDeviceId = deviceId || getPlugPagDeviceId();
    if (!targetDeviceId) {
      this.setState('error', 'Nenhum identificador de terminal configurado');
      return false;
    }

    console.log(`[PlugPagService] connect: requestedDeviceId=${targetDeviceId}`);

    if (
      (this.state === 'connected' || this.state === 'connected_but_unauthenticated') &&
      this.requestedDeviceId === targetDeviceId
    ) {
      console.log('[PlugPagService] Terminal já conectado via BT (state=' + this.state + ')');
      return true;
    }

    if (this.state === 'idle' || this.state === 'error') {
      const ok = await this.initialize();
      if (!ok) return false;
    }

    this.setState('connecting', `Conectando a ${targetDeviceId}...`);

    try {
      const result = await PlugPagTerminal.connect({
        deviceId: targetDeviceId,
      });
      if (!result.connected) {
        this.setState('disconnected', 'Falha na conexão Bluetooth');
        return false;
      }

      const resolvedName = result.resolvedBluetoothName || null;
      const resolvedAddress = result.resolvedBluetoothAddress || null;
      const connectedTarget = resolvedName || resolvedAddress || result.deviceId || targetDeviceId;
      const usingLegacyFallback = targetDeviceId !== connectedTarget;

      this.requestedDeviceId = targetDeviceId;
      this.connectedDeviceId = connectedTarget;
      if (resolvedName && resolvedName !== targetDeviceId) {
        setPlugPagDeviceId(resolvedName);
      } else if (!resolvedName && resolvedAddress && resolvedAddress !== targetDeviceId) {
        setPlugPagDeviceId(resolvedAddress);
      }

      console.log(
        '[PlugPagService] BT conectado ao terminal:',
        connectedTarget,
        `(requested=${targetDeviceId}, name=${resolvedName}, addr=${resolvedAddress}, legacyFallback=${usingLegacyFallback}, authenticated=${(result as any).authenticated ?? 'unknown'})`
      );

      // Verificar auth state retornado pelo plugin nativo
      // Token é populado via requestAuthentication (login interativo PagBank, uma vez)
      const isAuthenticated = (result as any).authenticated === true;
      this.authenticated = isAuthenticated;

      if (isAuthenticated) {
        this.setState('connected', `Conectado ao terminal ${connectedTarget}`);
      } else {
        // BT conectado mas sem token PagBank — pagamentos vão falhar com PP1003
        // Usuário precisa fazer login PagBank via requestAuthentication (uma vez)
        this.setState('connected_but_unauthenticated',
          `Terminal ${connectedTarget} conectado — autenticação PagBank necessária`);
      }

      return true;
    } catch (error: any) {
      this.connectedDeviceId = null;
      this.requestedDeviceId = null;
      this.authenticated = false;
      this.setState('error', error?.message || 'Erro na conexão BT');
      return false;
    }
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
    this.connectedDeviceId = null;
    this.requestedDeviceId = null;
    this.authenticated = false;
    this.setState('disconnected');
  }

  /**
   * Executa a autenticação interativa oficial do PagBank.
   *
   * Este fluxo é explícito: nunca é disparado automaticamente no boot ou no
   * auto-connect do terminal.
   */
  async authenticateInteractive(): Promise<PlugPagAuthResponse> {
    if (this.state === 'idle' || this.state === 'error') {
      const connected = await this.connect();
      if (!connected) {
        return { success: false, error: 'Não foi possível conectar ao terminal antes da autenticação.' };
      }
    }

    if (!this.connectedDeviceId) {
      const connected = await this.connect();
      if (!connected || !this.connectedDeviceId) {
        return { success: false, error: 'Terminal não conectado. Conecte o terminal antes de autenticar.' };
      }
    }

    const alreadyAuthenticated = await this.syncAuthenticationState();
    if (alreadyAuthenticated) {
      if (this.connectedDeviceId) {
        this.setState('connected', `Conectado ao terminal ${this.connectedDeviceId}`);
      }
      return { success: true };
    }

    this.setState('authenticating', 'Abrindo autenticação do PagBank...');
    this.lastAuthEvent = null;
    const startedAt = Date.now();

    try {
      const authResult = await PlugPagTerminal.requestInteractiveAuthentication();
      const durationMs = authResult.durationMs ?? (Date.now() - startedAt);
      console.log(
        '[PlugPagService] authenticateInteractive resolved:',
        `authenticated=${authResult.authenticated}`,
        `errorCode=${authResult.errorCode || 'none'}`,
        `resultCode=${authResult.resultCode ?? 'none'}`,
        `durationMs=${durationMs}`
      );

      const authenticated = await this.syncAuthenticationState();
      if (authenticated) {
        if (this.connectedDeviceId) {
          this.setState('connected', `Autenticação PagBank concluída em ${Math.round(durationMs / 1000)}s`);
        } else {
          this.setState('connected', 'Autenticação PagBank concluída');
        }
        return { success: true };
      }

      const failureCode = authResult.errorCode || 'AUTH_FAILED';
      if (this.connectedDeviceId) {
        this.setState(
          'connected_but_unauthenticated',
          `Terminal ${this.connectedDeviceId} conectado - autenticação PagBank ainda pendente`
        );
      }
      return {
        success: false,
        error: 'A autenticação não persistiu. Verifique a conta PagBank e tente novamente.',
        errorCode: failureCode,
      };
    } catch (error: any) {
      const message = error?.message || 'Falha ao autenticar com PagBank';
      const errorCode = this.extractPluginErrorCode(error) || this.lastAuthEvent?.errorCode || 'AUTH_FAILED';
      this.authenticated = false;
      if (this.connectedDeviceId) {
        this.setState(
          'connected_but_unauthenticated',
          `Terminal ${this.connectedDeviceId} conectado - ${errorCode}`
        );
      }
      console.warn('[PlugPagService] authenticateInteractive falhou:', `code=${errorCode}`, message);
      return { success: false, error: message, errorCode };
    }
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
    // Garantir conexão Bluetooth
    if (this.state !== 'connected' && this.state !== 'connected_but_unauthenticated') {
      const connected = await this.connect();
      if (!connected) {
        return { success: false, error: 'Terminal não conectado' };
      }
    }

    // Bloquear pagamento se não autenticado.
    // O SDK requer requestAuthentication() bem-sucedido antes de doPayment().
    // Sem token válido, doPayment() falha com PP1003/PP1030 ("Profile is empty, Token len: 0").
    if (this.state === 'connected_but_unauthenticated' || !this.authenticated) {
      console.error(
        '[PlugPagService] startPayment: isAuthenticated=false — pagamento bloqueado.',
        'Autenticação PagBank obrigatória. Chame authenticateInteractive() primeiro.',
      );
      return {
        success: false,
        error: 'Autenticação PagBank necessária. Faça login na conta PagBank antes de cobrar.',
        errorCode: 'AUTH_REQUIRED',
      };
    }

    // Validar conexão BT real (não apenas flag local — BT pode ter caído)
    try {
      const status = await PlugPagTerminal.getStatus();
      if (!status.btConnected) {
        console.warn('[PlugPagService] BT caiu silenciosamente — tentando reconectar');
        this.connectedDeviceId = null;
        this.requestedDeviceId = null;
        this.setState('disconnected', 'Conexão BT perdida — reconectando...');
        const reconnected = await this.connect();
        if (!reconnected) {
          return { success: false, error: 'Conexão Bluetooth perdida. Reconexão falhou.' };
        }
      }
    } catch (e) {
      console.warn('[PlugPagService] getStatus falhou — continuando:', e);
    }

    // Auth verificado, BT conectado — executar pagamento
    return this.executePaymentWithRetry(request, 0);
  }

  /**
   * Executa o pagamento com retry automático para erros transientes.
   *
   * PP1003 = "Terminal não está pronto para transacionar" — manual: "Tente novamente"
   * PP1025 = "Falha ao adquirir informações do leitor" — RFCOMM timeout
   *
   * Ambos são erros transientes que o manual diz para tentar novamente.
   * Damos um delay entre retries para o terminal estabilizar o RFCOMM.
   */
  private async executePaymentWithRetry(
    request: PlugPagPaymentRequest,
    retryCount: number,
  ): Promise<PlugPagPaymentResponse> {
    this.setState('waiting_card', retryCount > 0
      ? `Tentativa ${retryCount + 1}... Insira ou aproxime o cartão`
      : 'Insira ou aproxime o cartão',
    );

    try {
      const options: PlugPagPaymentOptions = {
        amountCents: request.amountCents,
        type: request.type.toUpperCase() as PlugPagPaymentType,
        installments: request.installments || 1,
        userReference: request.orderId,
      };

      // Promise.race: pagamento vs timeout
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
        if (timeoutId) clearTimeout(timeoutId);
        console.error('[PlugPagService] Timeout — abortando pagamento');
        await this.abortPayment();
        this.setState('error', 'Tempo esgotado');
        return { success: false, error: timeoutError?.message || 'Tempo esgotado' };
      }

      if (timeoutId) clearTimeout(timeoutId);

      if (result.approved) {
        this.setState('approved', result.message || 'Pagamento aprovado');
        setTimeout(() => {
          if (this.state === 'approved') this.setState('connected');
        }, 5000);
        return { success: true, result };
      } else {
        console.warn(
          '[PlugPagService] Pagamento rejeitado:',
          `message=${result.message || ''} errorCode=${result.errorCode || ''} resultCode=${typeof result.resultCode === 'number' ? result.resultCode : ''} retry=${retryCount}/${MAX_TERMINAL_NOT_READY_RETRIES}`
        );

        // PP1003/PP1025 = "Terminal não está pronto — tente novamente" (documentação oficial)
        // Retry automático com delay para dar tempo ao terminal de estabilizar
        if (
          result.errorCode &&
          SDK_TERMINAL_NOT_READY_CODES.includes(result.errorCode) &&
          retryCount < MAX_TERMINAL_NOT_READY_RETRIES
        ) {
          console.log(
            `[PlugPagService] Terminal não pronto (${result.errorCode}) — retry ${retryCount + 1}/${MAX_TERMINAL_NOT_READY_RETRIES} em ${TERMINAL_RETRY_DELAY_MS}ms`
          );
          this.setState('connecting', `Terminal não pronto — tentando novamente em ${TERMINAL_RETRY_DELAY_MS / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, TERMINAL_RETRY_DELAY_MS));
          return this.executePaymentWithRetry(request, retryCount + 1);
        }

        this.setState('rejected', result.message || 'Pagamento não aprovado');
        setTimeout(() => {
          if (this.state === 'rejected') this.setState('connected');
        }, 3000);
        return { success: false, result, error: result.message || 'Negado' };
      }
    } catch (error: any) {
      this.setState('error', error?.message || 'Erro no pagamento');
      setTimeout(() => { this.connect().catch(() => {}); }, 2000);
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

  /**
   * Ativa forçosamente o terminal com o activationCode informado.
   *
   * Use este método no painel admin quando a ativação automática falhar.
   * Chama initializeAndActivatePinpad() diretamente sem passar pela tela de login.
   * Requer que o SDK já esteja inicializado (chame connect() antes, ou initialize()).
   */
  async forceActivate(activationCode: string): Promise<{ success: boolean; error?: string }> {
    if (!activationCode?.trim()) {
      return { success: false, error: 'activationCode é obrigatório' };
    }

    // initializeAndActivatePinpad requires an active RFCOMM session to the terminal
    if (this.state !== 'connected' && this.state !== 'connected_but_unauthenticated') {
      const connected = await this.connect();
      if (!connected) {
        return { success: false, error: 'Falha ao conectar BT ao terminal. Conecte o terminal antes de ativar.' };
      }
    }

    console.log('[PlugPagService] forceActivate: chamando initializeAndActivatePinpad...');

    try {
      await PlugPagTerminal.requestAuthentication({ activationCode: activationCode.trim() });

      const auth = await PlugPagTerminal.isAuthenticated();
      console.log(`[PlugPagService] forceActivate: isAuthenticated=${auth.authenticated}`);

      if (!auth.authenticated) {
        this.authenticated = false;
        // Manter estado 'connected' — terminal standalone não depende de auth local
        console.warn('[PlugPagService] forceActivate: token não persistiu após ativação');
        return { success: false, error: 'initializeAndActivatePinpad retornou OK mas token não foi gravado' };
      }

      this.authenticated = true;
      if (this.connectedDeviceId) {
        this.setState('connected', `Conectado ao terminal ${this.connectedDeviceId}`);
      }
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[PlugPagService] forceActivate falhou:', msg);
      return { success: false, error: msg };
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
        this.connectedDeviceId = null;
        this.requestedDeviceId = null;
        this.authenticated = false;
        this.setState('disconnected', 'Terminal desconectado');
      }
    });

    this.authHandle = await PlugPagTerminal.addListener('plugpagAuth', (data: PlugPagAuthEvent) => {
      this.lastAuthEvent = data;
      console.log(
        '[PlugPagService] Auth event:',
        `status=${data.status}`,
        `errorCode=${data.errorCode || 'none'}`,
        `resultCode=${data.resultCode ?? 'none'}`,
        `durationMs=${data.durationMs ?? 'none'}`,
        `lockTaskRestored=${data.lockTaskRestored ?? 'unknown'}`,
        `authenticated=${data.authenticated ?? 'unknown'}`
      );

      if (data.status === 'authenticated') {
        this.authenticated = data.authenticated !== false;
      } else if (data.authenticated === false) {
        this.authenticated = false;
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
    if (this.authHandle) {
      await this.authHandle.remove();
      this.authHandle = null;
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
