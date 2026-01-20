/**
 * ============================================================================
 * Trend Indicator Component
 * ============================================================================
 * 
 * Indicador de tendência com seta e percentual.
 * Mostra comparativo entre períodos.
 */

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface TrendIndicatorProps {
  value: number;
  direction: 'up' | 'down' | 'neutral';
  label?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function TrendIndicator({
  value,
  direction,
  label = 'vs ontem',
  showIcon = true,
  size = 'sm',
  className,
}: TrendIndicatorProps) {
  const Icon = direction === 'up' 
    ? TrendingUp 
    : direction === 'down' 
      ? TrendingDown 
      : Minus;

  const colorClass = direction === 'up'
    ? 'text-green-600'
    : direction === 'down'
      ? 'text-red-600'
      : 'text-gray-500';

  const bgClass = direction === 'up'
    ? 'bg-green-50'
    : direction === 'down'
      ? 'text-red-50'
      : 'bg-gray-50';

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
  };

  const prefix = direction === 'up' ? '+' : direction === 'down' ? '' : '';

  return (
    <div className={cn(
      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
      bgClass,
      colorClass,
      sizeClasses[size],
      className
    )}>
      {showIcon && <Icon className={iconSizes[size]} />}
      <span className="font-medium">
        {prefix}{value.toFixed(1)}%
      </span>
      {label && (
        <span className="text-muted-foreground ml-0.5">{label}</span>
      )}
    </div>
  );
}
