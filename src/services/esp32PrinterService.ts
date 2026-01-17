/**
 * @deprecated Este serviço está DEPRECIADO para funcionalidades de dispensação.
 * 
 * PROBLEMA: Este serviço mantém sua própria conexão serial separada, causando
 * conflito de lock no WritableStream quando o ESP32Context já está conectado.
 * 
 * SOLUÇÃO: Para DISPENSAÇÃO, use o ESP32Context (useESP32 hook):
 *   - import { useESP32 } from '@/context/ESP32Context';
 *   - const { releaseDrink, status } = useESP32();
 *   - await releaseDrink(orderId, mlPerUnit, quantity, sizeLabel);
 * 
 * Este serviço é mantido APENAS para funcionalidades de IMPRESSÃO TÉRMICA
 * (generatePrintData, sendPrintData) quando necessário usar uma impressora
 * separada do ESP32 dispensador.
 * 
 * Para novos desenvolvimentos, NÃO use esp32Printer.releaseDrink().
 * 
 * @see ESP32Context - Serviço unificado de comunicação ESP32
 * @see esp32SerialService - Driver de baixo nível para USB Serial
 */

import { CartItem } from '@/types/product';
import { StoreSettings } from '@/types/store';
import esp32Serial from './esp32SerialService';

interface PrinterResponse {
  success: boolean;
  message: string;
}

interface ReleaseDrinkPayload {
  action: 'release_drink';
  orderId: string;
  sizeLabel: string;
  mlPerUnit: number;
  quantity: number;
  timestamp: string;
}

interface DrinkReleaseResponse {
  success: boolean;
  message: string;
}

/**
 * @deprecated Use ESP32Context para dispensação.
 * Mantido apenas para compatibilidade com impressão térmica.
 */
export class ESP32PrinterService {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private connectPromise: Promise<boolean> | null = null;

