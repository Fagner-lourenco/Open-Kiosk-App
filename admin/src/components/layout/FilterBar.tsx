import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return <div className={cn('flex flex-col gap-3 md:flex-row md:items-center', className)}>{children}</div>;
}
