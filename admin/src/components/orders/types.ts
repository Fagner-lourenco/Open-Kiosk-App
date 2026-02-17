/**
 * ============================================================================
 * Order Types
 * ============================================================================
 * 
 * Tipos compartilhados para componentes de pedidos.
 */

import { Timestamp } from 'firebase/firestore';

export interface OrderItem {
  productId: string;
  title: string;
  productName?: string;
  quantity: number;
  price: number;
  size?: string;
  imageUrl?: string;
}

export interface Order {
  id: string;
  orderId?: string;
  orderNumber?: string; // Added for Kiosk compatibility
  items: OrderItem[];
  total: number;
  subtotal?: number;
  tax?: number;
  discount?: number;
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'cancelled'
    | 'paid_pending_dispense'
    | 'dispensing'
    | 'failed_dispense'
    | 'compensation_pending'
    | 'compensated';
  paymentMethod: 'cash' | 'card' | 'pix' | 'pix_qr' | 'mercadopago' | string;
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed' | 'canceled' | 'expired' | 'paid_pending_dispense' | 'dispensed' | 'failed_needs_compensation';
  timestamp?: Timestamp;
  createdAt?: Timestamp;
  paidAt?: Timestamp;
  processingAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  storeId?: string;
  franchiseId?: string; // Added for Kiosk compatibility
  deviceId?: string;    // Added for Kiosk compatibility
  date?: string;
}

export interface OrderStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  cancelled: number;
  revenue: number;
  avgTicket: number;
  revenueYesterday?: number;
  ordersYesterday?: number;
}
