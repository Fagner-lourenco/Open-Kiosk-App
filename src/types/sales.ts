export type PaymentMethod =
  | 'pix_qr'
  | 'credit_card'
  | 'debit_card'
  | 'mercadopago_qr'
  | 'mercadopago_point'
  | 'cash'
  | 'unknown';

export interface SaleTimingData {
  timestamp: Date;
  date: string; // YYYY-MM-DD
  hourOfDay: number; // 0-23
  dayOfWeek: number; // 0=Sunday
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
  isWeekend: boolean;
  isHoliday?: boolean;
}

export interface SaleItem {
  productId: string;
  title: string;
  quantity: number;
  total: number; // Valor total (quantity * unitPrice) ou apenas total
  total_amount?: number; // Alternativa encontrada em alguns lugares
  unitPrice?: number;
  currency?: string;
  [key: string]: any; // Permite flexibilidade para outros campos legados
}
