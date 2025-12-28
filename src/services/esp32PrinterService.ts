
import { CartItem } from '@/types/product';
import { StoreSettings } from '@/types/store';

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
              await port.open({ baudRate: 9600 });
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
          await targetPort.open({ baudRate: 9600 });
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

  async sendPrintData(printData: any): Promise<PrinterResponse> {
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

  async releaseDrink(
    data: { orderId: string; sizeLabel: string; mlPerUnit: number; quantity: number },
    settings?: StoreSettings
  ): Promise<DrinkReleaseResponse> {
    try {
      if (!this.writer) {
        if (settings?.comPort) {
          const connected = await this.connectToComPort(settings.comPort);
          if (!connected || !this.writer) {
            return {
              success: false,
              message: `Failed to connect to COM port ${settings.comPort}`,
            };
          }
        } else {
          return { success: false, message: 'ESP32 not connected and no COM port configured' };
        }
      }

      const payload: ReleaseDrinkPayload = {
        action: 'release_drink',
        orderId: data.orderId,
        sizeLabel: data.sizeLabel,
        mlPerUnit: data.mlPerUnit,
        quantity: data.quantity,
        timestamp: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(payload);
      const encodedData = new TextEncoder().encode(jsonString + '\n');

      console.log('Sending drink release command:', payload);
      await this.writer.write(encodedData);

      return { success: true, message: 'Drink release signal sent to ESP32' };
    } catch (error) {
      console.error('Failed to send drink release command:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send drink release signal',
      };
    }
  }
}

// Create a singleton instance
export const esp32Printer = new ESP32PrinterService();