  async connectToComPort(comPortName: string): Promise<boolean> {
    try {
      if (this.port && this.writer && this.reader) {
        return true;
      }

      if (this.connectPromise) {
        return await this.connectPromise;
      }

      // Check if Web Serial API is supported
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported in this browser');
      }

      // Get all available ports
      const ports = await navigator.serial.getPorts();
      
      // Try to find a port that matches or request a new one
      let targetPort: SerialPort | null = null;
      
      this.connectPromise = (async () => {
        // If we have existing ports, try to connect to them
        for (const port of ports) {
          try {
            if (!port.readable) {
              await port.open({ baudRate: 115200 }); // ESP32 usa 115200 baud
            }
            targetPort = port;
            break;
          } catch (error) {
            console.log('Failed to connect to existing port, trying next...');
            continue;
          }
        }
        
        // If no existing port worked, request a new one
        if (!targetPort) {
          targetPort = await navigator.serial.requestPort();
          await targetPort.open({ baudRate: 115200 }); // ESP32 usa 115200 baud
        }
        
        this.port = targetPort;
        
        // Set up reader and writer
        this.writer = this.port.writable?.getWriter() || null;
        this.reader = this.port.readable?.getReader() || null;
        
        console.log(`ESP32 printer connected successfully to ${comPortName}`);
        return true;
      })();

      const result = await this.connectPromise;
      this.connectPromise = null;
      return result;
    } catch (error) {
      console.error(`Failed to connect to COM port ${comPortName}:`, error);
      this.connectPromise = null;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
      
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
      
      console.log('ESP32 printer disconnected');
    } catch (error) {
      console.error('Error disconnecting from ESP32 printer:', error);
    }
  }

  isConnected(): boolean {
    return this.port !== null && this.writer !== null && this.reader !== null;
  }

  generatePrintData(cartItems: CartItem[], settings: StoreSettings, orderNumber: string) {
    const currentDate = new Date().toLocaleDateString('en-GB');
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const total = cartItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    
    return {
      store: {
        name: settings.name,
        gst: settings.taxId
      },
      receipt: {
        bill_no: orderNumber,
        date: currentDate,
        time: currentTime
      },
      items: cartItems.map(item => ({
        name: `${item.product.title}${item.sizeLabel ? ` (${item.sizeLabel})` : ''}`,
        quantity: `${item.quantity}`,
        price: item.unitPrice * item.quantity
      })),
      total: Math.round(total * (1 + settings.taxPercentage / 100)),
      footer: "Thank you! Visit Again!"
    };
  }

  // Timeout configurável para impressão (padrão 15s para impressões longas)
  private printTimeoutMs = 15000;

  setPrintTimeout(timeoutMs: number): void {
    this.printTimeoutMs = Math.max(5000, timeoutMs); // Mínimo 5 segundos
  }

  async sendPrintData(printData: Record<string, unknown>): Promise<PrinterResponse> {
    try {
      if (!this.writer) {
        throw new Error('ESP32 printer not connected');
      }
      const jsonString = JSON.stringify(printData);
      const data = new TextEncoder().encode(jsonString + '\n');
      const writePromise = this.writer.write(data);
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Print write timed out')), this.printTimeoutMs);
      });

      await Promise.race([writePromise, timeoutPromise]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return { success: true, message: 'Print sent successfully.' };
    } catch (error) {
      console.error('Error sending print data:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown print error' };
    }
  }

  async printReceipt(cartItems: CartItem[], settings: StoreSettings, orderNumber: string): Promise<PrinterResponse> {
    try {
      // If not connected and we have a COM port setting, try to connect
      if (!this.isConnected() && settings.comPort) {
        const connected = await this.connectToComPort(settings.comPort);
        if (!connected) {
          throw new Error(`Failed to connect to COM port ${settings.comPort}`);
        }
      } else if (!this.isConnected()) {
        throw new Error('No COM port configured in settings');
      }
      
      const printData = this.generatePrintData(cartItems, settings, orderNumber);
      return await this.sendPrintData(printData);
    } catch (error) {
      console.error('Print failed:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * @deprecated Use ESP32Context.releaseDrink() em vez deste método.
   * 
   * Este método agora delega para esp32Serial para evitar conflito de lock.
   * O esp32Serial é o único dono da porta USB Serial.
   */
  async releaseDrink(
    data: { orderId: string; sizeLabel: string; mlPerUnit: number; quantity: number },
    settings?: StoreSettings
  ): Promise<DrinkReleaseResponse> {
    console.warn(
      '[esp32PrinterService] ⚠️ DEPRECATED: Use ESP32Context.releaseDrink() em vez de esp32Printer.releaseDrink(). ' +
      'Delegando para esp32Serial...'
    );
    
    try {
      // NOVA LÓGICA: Usar esp32Serial (serviço unificado) para evitar conflito de lock
      if (esp32Serial.isConnected()) {
        console.log('[esp32PrinterService] Usando esp32Serial (já conectado)');
        const success = await esp32Serial.releaseDrink(
          data.orderId,
          data.mlPerUnit,
          data.quantity,
          data.sizeLabel
        );
        return {
          success,
          message: success ? 'Drink release signal sent via unified serial service' : 'Failed to send command',
        };
      }
      
      // Tentar reconectar via esp32Serial se não estiver conectado
      console.log('[esp32PrinterService] esp32Serial não conectado, tentando reconectar...');
      const reconnected = await esp32Serial.tryAutoReconnect();
      
      if (reconnected) {
        console.log('[esp32PrinterService] Reconectado via esp32Serial');
        const success = await esp32Serial.releaseDrink(
          data.orderId,
          data.mlPerUnit,
          data.quantity,
          data.sizeLabel
        );
        return {
          success,
          message: success ? 'Drink release signal sent via unified serial service' : 'Failed to send command',
        };
      }
      
      // Fallback: Se esp32Serial não conseguiu conectar, retornar erro claro
      console.error('[esp32PrinterService] Não foi possível conectar ao ESP32');
      return {
        success: false,
        message: 'ESP32 não conectado. Conecte via painel de administração primeiro.',
      };
    } catch (error) {
      console.error('[esp32PrinterService] Failed to send drink release command:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send drink release signal',
      };
    }
  }
}

// Create a singleton instance
export const esp32Printer = new ESP32PrinterService();
