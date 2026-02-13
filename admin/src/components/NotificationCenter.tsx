/**
 * ============================================================================
 * Notification Center Component
 * ============================================================================
 * 
 * Centro de notificações in-app com dropdown e badge de contagem.
 * Integrado com o notificationService para updates em tempo real.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Bell, 
  BellRing, 
  CheckCheck, 
  Trash2, 
  X, 
  AlertTriangle,
  Package,
  Cpu,
  CreditCard,
  AlertCircle,
  Info,
  CheckCircle2,
  Settings,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  notificationService, 
  Notification, 
  NotificationType,
} from '@/services/notificationService';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

// Mapeamento de ícones por tipo
const NotificationIcon: Record<NotificationType, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-blue-500" />,
  success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  order: <Package className="h-4 w-4 text-indigo-500" />,
  stock: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  hardware: <Cpu className="h-4 w-4 text-purple-500" />,
  payment: <CreditCard className="h-4 w-4 text-red-500" />,
  system: <Settings className="h-4 w-4 text-gray-500" />,
};

// Cores de fundo por tipo
const NotificationBgColor: Record<NotificationType, string> = {
  info: 'bg-blue-50 hover:bg-blue-100',
  success: 'bg-green-50 hover:bg-green-100',
  warning: 'bg-yellow-50 hover:bg-yellow-100',
  error: 'bg-red-50 hover:bg-red-100',
  order: 'bg-indigo-50 hover:bg-indigo-100',
  stock: 'bg-orange-50 hover:bg-orange-100',
  hardware: 'bg-purple-50 hover:bg-purple-100',
  payment: 'bg-red-50 hover:bg-red-100',
  system: 'bg-gray-50 hover:bg-gray-100',
};

// Formatar data relativa
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'Ontem';
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('pt-BR');
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead, onDismiss }: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
  };

  const content = (
    <div 
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors relative group',
        NotificationBgColor[notification.type],
        !notification.isRead && 'border-l-4 border-l-blue-500'
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {NotificationIcon[notification.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm',
            !notification.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
          )}>
            {notification.title}
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0 flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        {notification.actionLabel && notification.actionUrl && (
          <Link 
            to={notification.actionUrl}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {notification.actionLabel}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-gray-400 hover:text-red-500"
          aria-label={`Dispensar notificacao: ${notification.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Unread indicator */}
      {!notification.isRead && (
        <div className="absolute top-2 right-2 h-2 w-2 bg-blue-500 rounded-full" />
      )}
    </div>
  );

  return content;
}

export function NotificationCenter() {
  const { currentFranchise } = useFranchise();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inicializar serviço e subscrever
  useEffect(() => {
    if (user?.uid && currentFranchise?.id) {
      setIsLoading(true);
      setError(null);
      notificationService.initialize(user.uid, currentFranchise.id);
      
      const unsubscribe = notificationService.subscribe((newNotifications) => {
        setNotifications(newNotifications);
        setIsLoading(false);
        setError(null);
      });

      const unsubscribeError = notificationService.subscribeError((err) => {
        setError(err.message || 'Erro ao carregar notificações');
        setIsLoading(false);
      });

      return () => {
        unsubscribe();
        unsubscribeError();
      };
    } else {
      setIsLoading(false);
    }
  }, [user?.uid, currentFranchise?.id]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const hasNotifications = notifications.length > 0;
  const hasCritical = notifications.some(
    n => !n.isRead && (n.priority === 'high' || n.priority === 'critical')
  );

  const handleMarkRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await notificationService.dismiss(id);
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  };

  const handleDismissAll = async () => {
    try {
      await notificationService.dismissAll();
      setIsOpen(false);
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          aria-label={`Notificações${unreadCount > 0 ? `, ${unreadCount} não lidas` : ''}`}
        >
          {hasCritical ? (
            <BellRing className="h-5 w-5 text-red-500 animate-pulse" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          
          {/* Badge de contagem */}
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="text-base font-semibold">Notificações</span>
          {hasNotifications && (
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Ler todas
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700"
                onClick={handleDismissAll}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Limpar
              </Button>
            </div>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-30 animate-pulse" />
            <p className="text-sm font-medium">Carregando notificações...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium">Erro ao carregar</p>
            <p className="text-xs mt-1 text-gray-500">{error}</p>
          </div>
        ) : !hasNotifications ? (
          <div className="py-8 text-center text-gray-500">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma notificação</p>
            <p className="text-xs mt-1">Você será notificado sobre eventos importantes</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <DropdownMenuGroup className="p-2 space-y-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onDismiss={handleDismiss}
                />
              ))}
            </DropdownMenuGroup>
          </ScrollArea>
        )}

        {hasNotifications && notifications.length >= 10 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 text-center">
              <p className="text-xs text-muted-foreground">
                Mostrando as {notifications.length > 50 ? '50' : notifications.length} mais recentes
              </p>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
