/**
 * ESP32StatusIndicator - Indicador visual de status de conexão ESP32
 * 
 * Exibe o status atual da conexão com o ESP32 de forma compacta.
 * Pode ser usado no Header ou em qualquer lugar da aplicação.
 */

import React from 'react';
import { Wifi, WifiOff, Usb, Bluetooth, Loader2, AlertCircle } from 'lucide-react';
import { useESP32 } from '@/context/ESP32Context';
import { useTranslation } from '@/i18n';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ESP32StatusIndicatorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

const ESP32StatusIndicator: React.FC<ESP32StatusIndicatorProps> = ({
  showLabel = true,
  size = 'sm',
  onClick,
}) => {
  const { t } = useTranslation();
  const { status, isConnecting, isDispensing, lastError } = useESP32();
  
  // Tamanhos de ícone
  const iconSize = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }[size];
  
  // Ícone baseado no tipo de conexão
  const getIcon = () => {
    if (isConnecting) {
      return <Loader2 className={`${iconSize} animate-spin text-blue-500`} />;
    }
    
    if (!status.connected) {
      return <WifiOff className={`${iconSize} text-gray-400`} />;
    }
    
    switch (status.type) {
      case 'usb':
        return <Usb className={`${iconSize} text-green-500`} />;
      case 'wifi':
        return <Wifi className={`${iconSize} text-green-500`} />;
      case 'bluetooth':
        return <Bluetooth className={`${iconSize} text-blue-500`} />;
      default:
        return <AlertCircle className={`${iconSize} text-yellow-500`} />;
    }
  };
  
  // Status text
  const getStatusText = () => {
    if (isConnecting) {
      return t('esp32.connecting') || 'Conectando...';
    }
    
    if (!status.connected) {
      return t('esp32.disconnected') || 'Desconectado';
    }
    
    if (isDispensing) {
      return t('esp32.dispensing') || 'Dispensando...';
    }
    
    const typeLabels: Record<string, string> = {
      usb: 'USB',
      wifi: 'WiFi',
      bluetooth: 'Bluetooth',
    };
    
    return `${t('esp32.connected') || 'Conectado'} (${typeLabels[status.type] || status.type})`;
  };
  
  // Cor do fundo baseado no status
  const getBackgroundClass = () => {
    if (isConnecting) {
      return 'bg-blue-50 border-blue-200';
    }
    
    if (!status.connected) {
      return 'bg-gray-50 border-gray-200';
    }
    
    if (isDispensing) {
      return 'bg-yellow-50 border-yellow-200';
    }
    
    return 'bg-green-50 border-green-200';
  };
  
  // Cor do texto
  const getTextClass = () => {
    if (isConnecting) {
      return 'text-blue-700';
    }
    
    if (!status.connected) {
      return 'text-gray-500';
    }
    
    if (isDispensing) {
      return 'text-yellow-700';
    }
    
    return 'text-green-700';
  };
  
  // Tooltip content
  const tooltipContent = () => {
    const lines = [getStatusText()];
    
    if (status.deviceName) {
      lines.push(`Dispositivo: ${status.deviceName}`);
    }
    
    if (lastError) {
      lines.push(`Erro: ${lastError}`);
    }
    
    return lines.join('\n');
  };
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors
            ${getBackgroundClass()}
            ${onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}
          `}
        >
          {getIcon()}
          
          {showLabel && (
            <span className={`text-xs font-medium ${getTextClass()}`}>
              {status.connected ? (
                status.type === 'usb' ? 'USB' : 
                status.type === 'wifi' ? 'WiFi' : 
                status.type === 'bluetooth' ? 'BLE' : 
                'ESP32'
              ) : (
                isConnecting ? '...' : 'ESP32'
              )}
            </span>
          )}
          
          {/* Indicador de dispensação */}
          {isDispensing && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="whitespace-pre-line">{tooltipContent()}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default ESP32StatusIndicator;
