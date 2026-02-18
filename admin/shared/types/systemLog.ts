/**
 * ============================================================================
 * System Log Types
 * ============================================================================
 * 
 * Tipos para logs de sistema do kiosk (ESP32, pagamentos, serial, etc.)
 * Armazenados em: franchises/{fid}/stores/{sid}/systemLogs/{logId}
 */

import type { Timestamp } from 'firebase/firestore';

export type SystemLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type SystemLogSource = 
  | 'esp32'       // Comunicação com ESP32 (sem pings)
  | 'kiosk'       // Eventos gerais do kiosk
  | 'payment'     // Fluxo de pagamento
  | 'serial'      // Comunicação serial USB
  | 'dispense'    // Eventos de dispensação
  | 'firmware';   // Respostas do firmware

export interface SystemLog {
  id?: string;
  level: SystemLogLevel;
  source: SystemLogSource;
  message: string;
  details?: Record<string, unknown>;
  deviceId?: string;
  storeId: string;
  franchiseId: string;
  timestamp: Timestamp | Date;
}
