/**
 * ============================================================================
 * StoreNavAccordion — Navegação lateral accordion para sub-rotas da loja
 * ============================================================================
 *
 * Grupos colapsáveis com auto-open baseado na rota ativa.
 * "Visão Geral" fica sempre visível fora do accordion.
 * Múltiplos grupos podem estar abertos simultaneamente.
 * Estado salvo em sessionStorage por storeId.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STORE_NAV_ITEMS, STORE_NAV_GROUPS } from '@/config/storeNavConfig';

interface StoreNavAccordionProps {
  storeId: string;
}

const STORAGE_PREFIX = 'storeNav_';

/** Retorna a key do grupo que contém a rota ativa */
function getActiveGroup(pathname: string, storeId: string): string | null {
  const basePath = `/stores/${storeId}`;
  for (const item of STORE_NAV_ITEMS) {
    if (item.group === 'overview') continue;
    const itemPath = item.href ? `${basePath}/${item.href}` : basePath;
    if (pathname === itemPath || pathname.startsWith(`${itemPath}/`)) {
      return item.group;
    }
  }
  return null;
}

export function StoreNavAccordion({ storeId }: StoreNavAccordionProps) {
  const location = useLocation();
  const storageKey = `${STORAGE_PREFIX}${storeId}`;

  // Grupos (exclui overview, que fica fora do accordion)
  const accordionGroups = useMemo(
    () => Object.entries(STORE_NAV_GROUPS).filter(([key]) => key !== 'overview'),
    [],
  );

  // Item da visão geral (sempre visível)
  const overviewItem = useMemo(
    () => STORE_NAV_ITEMS.find((item) => item.group === 'overview'),
    [],
  );

  // Estado: quais grupos estão abertos
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // Restaurar do sessionStorage
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const set = new Set(parsed);
        // Garantir que o grupo ativo também esteja aberto
        const activeGroup = getActiveGroup(location.pathname, storeId);
        if (activeGroup) set.add(activeGroup);
        return set;
      }
    } catch {
      // ignore
    }
    // Default: abrir o grupo ativo
    const activeGroup = getActiveGroup(location.pathname, storeId);
    return activeGroup ? new Set([activeGroup]) : new Set<string>();
  });

  // Auto-open quando a rota muda
  useEffect(() => {
    const activeGroup = getActiveGroup(location.pathname, storeId);
    if (activeGroup && !openGroups.has(activeGroup)) {
      setOpenGroups((prev) => {
        const next = new Set(prev);
        next.add(activeGroup);
        return next;
      });
    }
  }, [location.pathname, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir no sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...openGroups]));
    } catch {
      // ignore
    }
  }, [openGroups, storageKey]);

  const toggleGroup = useCallback((groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  /** Checa se algum item desse grupo está ativo */
  const isGroupActive = useCallback(
    (groupKey: string) => {
      return STORE_NAV_ITEMS.some((item) => {
        if (item.group !== groupKey) return false;
        const itemPath = item.href
          ? `/stores/${storeId}/${item.href}`
          : `/stores/${storeId}`;
        return (
          location.pathname === itemPath ||
          location.pathname.startsWith(`${itemPath}/`)
        );
      });
    },
    [location.pathname, storeId],
  );

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 shadow-sm">
      {/* Visão Geral — sempre visível, fora do accordion */}
      {overviewItem && (
        <div className="px-2 pt-2 pb-1">
          <NavLink
            to={`/stores/${storeId}/${overviewItem.href}`}
            end
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                )}
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                    isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground/70',
                  )}
                >
                  <overviewItem.icon className="h-3.5 w-3.5" />
                </div>
                {overviewItem.label}
              </>
            )}
          </NavLink>
        </div>
      )}

      {/* Accordion groups */}
      {accordionGroups.map(([groupKey, groupLabel]) => {
        const items = STORE_NAV_ITEMS.filter((item) => item.group === groupKey);
        if (items.length === 0) return null;

        const isOpen = openGroups.has(groupKey);
        const hasActiveItem = isGroupActive(groupKey);

        return (
          <div key={groupKey}>
            {/* Separator */}
            <div className="mx-3 border-t border-border/40" />

            {/* Group header — clickable toggle */}
            <div className="px-2 pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 transition-colors',
                  'hover:bg-muted/60',
                  hasActiveItem && !isOpen ? 'text-foreground' : '',
                )}
                aria-expanded={isOpen}
                aria-controls={`store-nav-group-${groupKey}`}
              >
                <div className="flex items-center gap-2">
                  {/* Active dot indicator (visible when collapsed & has active child) */}
                  {hasActiveItem && !isOpen && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-in fade-in" />
                  )}
                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-widest',
                      hasActiveItem
                        ? 'text-muted-foreground/70'
                        : 'text-muted-foreground/50',
                    )}
                  >
                    {groupLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {items.length}
                  </span>
                </div>
                <ChevronRight
                  className={cn(
                    'h-3 w-3 text-muted-foreground/40 transition-transform duration-200',
                    isOpen && 'rotate-90',
                  )}
                />
              </button>
            </div>

            {/* Collapsible items container — CSS grid animation */}
            <div
              id={`store-nav-group-${groupKey}`}
              className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
              role="region"
              aria-labelledby={`store-nav-header-${groupKey}`}
            >
              <div className="overflow-hidden">
                <div className={cn('space-y-0.5 px-2', isOpen ? 'pb-1.5' : 'pb-0')}>
                  {items.map((item) => (
                    <NavLink
                      key={item.href}
                      to={`/stores/${storeId}/${item.href}`}
                      end={item.href === ''}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150',
                          isActive
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                          )}
                          <div
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                              isActive
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground/70',
                            )}
                          >
                            <item.icon className="h-3.5 w-3.5" />
                          </div>
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Bottom padding */}
      <div className="h-1" />
    </div>
  );
}
