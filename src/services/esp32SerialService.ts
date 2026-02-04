/**
 * ESP32 Serial Service - Serviço Unificado para Comunicação USB Serial
 * 
 * Este serviço gerencia a comunicação bidirecional com o ESP32 via Web Serial API.
 * Suporta envio de comandos e leitura contínua de respostas em tempo real.
 * 
 * Compatível com firmware: esp32_s3_drink_dispenser_v2.ino
 * Baud rate: 115200
 */

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface ESP32Response {
  type: 'pong' | 'status' | 'progress' | 'success' | 'error' | 'flow_test' | 'calibration' | 'info' | 'settings' | 'gpio_test' | 'gpio_diagnostic' | 'taps_status';
  timestamp?: number;
  orderId?: string;
  stage?: string;
  message?: string;
  // Campos de progresso
  cup?: number;
  ml?: number;
  target?: number;
  percent?: number;
  // Campos de progresso estendido (torneira manual v2.1+)
  flow_started?: boolean;
  elapsed_seconds?: number;
  remaining_seconds?: number;
  // Campos de status
  device?: string;
  status?: string;
  uptime_ms?: number;
  wifi_connected?: boolean;
  wifi_ip?: string;
  ble_connected?: boolean;
  // Campos de status adicionais (usados durante dispensação)
  current_cup?: number;
  total_cups?: number;
  ml_dispensed?: number;
  target_ml?: number;
  progress?: number;
  order_id?: string;
  // Campos de teste
  duration?: number;
  duration_ms?: number;
  pulses?: number;
  ml_calculated?: number;
  // Outros
  ip?: string;
  code?: string;
  // Campos de settings (firmware v2.1+)
  firmware_version?: string;
  pulsos_por_litro?: number;
  ml_por_segundo?: number;
  ml_por_pulso?: number;
  wifi_ssid?: string;
  wifi_rssi?: number;
  mdns_hostname?: string;
  ble_name?: string;
  // 🆕 Multi-Tap (firmware v4.0+)
  tapId?: number;
  num_taps?: number;
  taps?: unknown[];
  // 🆕 Identificação do hardware
  chip_id?: string;
  hardware_id?: string;
  mac?: string;
}

export interface ESP32Command {
  // 🔧 v4.0.6: Removidas ações start_wifi_portal e reset_wifi (obsoletas desde firmware v3.0)
  action: 'ping' | 'status' | 'release_drink' | 'stop' | 'test_valve' | 'test_flow' | 'calibrate' | 'beep' | 'save_calibration' | 'get_settings' | 'diagnose_gpio' | 'get_taps';
  orderId?: string;
  mlPerUnit?: number;
  quantity?: number;
  sizeLabel?: string;
  duration?: number;
  times?: number;
  pulsos_por_litro?: number;
  ml_por_segundo?: number;
  tapId?: number;  // 🆕 Multi-Tap: ID da torneira (0 ou 1)
}

export type ESP32MessageCallback = (response: ESP32Response) => void;
export type ESP32RawCallback = (line: string) => void;
export type ESP32ConnectionCallback = (connected: boolean) => void;

// ============================================
// CLASSE PRINCIPAL
// ============================================

class ESP32SerialService {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private isReading = false;
  private readBuffer = '';
  
  // Callbacks para eventos
  private messageCallbacks: ESP32MessageCallback[] = [];
  private rawCallbacks: ESP32RawCallback[] = [];
  private connectionCallbacks: ESP32ConnectionCallback[] = [];

  // ============================================
  // VERIFICAÇÃO DE SUPORTE
  // ============================================

