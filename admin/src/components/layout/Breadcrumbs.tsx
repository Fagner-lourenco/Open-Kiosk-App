/**
 * ============================================================================
 * Breadcrumbs - Navegação hierárquica
 * ============================================================================
 *
 * Componente reutilizável para breadcrumbs. Aceita itens com label + href
 * opcionais. O último item é renderizado como texto (página atual).
 *
 * @example
 * <Breadcrumbs items={[
 *   { label: 'Lojas', href: '/stores' },
 *   { label: 'Loja Central' },
 * ]} />
 */

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
      <ol className="flex items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {isLast || !item.href ? (
                <span className={cn(isLast && 'font-medium text-foreground')} aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.href} className="hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
