/**
 * ScrollArea Component
 * Wrapper para área de scroll com estilo personalizado
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function ScrollArea({ children, className, ...props }: ScrollAreaProps) {
  return (
    <div 
      className={cn(
        'overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
