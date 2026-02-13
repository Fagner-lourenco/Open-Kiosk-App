import type { ReactNode } from 'react';
import { TabsList } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface TabGroupProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper for a labelled group of TabsTrigger items.
 * Renders a category label above a responsive TabsList.
 */
export function TabGroup({ label, children, className }: TabGroupProps) {
  return (
    <div className={cn(className)}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <TabsList className="h-auto flex-wrap gap-1">
        {children}
      </TabsList>
    </div>
  );
}
