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
