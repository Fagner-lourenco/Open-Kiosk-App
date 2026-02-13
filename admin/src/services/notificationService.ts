/**
 * ============================================================================
 * Notification Service
 * ============================================================================
 * 
 * Serviço para gerenciamento de notificações in-app.
 * Suporta notificações locais e sincronizadas via Firestore.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { franchiseNotificationsPath } from '@/lib/pathResolver';

// Tipos de notificação
export type NotificationType =
  | 'info'           // Informação geral
  | 'success'        // Sucesso em operação
  | 'warning'        // Alerta/Aviso
  | 'error'          // Erro crítico
  | 'order'          // Novo pedido
  | 'stock'          // Estoque baixo
  | 'hardware'       // Problema de hardware
  | 'payment'        // Problema de pagamento
  | 'system';        // Sistema

// Prioridade da notificação
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

// Interface da notificação
export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: Date;
  readAt?: Date;

  // Contexto adicional
  storeId?: string;
  storeName?: string;
  orderId?: string;
  productId?: string;

  // Ação associada
  actionUrl?: string;
  actionLabel?: string;

  // Metadata
  metadata?: Record<string, unknown>;
}

// Interface para criar notificação
export interface CreateNotificationInput {
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  storeId?: string;
  storeName?: string;
  orderId?: string;
  productId?: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

// Callback para listeners
type NotificationCallback = (notifications: Notification[]) => void;
type ErrorCallback = (error: Error) => void;

class NotificationService {
  private listeners: Set<NotificationCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private unsubscribe: (() => void) | null = null;
  private notifications: Notification[] = [];
  private userId: string | null = null;
  private franchiseId: string | null = null;

  /**
   * Inicializa o serviço com o usuário e franquia atuais
   */
  initialize(userId: string, franchiseId: string) {
    if (this.userId === userId && this.franchiseId === franchiseId) {
      return; // Já inicializado com os mesmos IDs
    }

    this.cleanup();
    this.userId = userId;
    this.franchiseId = franchiseId;
    this.startListening();
  }

  /**
   * Inicia o listener de notificações
   */
  private startListening() {
    if (!this.userId || !this.franchiseId) return;

    const notificationsRef = collection(
      db,
      franchiseNotificationsPath(this.franchiseId)
    );

    // Query: notificações não descartadas, ordenadas por data
    // Note: No userId filter — operational alerts from Cloud Functions
    // (keg_low, maintenance_overdue, payment_failed) don't have a userId
    // and should be visible to all franchise members with access.
    const q = query(
      notificationsRef,
      where('isDismissed', '==', false),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      this.notifications = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
          readAt: data.readAt instanceof Timestamp
            ? data.readAt.toDate()
            : data.readAt ? new Date(data.readAt) : undefined,
        } as Notification;
      });

      this.notifyListeners();
    }, (error) => {
      console.error('Error listening to notifications:', error);
      // Se for erro de índice, para de tentar para evitar requests infinitos
      if (error?.message?.includes('index') || error?.code === 'failed-precondition') {
        console.warn('[NotificationService] Índice Firestore faltando. Execute: firebase deploy --only firestore:indexes');
        this.cleanup();
      }
      this.notifyErrorListeners(error);
    });
  }

  /**
   * Adiciona uma nova notificação
   */
  async addNotification(input: CreateNotificationInput): Promise<string> {
    if (!this.userId || !this.franchiseId) {
      throw new Error('Notification service not initialized');
    }

    const notificationsRef = collection(
      db,
      franchiseNotificationsPath(this.franchiseId)
    );

    const docRef = await addDoc(notificationsRef, {
      ...input,
      priority: input.priority || 'normal',
      userId: this.userId,
      isRead: false,
      isDismissed: false,
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }

  /**
   * Adiciona notificação para múltiplos usuários (broadcast)
   */
  async broadcastNotification(
    input: CreateNotificationInput,
    userIds: string[]
  ): Promise<void> {
    if (!this.franchiseId) {
      throw new Error('Notification service not initialized');
    }

    const batch = writeBatch(db);
    const notificationsRef = collection(
      db,
      franchiseNotificationsPath(this.franchiseId)
    );

    for (const userId of userIds) {
      const docRef = doc(notificationsRef);
      batch.set(docRef, {
        ...input,
        priority: input.priority || 'normal',
        userId,
        isRead: false,
        isDismissed: false,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /**
   * Marca uma notificação como lida
   */
  async markAsRead(notificationId: string): Promise<void> {
    if (!this.franchiseId) return;

    const notificationRef = doc(
      db,
      franchiseNotificationsPath(this.franchiseId),
      notificationId
    );

    await updateDoc(notificationRef, {
      isRead: true,
      readAt: serverTimestamp(),
    });
  }

  /**
   * Marca todas as notificações como lidas
   */
  async markAllAsRead(): Promise<void> {
    if (!this.franchiseId || !this.userId) return;

    const batch = writeBatch(db);
    const unreadNotifications = this.notifications.filter(n => !n.isRead);

    for (const notification of unreadNotifications) {
      const notificationRef = doc(
        db,
        franchiseNotificationsPath(this.franchiseId),
        notification.id
      );
      batch.update(notificationRef, {
        isRead: true,
        readAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /**
   * Descarta (arquiva) uma notificação
   */
  async dismiss(notificationId: string): Promise<void> {
    if (!this.franchiseId) return;

    const notificationRef = doc(
      db,
      franchiseNotificationsPath(this.franchiseId),
      notificationId
    );

    await updateDoc(notificationRef, {
      isDismissed: true,
    });
  }

  /**
   * Descarta todas as notificações
   */
  async dismissAll(): Promise<void> {
    if (!this.franchiseId || !this.userId) return;

    const batch = writeBatch(db);

    for (const notification of this.notifications) {
      const notificationRef = doc(
        db,
        franchiseNotificationsPath(this.franchiseId),
        notification.id
      );
      batch.update(notificationRef, {
        isDismissed: true,
      });
    }

    await batch.commit();
  }

  /**
   * Deleta notificações antigas (limpeza)
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    if (!this.franchiseId || !this.userId) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const notificationsRef = collection(
      db,
      franchiseNotificationsPath(this.franchiseId)
    );

    const q = query(
      notificationsRef,
      where('userId', '==', this.userId),
      where('createdAt', '<', Timestamp.fromDate(cutoffDate))
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db);

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    return snapshot.size;
  }

  /**
   * Obtém todas as notificações atuais
   */
  getNotifications(): Notification[] {
    return this.notifications;
  }

  /**
   * Obtém contagem de não lidas
   */
  getUnreadCount(): number {
    return this.notifications.filter(n => !n.isRead).length;
  }

  /**
   * Obtém notificações de alta prioridade não lidas
   */
  getCriticalNotifications(): Notification[] {
    return this.notifications.filter(
      n => !n.isRead && (n.priority === 'high' || n.priority === 'critical')
    );
  }

  /**
   * Adiciona um listener para mudanças
   */
  subscribe(callback: NotificationCallback): () => void {
    this.listeners.add(callback);

    // Chama imediatamente com os dados atuais
    callback(this.notifications);

    // Retorna função de unsubscribe
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Adiciona um listener para erros
   */
  subscribeError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  /**
   * Notifica todos os listeners
   */
  private notifyListeners() {
    this.listeners.forEach(callback => {
      callback(this.notifications);
    });
  }

  /**
   * Notifica listeners de erro
   */
  private notifyErrorListeners(error: Error) {
    this.errorListeners.forEach(callback => {
      callback(error);
    });
  }

  /**
   * Limpa recursos
   */
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.notifications = [];
    this.userId = null;
    this.franchiseId = null;
  }
}

// Singleton export
export const notificationService = new NotificationService();

// Helpers para criar notificações comuns
export const NotificationTemplates = {
  newOrder: (storeName: string, orderId: string, total: number) => ({
    type: 'order' as NotificationType,
    priority: 'normal' as NotificationPriority,
    title: 'Novo Pedido',
    message: `Novo pedido #${orderId.slice(-6)} de R$ ${total.toFixed(2)} em ${storeName}`,
    orderId,
    storeName,
    actionUrl: `/orders/${orderId}`,
    actionLabel: 'Ver Pedido',
  }),

  lowStock: (productName: string, storeName: string, currentStock: number, threshold: number) => ({
    type: 'stock' as NotificationType,
    priority: 'high' as NotificationPriority,
    title: 'Estoque Baixo',
    message: `${productName} está com estoque baixo (${currentStock}/${threshold}) em ${storeName}`,
    storeName,
    actionUrl: '/inventory',
    actionLabel: 'Ver Estoque',
  }),

  esp32Disconnected: (storeName: string, storeId: string) => ({
    type: 'hardware' as NotificationType,
    priority: 'critical' as NotificationPriority,
    title: 'ESP32 Desconectado',
    message: `O dispositivo ESP32 em ${storeName} perdeu conexão`,
    storeId,
    storeName,
    actionUrl: `/stores/${storeId}?tab=settings`,
    actionLabel: 'Ver Loja',
  }),

  esp32Reconnected: (storeName: string, storeId: string) => ({
    type: 'hardware' as NotificationType,
    priority: 'normal' as NotificationPriority,
    title: 'ESP32 Reconectado',
    message: `O dispositivo ESP32 em ${storeName} está online novamente`,
    storeId,
    storeName,
  }),

  paymentError: (storeName: string, orderId: string, errorMessage: string) => ({
    type: 'payment' as NotificationType,
    priority: 'critical' as NotificationPriority,
    title: 'Erro de Pagamento',
    message: `Falha no pagamento do pedido #${orderId.slice(-6)} em ${storeName}: ${errorMessage}`,
    orderId,
    storeName,
    actionUrl: `/orders/${orderId}`,
    actionLabel: 'Ver Pedido',
  }),

  printerError: (storeName: string, storeId: string, errorMessage: string) => ({
    type: 'hardware' as NotificationType,
    priority: 'high' as NotificationPriority,
    title: 'Erro na Impressora',
    message: `Problema com impressora em ${storeName}: ${errorMessage}`,
    storeId,
    storeName,
    actionUrl: `/stores/${storeId}?tab=settings`,
    actionLabel: 'Ver Configurações',
  }),

  systemUpdate: (title: string, message: string) => ({
    type: 'system' as NotificationType,
    priority: 'normal' as NotificationPriority,
    title,
    message,
  }),
};