  /**
   * Verifica se o navegador suporta Web Serial API
   */
  isSupported(): boolean {
    return 'serial' in navigator;
  }

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.port !== null && this.writer !== null;
  }

  // ============================================
  // CONEXÃO
  // ============================================

  /**
   * Conecta ao ESP32 via USB Serial
   * Abre o seletor de porta do navegador
   */
  async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      console.error('[ESP32] Web Serial API não suportada neste navegador');
      return false;
    }

    if (this.isConnected()) {
      console.log('[ESP32] Já conectado');
      return true;
    }

    try {
      // Solicitar porta ao usuário
      const port = await navigator.serial.requestPort();

      // Abrir com baud rate do firmware
      await port.open({ baudRate: 115200 });

      this.port = port;
      this.writer = port.writable?.getWriter() || null;

      if (!this.writer) {
        throw new Error('Não foi possível criar writer para a porta');
      }

      console.log('[ESP32] ✅ Conectado via USB Serial');
      
      // Iniciar leitura contínua em background
      this.startReading();

      // Notificar listeners
      this.notifyConnection(true);

      return true;
    } catch (error) {
      console.error('[ESP32] Erro ao conectar:', error);
      return false;
    }
  }

  /**
   * Retorna portas previamente autorizadas pelo usuário
   * Essas portas podem ser reconectadas sem popup de seleção
   */
  async getAuthorizedPorts(): Promise<SerialPort[]> {
    if (!this.isSupported()) {
      return [];
    }
    try {
      return await navigator.serial.getPorts();
    } catch (error) {
      console.error('[ESP32] Erro ao obter portas autorizadas:', error);
      return [];
    }
  }

  /**
   * Tenta reconectar automaticamente a uma porta já autorizada
   * Não requer interação do usuário (sem popup)
   * Retorna true se conseguiu reconectar
   */
  async tryAutoReconnect(): Promise<boolean> {
    if (!this.isSupported()) {
      console.log('[ESP32] Web Serial API não suportada');
      return false;
    }

    if (this.isConnected()) {
      console.log('[ESP32] Já conectado');
      return true;
    }

    try {
      const ports = await this.getAuthorizedPorts();
      
      if (ports.length === 0) {
        console.log('[ESP32] Nenhuma porta autorizada encontrada');
        return false;
      }

      console.log(`[ESP32] 🔍 Encontrada(s) ${ports.length} porta(s) autorizada(s), tentando reconectar...`);

      // Tentar cada porta até encontrar uma que funcione
      for (const port of ports) {
        try {
          // Verificar se a porta já está aberta
          if (port.readable || port.writable) {
            console.log('[ESP32] Porta já aberta, fechando...');
            try {
              await port.close();
            } catch {
              // Ignorar erro ao fechar
            }
          }

          // Tentar abrir a porta
          await port.open({ baudRate: 115200 });

          this.port = port;
          this.writer = port.writable?.getWriter() || null;

          if (!this.writer) {
            throw new Error('Não foi possível criar writer para a porta');
          }

          console.log('[ESP32] ✅ Reconectado automaticamente via USB Serial');

          // Iniciar leitura contínua em background
          this.startReading();

          // Notificar listeners
          this.notifyConnection(true);

          // Enviar ping para verificar conexão
          setTimeout(() => {
            this.ping().then(success => {
              if (success) {
                console.log('[ESP32] 📡 Ping confirmado - conexão ativa');
              }
            });
          }, 500);

          return true;
        } catch (portError) {
          console.log('[ESP32] Porta não disponível:', portError);
          // Continuar para próxima porta
        }
      }

      console.log('[ESP32] Nenhuma porta autorizada estava disponível');
      return false;
    } catch (error) {
      console.error('[ESP32] Erro na reconexão automática:', error);
      return false;
    }
  }

  /**
   * Verifica se há portas autorizadas disponíveis para reconexão
   */
  async hasAuthorizedPorts(): Promise<boolean> {
    const ports = await this.getAuthorizedPorts();
    return ports.length > 0;
  }

  /**
   * Desconecta do ESP32
   */
  async disconnect(): Promise<void> {
    try {
      // Parar leitura
      this.isReading = false;

      // Fechar reader
      if (this.reader) {
        try {
          await this.reader.cancel();
          this.reader.releaseLock();
        } catch {
          // Ignorar erros ao cancelar
        }
        this.reader = null;
      }

      // Fechar writer
      if (this.writer) {
        try {
          await this.writer.close();
        } catch {
          // Ignorar erros ao fechar
        }
        this.writer = null;
      }

      // Fechar porta
      if (this.port) {
        try {
          await this.port.close();
        } catch {
          // Ignorar erros ao fechar
        }
        this.port = null;
      }

      console.log('[ESP32] 🔌 Desconectado');
      this.notifyConnection(false);
    } catch (error) {
      console.error('[ESP32] Erro ao desconectar:', error);
    }
  }

  // ============================================
  // LEITURA CONTÍNUA
  // ============================================

  /**
   * Inicia leitura contínua de dados do ESP32
   * Processa linhas completas (terminadas em \n)
   */
  private async startReading(): Promise<void> {
    if (!this.port?.readable || this.isReading) {
      return;
    }

    this.isReading = true;
    this.reader = this.port.readable.getReader();
    const decoder = new TextDecoder();

    console.log('[ESP32] 📖 Iniciando leitura contínua...');

    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();

        if (done) {
          console.log('[ESP32] Leitura finalizada');
          break;
        }

        if (value) {
          // Decodificar e adicionar ao buffer
          this.readBuffer += decoder.decode(value, { stream: true });

          // Processar linhas completas
          this.processBuffer();
        }
      }
    } catch (error) {
      if (this.isReading) {
        console.error('[ESP32] Erro na leitura:', error);
      }
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch {
          // Ignorar
        }
        this.reader = null;
      }
      this.isReading = false;
    }
  }

  /**
   * Processa o buffer de leitura, extraindo linhas completas
   */
  private processBuffer(): void {
    const lines = this.readBuffer.split('\n');
    
    // Manter última linha incompleta no buffer
    this.readBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        this.handleLine(trimmed);
      }
    }
  }

  /**
   * Processa uma linha recebida do ESP32
   */
  private handleLine(line: string): void {
    // Notificar callbacks raw (todas as linhas)
    for (const callback of this.rawCallbacks) {
      try {
        callback(line);
      } catch (error) {
        console.error('[ESP32] Erro em rawCallback:', error);
      }
    }

    // Extrair JSON se a linha contiver prefixo [RESULT]
    let jsonString = line;
    if (line.includes('[RESULT] ')) {
      const match = line.match(/\[RESULT\]\s*(\{.*\})/);
      if (match && match[1]) {
        jsonString = match[1];
      }
    }

    // Tentar parsear como JSON
    if (jsonString.startsWith('{') && jsonString.endsWith('}')) {
      try {
        const json = JSON.parse(jsonString) as ESP32Response;
        
        // Notificar callbacks de mensagem
        for (const callback of this.messageCallbacks) {
          try {
            callback(json);
          } catch (error) {
            console.error('[ESP32] Erro em messageCallback:', error);
          }
        }
      } catch (error) {
        // Não é JSON válido, ignorar
        console.log('[ESP32] Linha recebida (não-JSON):', line);
      }
    } else {
      // Log para linhas não-JSON (debug do firmware)
      console.log('[ESP32]', line);
    }
  }

  // ============================================
  // ENVIO DE COMANDOS
  // ============================================

  /**
   * Envia um comando JSON para o ESP32
   */
  async sendCommand(command: ESP32Command): Promise<boolean> {
    if (!this.isConnected() || !this.writer) {
      console.error('[ESP32] Não conectado');
      return false;
    }

    try {
      const json = JSON.stringify(command);
      const encoder = new TextEncoder();
      const data = encoder.encode(json + '\n');

      await this.writer.write(data);
      console.log('[ESP32] 📤 Comando enviado:', command.action);
      return true;
    } catch (error) {
      console.error('[ESP32] Erro ao enviar comando:', error);
      return false;
    }
  }

  /**
   * Envia string raw (para debug)
   */
  async sendRaw(text: string): Promise<boolean> {
    if (!this.isConnected() || !this.writer) {
      console.error('[ESP32] Não conectado');
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text + '\n');

      await this.writer.write(data);
      console.log('[ESP32] 📤 Raw enviado:', text);
      return true;
    } catch (error) {
      console.error('[ESP32] Erro ao enviar:', error);
      return false;
    }
  }

  // ============================================
  // COMANDOS DO FIRMWARE
  // ============================================

  /**
   * Ping - Testa comunicação
   */
  async ping(): Promise<boolean> {
    return this.sendCommand({ action: 'ping' });
  }

  /**
   * Status - Obtém status do sistema
   */
  async getStatus(): Promise<boolean> {
    return this.sendCommand({ action: 'status' });
  }

  /**
   * Dispensar bebida
   * 🆕 Multi-Tap: tapId opcional (default 0 para retrocompatibilidade)
   */
  async releaseDrink(
    orderId: string,
    mlPerUnit: number,
    quantity: number = 1,
    sizeLabel: string = 'Padrão',
    tapId: number = 0  // 🆕 Multi-Tap
  ): Promise<boolean> {
    return this.sendCommand({
      action: 'release_drink',
      orderId,
      mlPerUnit,
      quantity,
      sizeLabel,
      tapId,  // 🆕 Sempre enviar, firmware ignora se não suportar
    });
  }

  /**
   * Parar dispensação
   * 🆕 Multi-Tap: tapId opcional (sem tapId = para todas)
   */
  async stop(tapId?: number): Promise<boolean> {
    return this.sendCommand({
      action: 'stop',
      tapId,  // undefined se não passado, firmware interpreta como "todas"
    });
  }

  /**
   * Testar válvula
   * 🆕 Multi-Tap: tapId opcional
   */
  async testValve(durationMs: number = 2000, tapId: number = 0): Promise<boolean> {
    return this.sendCommand({
      action: 'test_valve',
      duration: durationMs,
      tapId,  // 🆕 Multi-Tap
    });
  }

  /**
   * Testar sensor de fluxo
   * 🆕 Multi-Tap: tapId opcional
   */
  async testFlow(durationMs: number = 5000, tapId: number = 0): Promise<boolean> {
    return this.sendCommand({
      action: 'test_flow',
      duration: durationMs,
      tapId,  // 🆕 Multi-Tap
    });
  }

  /**
   * Calibrar bomba
   * 🆕 Multi-Tap: tapId opcional
   */
  async calibrate(durationMs: number = 5000, tapId: number = 0): Promise<boolean> {
    return this.sendCommand({
      action: 'calibrate',
      duration: durationMs,
      tapId,  // 🆕 Multi-Tap
    });
  }

  // ============================================
  // CALLBACKS / LISTENERS
  // ============================================

  /**
   * Adiciona callback para mensagens JSON parseadas
   */
  onMessage(callback: ESP32MessageCallback): () => void {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Adiciona callback para todas as linhas recebidas (raw)
   */
  onRawLine(callback: ESP32RawCallback): () => void {
    this.rawCallbacks.push(callback);
    return () => {
      this.rawCallbacks = this.rawCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Adiciona callback para mudanças de conexão
   */
  onConnectionChange(callback: ESP32ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notifica mudança de conexão
   */
  private notifyConnection(connected: boolean): void {
    for (const callback of this.connectionCallbacks) {
      try {
        callback(connected);
      } catch (error) {
        console.error('[ESP32] Erro em connectionCallback:', error);
      }
    }
  }
}

// Singleton
export const esp32Serial = new ESP32SerialService();
export default esp32Serial;
