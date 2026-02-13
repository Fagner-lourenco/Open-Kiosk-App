/**
 * ============================================================================
 * Stat Card Component
 * ============================================================================
 * 
 * Card de métrica com ícone, valor e indicador de tendência.
 * Usado em dashboards e páginas de relatórios.
 */

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { TrendIndicator } from "@/components/ui/trend-indicator";
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  color?: 'default' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  loading?: boolean;
  className?: string;
}

const colorVariants = {
  default: {
    icon: 'text-muted-foreground bg-muted',
    value: 'text-foreground',
  },
  blue: {
    icon: 'text-blue-600 bg-blue-100',
    value: 'text-blue-600',
  },
  green: {
    icon: 'text-green-600 bg-green-100',
    value: 'text-green-600',
  },
  yellow: {
    icon: 'text-yellow-600 bg-yellow-100',
    value: 'text-yellow-600',
  },
  red: {
    icon: 'text-red-600 bg-red-100',
    value: 'text-red-600',
  },
  purple: {
    icon: 'text-purple-600 bg-purple-100',
    value: 'text-purple-600',
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'default',
  loading = false,
  className,
}: StatCardProps) {
  const colors = colorVariants[color];

  if (loading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-10 w-10 bg-muted rounded-lg animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden hover:shadow-md transition-shadow", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn("text-2xl font-bold", colors.value)}>
              {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
            </p>
            {trend && (
              <TrendIndicator
                value={trend.value}
                direction={trend.direction}
                label={trend.label}
              />
            )}
          </div>
          {Icon && (
            <div className={cn("p-2.5 rounded-lg", colors.icon)}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
